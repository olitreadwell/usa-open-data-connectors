import { z } from 'zod';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** One earthquake, as the USGS catalogue reports it. */
export interface UsgsEarthquake {
  id: string;
  magnitude: number;
  /** Free-text place, such as "5 km S of Pāhala, Hawaii". */
  place: string;
  /** Origin time in milliseconds since the epoch. */
  timeMs: number;
  depthKm: number;
  /** The agency's own event page for this earthquake. */
  url: string;
}

/** A set of earthquakes with the points a story leans on. */
export interface UsgsEarthquakeCatalogue {
  earthquakes: UsgsEarthquake[];
  count: number;
  strongest: UsgsEarthquake;
  deepest: UsgsEarthquake;
  earliest: UsgsEarthquake;
  latest: UsgsEarthquake;
}

/** The latitude and longitude box a catalogue query filters on. */
export interface UsgsEarthquakeBounds {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

/** The window, magnitude floor, and box one catalogue query reads. */
export interface UsgsEarthquakeQuery {
  /** Start of the window, as YYYY-MM-DD. */
  startDate: string;
  /** End of the window, as YYYY-MM-DD. The catalogue excludes the end date. */
  endDate: string;
  minMagnitude: number;
  bounds: UsgsEarthquakeBounds;
}

/** Base URL for the USGS earthquake catalogue (FDSN event query). */
export const USGS_EARTHQUAKE_API_BASE = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

/** The box the Hawaii adapter reads: the main Hawaiian islands and the water around them. */
export const USGS_HAWAII_BOUNDS: UsgsEarthquakeBounds = {
  minLatitude: 18.5,
  maxLatitude: 22.5,
  minLongitude: -161,
  maxLongitude: -154,
};

/** Magnitude floor for the Hawaii adapter. */
export const USGS_HAWAII_MIN_MAGNITUDE = 2.5;

/** Days the Hawaii adapter's rolling window covers. */
export const USGS_ROLLING_WINDOW_DAYS = 365;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const USGS_FEATURE_SCHEMA = z.object({
  id: z.string(),
  properties: z.object({
    mag: z.number().nullable(),
    place: z.string().nullable(),
    time: z.number(),
    url: z.string(),
    type: z.string(),
  }),
  geometry: z.object({
    coordinates: z.array(z.number()).min(2),
  }),
});

const USGS_RESPONSE_SCHEMA = z.object({
  type: z.literal('FeatureCollection'),
  metadata: z.object({
    status: z.number(),
    count: z.number().optional(),
  }),
  features: z.array(USGS_FEATURE_SCHEMA),
});

/** The catalogue's own label for a tectonic earthquake. */
const USGS_EARTHQUAKE_TYPE = 'earthquake';

/**
 * Builds the catalogue query URL for one window.
 *
 * The catalogue is keyless and public domain. The query asks for GeoJSON,
 * ordered oldest first is left to the parser, and the box and magnitude floor
 * come from the caller.
 *
 * @param query - the window, magnitude floor, and box to read
 * @returns the full query URL
 */
export function buildUsgsEarthquakeUrl(query: UsgsEarthquakeQuery): string {
  const params = new URLSearchParams({
    format: 'geojson',
    starttime: query.startDate,
    endtime: query.endDate,
    minmagnitude: String(query.minMagnitude),
    minlatitude: String(query.bounds.minLatitude),
    maxlatitude: String(query.bounds.maxLatitude),
    minlongitude: String(query.bounds.minLongitude),
    maxlongitude: String(query.bounds.maxLongitude),
    orderby: 'time',
  });
  return `${USGS_EARTHQUAKE_API_BASE}?${params.toString()}`;
}

/**
 * Parses a catalogue response into earthquakes, oldest first.
 *
 * The catalogue holds more than tectonic earthquakes: quarry blasts,
 * explosions, and ice quakes sit in the same feed, and a row can arrive with
 * no magnitude. Both are dropped, so every record here is an earthquake with
 * a magnitude and a depth.
 *
 * @param payload - the GeoJSON body from the event query endpoint
 * @returns the earthquakes in the window, oldest first
 */
export function parseUsgsEarthquakes(payload: unknown): UsgsEarthquake[] {
  const parsed = USGS_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError('usgs', parsed.error.message);
  }
  if (parsed.data.metadata.status !== 200) {
    throw new UsSourceApiError('usgs', `catalogue status ${parsed.data.metadata.status}`);
  }

  const earthquakes: UsgsEarthquake[] = [];
  for (const feature of parsed.data.features) {
    const { mag, place, time, url, type } = feature.properties;
    if (type !== USGS_EARTHQUAKE_TYPE || mag === null || place === null) {
      continue;
    }
    const depthKm = feature.geometry.coordinates[2];
    if (typeof depthKm !== 'number' || !Number.isFinite(depthKm) || !Number.isFinite(time)) {
      continue;
    }
    earthquakes.push({
      id: feature.id,
      magnitude: mag,
      place,
      timeMs: time,
      depthKm,
      url,
    });
  }

  return sortEarthquakesOldestFirst(earthquakes);
}

/**
 * Sorts earthquakes oldest first, with the event id breaking a tie. The
 * catalogue answers newest first, and a caller reading `earthquakes[0]`
 * should get the start of the window.
 *
 * @param earthquakes - earthquakes in any order
 * @returns the same earthquakes, oldest first
 */
export function sortEarthquakesOldestFirst(earthquakes: UsgsEarthquake[]): UsgsEarthquake[] {
  return [...earthquakes].sort((left, right) => {
    if (left.timeMs !== right.timeMs) {
      return left.timeMs - right.timeMs;
    }
    return left.id.localeCompare(right.id);
  });
}

/**
 * Folds earthquakes into one catalogue with its headline points.
 *
 * @param earthquakes - earthquakes in any order
 * @returns the catalogue, ordered oldest first, plus the strongest and deepest
 */
export function buildUsgsEarthquakeCatalogue(
  earthquakes: UsgsEarthquake[]
): UsgsEarthquakeCatalogue {
  const ordered = sortEarthquakesOldestFirst(earthquakes);
  const earliest = ordered[0];
  const latest = ordered[ordered.length - 1];
  if (earliest === undefined || latest === undefined) {
    throw new UsSourceParseError('usgs', 'No earthquakes in the catalogue');
  }

  let strongest = earliest;
  let deepest = earliest;
  for (const earthquake of ordered) {
    if (earthquake.magnitude > strongest.magnitude) {
      strongest = earthquake;
    }
    if (earthquake.depthKm > deepest.depthKm) {
      deepest = earthquake;
    }
  }

  return {
    earthquakes: ordered,
    count: ordered.length,
    strongest,
    deepest,
    earliest,
    latest,
  };
}

/**
 * Reads one window of the catalogue.
 *
 * Keyless. The catalogue answers a window of any length, so a caller can ask
 * for a single year or for the whole record.
 *
 * @param query - the window, magnitude floor, and box to read
 * @param options - an optional fetch stub
 * @returns every earthquake in the window, oldest first
 */
export async function fetchUsgsEarthquakes(
  query: UsgsEarthquakeQuery,
  options?: { fetchImpl?: typeof globalThis.fetch }
): Promise<UsgsEarthquake[]> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl(buildUsgsEarthquakeUrl(query));
  if (!response.ok) {
    throw new UsSourceApiError('usgs', `HTTP ${response.status} reading the catalogue`);
  }
  return parseUsgsEarthquakes(await response.json());
}

/**
 * The window the Hawaii adapter reads by default: the last 365 days, up to today.
 *
 * @param now - the day to count back from, for tests
 * @returns the rolling window, in the plain dates the catalogue wants
 */
export function usgsHawaiiRollingWindow(now: Date = new Date()): UsgsEarthquakeQuery {
  return {
    startDate: new Date(now.getTime() - USGS_ROLLING_WINDOW_DAYS * MS_PER_DAY)
      .toISOString()
      .slice(0, 10),
    endDate: now.toISOString().slice(0, 10),
    minMagnitude: USGS_HAWAII_MIN_MAGNITUDE,
    bounds: USGS_HAWAII_BOUNDS,
  };
}

/** Earthquakes near Hawaii, magnitude 2.5 and above, keyless. */
export const usgsHawaiiEarthquakesAdapter: UsDataAdapter<UsgsEarthquakeCatalogue> = {
  id: 'usgs-hawaii-earthquakes',
  name: 'USGS earthquakes around Hawaii',
  auth: 'none',
  description: 'Earthquakes of magnitude 2.5 and above near the Hawaiian islands.',
  fetchLive: async (options) =>
    buildUsgsEarthquakeCatalogue(
      await fetchUsgsEarthquakes(usgsHawaiiRollingWindow(), {
        ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      })
    ),
  parse: (payload) => buildUsgsEarthquakeCatalogue(parseUsgsEarthquakes(payload)),
  loadFixture: () =>
    buildUsgsEarthquakeCatalogue(
      parseUsgsEarthquakes(readFixtureJson('usgs-hawaii-earthquakes.json'))
    ),
};
