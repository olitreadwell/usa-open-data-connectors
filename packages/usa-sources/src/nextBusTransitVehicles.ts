import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';

import { UsSourceParseError } from './errors.js';
import { readFixtureText } from './fixtures.js';
import { httpGet } from './http.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the NextBus transit vehicle source. */
export const NEXTBUS_TRANSIT_VEHICLES_SOURCE_ID = 'nextbus-transit-vehicles';

/** Base URL for the keyless NextBus XML feed. */
export const NEXTBUS_XML_FEED_BASE = 'https://retro.umoiq.com/service/publicXMLFeed';

/** Agency tag for the Portland Streetcar on the NextBus feed. */
export const NEXTBUS_PORTLAND_STREETCAR_AGENCY_TAG = 'portland-sc';

/** Route tag for the Portland Streetcar NS line. */
export const NEXTBUS_PORTLAND_STREETCAR_ROUTE_TAG = '193';

/** The agency and route this adapter reads by default. */
export const NEXTBUS_PORTLAND_STREETCAR_QUERY = {
  agencyTag: NEXTBUS_PORTLAND_STREETCAR_AGENCY_TAG,
  routeTag: NEXTBUS_PORTLAND_STREETCAR_ROUTE_TAG,
} as const;

/** Committed snapshot, so a build works when the NextBus feed is unreachable. */
const NEXTBUS_VEHICLE_FIXTURE_FILENAME = 'nextbus-portland-streetcar-vehicles-2026-10-22.xml';

/** One agency and route to read from the NextBus feed. */
export interface NextBusVehicleQuery {
  /** Agency tag, e.g. "portland-sc". */
  agencyTag: string;
  /** Route tag, e.g. "193". */
  routeTag: string;
}

/** One vehicle report from the NextBus feed. */
export interface NextBusVehicle {
  /** Vehicle number the agency paints on the streetcar, e.g. "022". */
  vehicleId: string;
  /** Route tag the vehicle is running, e.g. "193". */
  routeTag: string;
  /** Direction and pattern tag, or an empty string when the feed omits it. */
  directionTag: string;
  /** Latitude in decimal degrees. */
  latitude: number;
  /** Longitude in decimal degrees. */
  longitude: number;
  /** Compass heading in degrees, or null when the feed omits it. */
  headingDegrees: number | null;
  /** Reported speed in kilometres per hour, or null when the feed omits it. */
  speedKmPerHour: number | null;
  /** How long before the snapshot the vehicle reported, in seconds. */
  secondsSinceReport: number;
  /** Whether the agency says the vehicle is running its published schedule. */
  predictable: boolean;
}

/** One moment of vehicle positions on a NextBus route. */
export interface NextBusVehicleSnapshot {
  /** Agency tag that was read. */
  agencyTag: string;
  /** Route tag that was read. */
  routeTag: string;
  /** When the feed assembled the snapshot, in milliseconds since the Unix epoch. */
  observedAtEpochMs: number;
  /** One report per vehicle. */
  vehicles: NextBusVehicle[];
  /** How many vehicles the feed carried. */
  vehicleCount: number;
  /** How many vehicles the agency marks predictable. */
  predictableVehicleCount: number;
  /** Mean reported speed, in kilometres per hour. */
  averageSpeedKmPerHour: number;
  /** Age of the freshest report, in seconds, or null when no vehicle reported. */
  newestReportSeconds: number | null;
  /** Age of the oldest report, in seconds, or null when no vehicle reported. */
  oldestReportSeconds: number | null;
}

// The feed carries every value as an XML attribute, so a number arrives as a
// string and a boolean arrives as "true" or "false".
const NEXTBUS_VEHICLE_SCHEMA = z.object({
  id: z.string().min(1),
  routeTag: z.string().min(1),
  dirTag: z.string().optional(),
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  secsSinceReport: z.coerce.number().int().nonnegative(),
  predictable: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true'),
  heading: z.coerce.number().optional(),
  speedKmHr: z.coerce.number().nonnegative().optional(),
});

const NEXTBUS_BODY_SCHEMA = z.object({
  body: z.object({
    lastTime: z.object({
      time: z.coerce.number().int().positive(),
    }),
    vehicle: z.union([NEXTBUS_VEHICLE_SCHEMA, z.array(NEXTBUS_VEHICLE_SCHEMA)]).optional(),
  }),
});

const NEXTBUS_ERROR_SCHEMA = z.object({
  body: z.object({
    Error: z.object({
      '#text': z.string().optional(),
    }),
  }),
});

/** Picks the message out of a NextBus error body, or null when the body is not one. */
function nextBusErrorMessage(payload: unknown): string | null {
  const parsed = NEXTBUS_ERROR_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    return null;
  }
  return parsed.data.body.Error['#text'] ?? 'The feed rejected the request';
}

/** Means one number across the values that carry one, rounded to one decimal. */
function meanOrZero(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(1));
}

/**
 * Builds the request URL for vehicle locations on one agency route.
 *
 * The feed is keyless. `t=0` asks for every report the feed still holds for
 * the route, which is the current set of vehicles.
 *
 * @param query - the agency and route to read
 * @returns the full request URL
 */
export function buildNextBusVehicleUrl(query: NextBusVehicleQuery): string {
  const params = new URLSearchParams({
    command: 'vehicleLocations',
    a: query.agencyTag,
    r: query.routeTag,
    t: '0',
  });
  return `${NEXTBUS_XML_FEED_BASE}?${params.toString()}`;
}

/**
 * Parses one NextBus vehicle response into the positions and their summary.
 *
 * The parser keeps XML attributes as strings, and zod checks every value that
 * reaches the snapshot. An error body, a missing timestamp, or a position
 * outside the map stops the parse.
 *
 * @param payload - the XML body from the NextBus feed
 * @param query - the agency and route the request asked for
 * @returns one report per vehicle, plus counts and report ages
 */
export function parseNextBusVehiclePayload(
  payload: unknown,
  query: NextBusVehicleQuery = NEXTBUS_PORTLAND_STREETCAR_QUERY
): NextBusVehicleSnapshot {
  let parsed: unknown;
  try {
    parsed = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      trimValues: true,
    }).parse(String(payload));
  } catch (error) {
    throw new UsSourceParseError(
      NEXTBUS_TRANSIT_VEHICLES_SOURCE_ID,
      'The response was not valid XML',
      { cause: error }
    );
  }

  const errorMessage = nextBusErrorMessage(parsed);
  if (errorMessage !== null) {
    throw new UsSourceParseError(NEXTBUS_TRANSIT_VEHICLES_SOURCE_ID, errorMessage);
  }

  const body = NEXTBUS_BODY_SCHEMA.safeParse(parsed);
  if (!body.success) {
    throw new UsSourceParseError(NEXTBUS_TRANSIT_VEHICLES_SOURCE_ID, body.error.message);
  }

  const rawVehicles = body.data.body.vehicle;
  const vehicles: NextBusVehicle[] = (
    rawVehicles === undefined ? [] : Array.isArray(rawVehicles) ? rawVehicles : [rawVehicles]
  ).map((vehicle) => ({
    vehicleId: vehicle.id,
    routeTag: vehicle.routeTag,
    directionTag: vehicle.dirTag ?? '',
    latitude: vehicle.lat,
    longitude: vehicle.lon,
    headingDegrees: vehicle.heading ?? null,
    speedKmPerHour: vehicle.speedKmHr ?? null,
    secondsSinceReport: vehicle.secsSinceReport,
    predictable: vehicle.predictable,
  }));

  const reportAges = vehicles.map((vehicle) => vehicle.secondsSinceReport);
  const speeds = vehicles
    .map((vehicle) => vehicle.speedKmPerHour)
    .filter((speed): speed is number => speed !== null);

  return {
    agencyTag: query.agencyTag,
    routeTag: query.routeTag,
    observedAtEpochMs: body.data.body.lastTime.time,
    vehicles,
    vehicleCount: vehicles.length,
    predictableVehicleCount: vehicles.filter((vehicle) => vehicle.predictable).length,
    averageSpeedKmPerHour: meanOrZero(speeds),
    newestReportSeconds: reportAges.length === 0 ? null : Math.min(...reportAges),
    oldestReportSeconds: reportAges.length === 0 ? null : Math.max(...reportAges),
  };
}

/**
 * Reads the current vehicle positions on a NextBus route.
 *
 * One keyless request returns the streetcars the agency is reporting right now,
 * with their position, heading, speed, and report age.
 *
 * @param options - the agency, route, and an optional fetch stub
 * @returns one report per vehicle, plus counts and report ages
 */
export async function fetchNextBusVehicles(options?: {
  agencyTag?: string;
  routeTag?: string;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<NextBusVehicleSnapshot> {
  const query: NextBusVehicleQuery = {
    agencyTag: options?.agencyTag ?? NEXTBUS_PORTLAND_STREETCAR_AGENCY_TAG,
    routeTag: options?.routeTag ?? NEXTBUS_PORTLAND_STREETCAR_ROUTE_TAG,
  };
  const response = await httpGet(
    NEXTBUS_TRANSIT_VEHICLES_SOURCE_ID,
    buildNextBusVehicleUrl(query),
    options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
  );
  return parseNextBusVehiclePayload(await response.text(), query);
}

/** Live positions on the Portland Streetcar NS line, keyless through the NextBus feed. */
export const nextBusTransitVehiclesAdapter: UsDataAdapter<NextBusVehicleSnapshot> = {
  id: NEXTBUS_TRANSIT_VEHICLES_SOURCE_ID,
  name: 'NextBus transit vehicles',
  auth: 'none',
  description:
    'Live vehicle positions on the Portland Streetcar NS line, one of the agencies on the keyless NextBus XML feed, with latitude, longitude, heading, speed, and report age.',
  fetchLive: async (options) =>
    fetchNextBusVehicles(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  parse: (payload) => parseNextBusVehiclePayload(payload),
  loadFixture: () => parseNextBusVehiclePayload(readFixtureText(NEXTBUS_VEHICLE_FIXTURE_FILENAME)),
};
