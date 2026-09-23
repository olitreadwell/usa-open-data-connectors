import { z } from 'zod';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** One month of a BLS time series. */
export interface BlsObservation {
  seriesId: string;
  year: number;
  /** BLS period code: M01 to M12 for months, M13 for an annual average. */
  period: string;
  periodName: string;
  value: number;
}

/** Rolled-up facts about one BLS series. */
export interface BlsSeries {
  seriesId: string;
  points: BlsObservation[];
  first: BlsObservation;
  latest: BlsObservation;
  peak: BlsObservation;
  lowest: BlsObservation;
  changeFromPeak: number;
  changeFromFirst: number;
}

/**
 * The national unemployment rate, seasonally adjusted. Published monthly by
 * the Bureau of Labor Statistics, the agency that runs the Current Population
 * Survey.
 */
export const US_UNEMPLOYMENT_SERIES_ID = 'LNS14000000';

/** Human-readable name for the unemployment series. */
export const US_UNEMPLOYMENT_SERIES_LABEL = 'US unemployment rate, seasonally adjusted';

/** Base URL for the BLS public data API. */
export const BLS_API_BASE = 'https://api.bls.gov/publicAPI/v2/timeseries/data';

/**
 * The BLS public API refuses a request spanning more than ten years, so a
 * longer range has to be assembled from several windows.
 */
export const BLS_MAX_YEARS_PER_REQUEST = 10;

const BLS_PERIOD_CODE = new RegExp('^M(0[1-9]|1[0-2])$');

const BLS_OBSERVATION_SCHEMA = z.object({
  year: z.string(),
  period: z.string(),
  periodName: z.string(),
  value: z.string(),
});

const BLS_SERIES_SCHEMA = z.object({
  seriesID: z.string(),
  data: z.array(BLS_OBSERVATION_SCHEMA),
});

const BLS_RESPONSE_SCHEMA = z.object({
  status: z.string(),
  message: z.array(z.string()).optional(),
  Results: z.object({
    series: z.array(BLS_SERIES_SCHEMA),
  }),
});

/**
 * Parses a BLS timeseries payload into flat observations.
 *
 * The annual-average period (M13) is dropped, because mixing it with the
 * twelve monthly points would put two values on the same year.
 *
 * @param payload - the JSON body from the BLS timeseries endpoint
 * @returns one observation per series per month
 */
export function parseBlsObservations(payload: unknown): BlsObservation[] {
  const parsed = BLS_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError('bls', parsed.error.message);
  }
  if (parsed.data.status !== 'REQUEST_SUCCEEDED') {
    throw new UsSourceApiError(
      'bls',
      `${parsed.data.status}: ${(parsed.data.message ?? []).join('; ')}`
    );
  }

  const observations: BlsObservation[] = [];
  for (const series of parsed.data.Results.series) {
    for (const row of series.data) {
      if (!BLS_PERIOD_CODE.test(row.period)) {
        continue;
      }
      const year = Number(row.year);
      const value = Number(row.value);
      if (!Number.isInteger(year) || !Number.isFinite(value)) {
        continue;
      }
      observations.push({
        seriesId: series.seriesID,
        year,
        period: row.period,
        periodName: row.periodName,
        value,
      });
    }
  }
  return sortObservations(observations);
}

/**
 * Sorts an observation list oldest first. The agency answers newest first,
 * and a caller reading `points[0]` should get the start of the series.
 *
 * @param observations - observations in any order
 * @returns the same observations, oldest first
 */
function sortObservations(observations: BlsObservation[]): BlsObservation[] {
  return [...observations].sort((left, right) => {
    if (left.year !== right.year) {
      return left.year - right.year;
    }
    return left.period.localeCompare(right.period);
  });
}

/**
 * Folds observations into one series with its high, low, and end points.
 *
 * @param observations - monthly observations, in any order
 * @param seriesId - the series to keep; rows from other series are ignored
 * @returns the ordered series with its headline points
 */
export function buildBlsSeries(observations: BlsObservation[], seriesId: string): BlsSeries {
  const points = sortObservations(
    observations.filter((observation) => observation.seriesId === seriesId)
  );
  const first = points[0];
  const latest = points[points.length - 1];
  if (first === undefined || latest === undefined) {
    throw new UsSourceParseError('bls', `No observations for series ${seriesId}`);
  }

  let peak = first;
  let lowest = first;
  for (const point of points) {
    if (point.value > peak.value) {
      peak = point;
    }
    if (point.value < lowest.value) {
      lowest = point;
    }
  }

  return {
    seriesId,
    points,
    first,
    latest,
    peak,
    lowest,
    changeFromPeak: latest.value - peak.value,
    changeFromFirst: latest.value - first.value,
  };
}

/** Reads one ten-year-or-shorter window from the BLS API. */
async function fetchBlsWindow(
  seriesId: string,
  startYear: number,
  endYear: number,
  fetchImpl: typeof globalThis.fetch
): Promise<BlsObservation[]> {
  const url = `${BLS_API_BASE}/${seriesId}?startyear=${startYear}&endyear=${endYear}`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new UsSourceApiError('bls', `HTTP ${response.status} reading series ${seriesId}`);
  }
  return parseBlsObservations(await response.json());
}

/**
 * Reads a BLS series across a range of years, splitting the range into
 * windows the API will accept.
 *
 * Keyless. The public API allows 25 series queries a day without a key and
 * 500 with one, so a long range costs more than one call.
 *
 * @param seriesId - the BLS series id, such as LNS14000000
 * @param options - the year range to read, and an optional fetch stub
 * @returns every monthly observation in the range, oldest first
 */
export async function fetchBlsSeries(
  seriesId: string,
  options: { startYear: number; endYear: number; fetchImpl?: typeof globalThis.fetch }
): Promise<BlsSeries> {
  const { startYear, endYear } = options;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const observations: BlsObservation[] = [];

  for (
    let windowStart = startYear;
    windowStart <= endYear;
    windowStart += BLS_MAX_YEARS_PER_REQUEST
  ) {
    const windowEnd = Math.min(windowStart + BLS_MAX_YEARS_PER_REQUEST - 1, endYear);
    observations.push(...(await fetchBlsWindow(seriesId, windowStart, windowEnd, fetchImpl)));
  }

  return buildBlsSeries(observations, seriesId);
}

/** National unemployment rate adapter, keyless. */
export const blsUnemploymentAdapter: UsDataAdapter<BlsSeries> = {
  id: 'bls-unemployment-rate',
  name: US_UNEMPLOYMENT_SERIES_LABEL,
  auth: 'none',
  description: 'Monthly national unemployment rate from the Current Population Survey.',
  fetchLive: async (options) => {
    const endYear = new Date().getUTCFullYear();
    return fetchBlsSeries(US_UNEMPLOYMENT_SERIES_ID, {
      startYear: endYear - 19,
      endYear,
      ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    });
  },
  parse: (payload) => buildBlsSeries(parseBlsObservations(payload), US_UNEMPLOYMENT_SERIES_ID),
  loadFixture: () =>
    buildBlsSeries(
      parseBlsObservations(readFixtureJson('bls-unemployment-rate.json')),
      US_UNEMPLOYMENT_SERIES_ID
    ),
};
