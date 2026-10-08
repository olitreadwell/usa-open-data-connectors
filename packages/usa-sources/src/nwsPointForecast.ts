import { z } from 'zod';

import { UsSourceParseError } from './errors.js';
import { httpGet } from './http.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the National Weather Service point-forecast source. */
export const NWS_POINT_FORECAST_SOURCE_ID = 'nws-point-forecast';

/**
 * User-Agent header the National Weather Service asks every caller to send.
 *
 * The service returns an error page to a request that does not identify its
 * operator, so the adapter sends a descriptive name and a contact address on
 * every call. A real deployment should override the contact with its own.
 */
export const NWS_USER_AGENT =
  'usa-open-data-connectors (https://github.com/olitreadwell/usa-open-data-connectors)';

/**
 * One forecast grid point, the service's lookup for a latitude and longitude.
 *
 * The point does not carry the forecast itself. It carries the grid the
 * service snapped the coordinate to, plus the URLs that lead to the forecast,
 * the hourly forecast, the raw grid data, and the nearby observations.
 */
export interface NwsForecastPoint {
  /** Latitude of the point, as the service echoed it back. */
  latitude: number;
  /** Longitude of the point, as the service echoed it back. */
  longitude: number;
  /** City or place the point falls in, e.g. "Washington". */
  city: string;
  /** Two-letter state code the point falls in, e.g. "DC". */
  state: string;
  /** Forecast office code, e.g. "LWX". */
  gridId: string;
  gridX: number;
  gridY: number;
  /** URL of the forecast office that covers the point. */
  forecastOfficeUrl: string;
  /** URL of the daily forecast for the point. */
  forecastUrl: string;
  /** URL of the hourly forecast for the point. */
  forecastHourlyUrl: string;
  /** URL of the raw forecast grid data behind the point. */
  forecastGridDataUrl: string;
  /** URL of the observation stations near the point. */
  observationStationsUrl: string;
  /** Timezone the office uses, e.g. "America/New_York". */
  timeZone: string;
  /** Radar station code the office uses, or null when the service names none. */
  radarStation: string | null;
  /** URL of the county zone the point falls in. */
  countyUrl: string;
  /** URL of the fire weather zone the point falls in. */
  fireWeatherZoneUrl: string;
}

/** Base URL for the National Weather Service API. */
export const NWS_API_BASE = 'https://api.weather.gov';

/** Path of the point lookup that resolves a coordinate to a forecast grid. */
export const NWS_POINT_FORECAST_PATH = '/points';

/** Latitude of the default point, the Washington Monument in Washington, DC. */
export const NWS_DEFAULT_LATITUDE = 38.8894;

/** Longitude of the default point, the Washington Monument in Washington, DC. */
export const NWS_DEFAULT_LONGITUDE = -77.0352;

/** Committed snapshot, so a build works when the weather service is unreachable. */
const NWS_POINT_FORECAST_FIXTURE_FILENAME = 'nws-point-forecast-2026-10-05.json';

const NWS_PROPERTIES_SCHEMA = z.object({
  city: z.string().optional(),
  state: z.string().optional(),
  gridId: z.string().optional(),
  gridX: z.number().optional(),
  gridY: z.number().optional(),
  forecastOffice: z.string().optional(),
  forecast: z.string().optional(),
  forecastHourly: z.string().optional(),
  forecastGridData: z.string().optional(),
  observationStations: z.string().optional(),
  timeZone: z.string().optional(),
  radarStation: z.string().optional(),
  county: z.string().optional(),
  fireWeatherZone: z.string().optional(),
  relativeLocation: z
    .object({
      properties: z
        .object({ city: z.string().optional(), state: z.string().optional() })
        .optional(),
    })
    .optional(),
});

const NWS_POINT_FORECAST_SCHEMA = z.object({
  type: z.string().optional(),
  geometry: z.object({ coordinates: z.array(z.number()).optional() }).optional(),
  properties: NWS_PROPERTIES_SCHEMA.optional(),
});

/**
 * Builds the request URL for one point lookup.
 *
 * The endpoint is keyless. Coordinates are written the way the service takes
 * them, latitude first and longitude second, with no space after the comma.
 *
 * @param latitude - the latitude to look up
 * @param longitude - the longitude to look up
 * @returns the full request URL
 */
export function buildNwsPointUrl(
  latitude: number = NWS_DEFAULT_LATITUDE,
  longitude: number = NWS_DEFAULT_LONGITUDE
): string {
  return `${NWS_API_BASE}${NWS_POINT_FORECAST_PATH}/${latitude},${longitude}`;
}

/**
 * Parses one point lookup into the grid point and its forecast URLs.
 *
 * The service answers with a GeoJSON feature. A response whose type is not a
 * feature or whose coordinates are not a latitude and longitude pair is a
 * changed shape and stops the parse. The forecast and grid fields must also
 * be present, because a point without them is not usable as a forecast entry.
 *
 * @param payload - the JSON body from the weather service
 * @returns the grid point, its place, and the URLs that lead to the forecast
 */
export function parseNwsPointForecastPayload(payload: unknown): NwsForecastPoint {
  const parsed = NWS_POINT_FORECAST_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(NWS_POINT_FORECAST_SOURCE_ID, parsed.error.message);
  }
  if (parsed.data.type !== 'Feature') {
    throw new UsSourceParseError(
      NWS_POINT_FORECAST_SOURCE_ID,
      `The response is not a GeoJSON feature: ${parsed.data.type ?? 'missing type'}`
    );
  }

  const coordinates = parsed.data.geometry?.coordinates;
  const longitude = coordinates?.[0];
  const latitude = coordinates?.[1];
  if (longitude === undefined || latitude === undefined) {
    throw new UsSourceParseError(
      NWS_POINT_FORECAST_SOURCE_ID,
      'The response carried no coordinate pair'
    );
  }

  const properties = parsed.data.properties;
  if (
    properties?.gridId === undefined ||
    properties.gridX === undefined ||
    properties.gridY === undefined ||
    properties.forecast === undefined ||
    properties.forecastOffice === undefined
  ) {
    throw new UsSourceParseError(
      NWS_POINT_FORECAST_SOURCE_ID,
      'The response carried no forecast grid for the point'
    );
  }

  return {
    latitude,
    longitude,
    city: properties.relativeLocation?.properties?.city ?? '',
    state: properties.relativeLocation?.properties?.state ?? '',
    gridId: properties.gridId,
    gridX: properties.gridX,
    gridY: properties.gridY,
    forecastOfficeUrl: properties.forecastOffice,
    forecastUrl: properties.forecast,
    forecastHourlyUrl: properties.forecastHourly ?? '',
    forecastGridDataUrl: properties.forecastGridData ?? '',
    observationStationsUrl: properties.observationStations ?? '',
    timeZone: properties.timeZone ?? '',
    radarStation: properties.radarStation ?? null,
    countyUrl: properties.county ?? '',
    fireWeatherZoneUrl: properties.fireWeatherZone ?? '',
  };
}

/**
 * Reads one forecast grid point from the weather service.
 *
 * The service asks every caller to identify itself, so the request carries a
 * descriptive User-Agent header. One keyless request resolves the coordinate
 * to a grid point and returns the URLs that lead to the forecast.
 *
 * @param options - an optional latitude and longitude, plus a fetch stub
 * @returns the grid point, its place, and the URLs that lead to the forecast
 */
export async function fetchNwsPointForecast(options?: {
  latitude?: number;
  longitude?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<NwsForecastPoint> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const url = buildNwsPointUrl(
    options?.latitude ?? NWS_DEFAULT_LATITUDE,
    options?.longitude ?? NWS_DEFAULT_LONGITUDE
  );
  const response = await httpGet(NWS_POINT_FORECAST_SOURCE_ID, url, {
    fetchImpl,
    headers: { 'User-Agent': NWS_USER_AGENT },
  });
  return parseNwsPointForecastPayload(await response.json());
}

/** National Weather Service forecast grid point for a coordinate, keyless. */
export const nwsPointForecastAdapter: UsDataAdapter<NwsForecastPoint> = {
  id: NWS_POINT_FORECAST_SOURCE_ID,
  name: 'NWS point forecast',
  auth: 'none',
  description:
    'The National Weather Service forecast grid point for a latitude and longitude, with the URLs that lead to the daily and hourly forecast.',
  fetchLive: async (options) =>
    fetchNwsPointForecast(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  parse: (payload) => parseNwsPointForecastPayload(payload),
  loadFixture: () =>
    parseNwsPointForecastPayload(readFixtureJson(NWS_POINT_FORECAST_FIXTURE_FILENAME)),
};
