import { z } from 'zod';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** One county's model-based obesity estimate from the CDC PLACES release. */
export interface CdcCountyObesityEstimate {
  /** County name on its own, such as "Boulder". */
  countyName: string;
  /** Two-letter state postal code, such as "CO". */
  stateAbbr: string;
  /** Share of adults with obesity, as a percentage. */
  percent: number;
  /** Population the estimate covers. */
  population: number;
}

/** The release's own national row, kept apart from the counties. */
export interface CdcNationalObesityEstimate {
  percent: number;
  population: number;
}

/** One response, split into county rows and the national row. */
export interface CdcCountyObesityPayload {
  /** Counties with an estimate, lowest share of obesity first. */
  counties: CdcCountyObesityEstimate[];
  /** The national row, or null when the response carried none. */
  national: CdcNationalObesityEstimate | null;
  /** The survey year the estimates describe, or null when no row carried one. */
  dataYear: number | null;
}

/** One release's estimates, folded down to the points a story leans on. */
export interface CdcCountyObesitySet {
  /** Counties with an estimate, lowest share of obesity first. */
  counties: CdcCountyObesityEstimate[];
  countyCount: number;
  lowest: CdcCountyObesityEstimate;
  highest: CdcCountyObesityEstimate;
  national: CdcNationalObesityEstimate;
  dataYear: number;
}

/**
 * Socrata resource for the CDC PLACES county release this adapter reads.
 *
 * The id is per release: the 2025 release, whose estimates come from the 2023
 * Behavioral Risk Factor Surveillance System (BRFSS) and the Census Bureau's
 * 2023 county population estimates. A new release gets a new id, so a story
 * pinned to this one keeps reading the numbers it was written against.
 */
export const CDC_PLACES_COUNTY_API_BASE = 'https://data.cdc.gov/resource/swc5-untb.json';

/** PLACES measure id for obesity among adults. */
export const CDC_PLACES_OBESITY_MEASURE_ID = 'OBESITY';

/**
 * PLACES value type id for crude prevalence.
 *
 * The same measure is also published age-adjusted, which would put two rows
 * per county. The crude row is the one a story about places can compare.
 */
export const CDC_PLACES_CRUDE_PREVALENCE_ID = 'CrdPrv';

/** State code the release uses for its own national row. */
export const CDC_PLACES_NATIONAL_STATE_CODE = 'US';

/** Row cap for one query. The release holds just under three thousand rows. */
export const CDC_PLACES_COUNTY_ROW_LIMIT = 5000;

/** Columns the adapter asks for. The release carries many more. */
const CDC_PLACES_COLUMNS = 'locationname,stateabbr,data_value,totalpopulation,year';

// Socrata sends every column as a string and leaves a key out when the value
// is missing, so each field is optional and the numbers are read defensively.
const CDC_PLACES_ROW_SCHEMA = z.object({
  locationname: z.string().optional(),
  stateabbr: z.string().optional(),
  data_value: z.string().optional(),
  totalpopulation: z.string().optional(),
  year: z.string().optional(),
});

const CDC_PLACES_RESPONSE_SCHEMA = z.array(CDC_PLACES_ROW_SCHEMA);

/** Reads a numeric field the release sends as a string, or undefined. */
function readCdcNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Builds the query URL for the county obesity estimates.
 *
 * One request covers the whole release. The endpoint is keyless, and the
 * filter holds the response to a single measure at crude prevalence, which
 * is what keeps it near three thousand rows rather than thirty thousand.
 *
 * @param options - an optional row cap, for tests
 * @returns the full query URL
 */
export function buildCdcCountyObesityUrl(options?: { rowLimit?: number }): string {
  const params = new URLSearchParams({
    $select: CDC_PLACES_COLUMNS,
    $where: `measureid='${CDC_PLACES_OBESITY_MEASURE_ID}' AND datavaluetypeid='${CDC_PLACES_CRUDE_PREVALENCE_ID}'`,
    $limit: String(options?.rowLimit ?? CDC_PLACES_COUNTY_ROW_LIMIT),
  });
  return `${CDC_PLACES_COUNTY_API_BASE}?${params.toString()}`;
}

/**
 * Sorts counties by their obesity estimate, lowest first.
 *
 * The state and county name break a tie, so the order is stable across runs
 * and a reader comparing two builds sees the same list.
 *
 * @param counties - county estimates in any order
 * @returns the same estimates, lowest share of obesity first
 */
export function sortCdcCountiesByPercent(
  counties: CdcCountyObesityEstimate[]
): CdcCountyObesityEstimate[] {
  return [...counties].sort((left, right) => {
    if (left.percent !== right.percent) {
      return left.percent - right.percent;
    }
    if (left.stateAbbr !== right.stateAbbr) {
      return left.stateAbbr.localeCompare(right.stateAbbr);
    }
    return left.countyName.localeCompare(right.countyName);
  });
}

/**
 * Parses one PLACES response into county rows and the national row.
 *
 * Two shapes in the release need handling before the rows are usable. A
 * county the model could not estimate arrives with no value at all, which is
 * how the smallest counties come back. The national row arrives with no
 * county name, and the only thing marking it is the "US" state code, so it is
 * pulled out separately rather than counted as a county.
 *
 * @param payload - the JSON body from the PLACES resource endpoint
 * @returns the county estimates, the national row, and the survey year
 */
export function parseCdcCountyObesityPayload(payload: unknown): CdcCountyObesityPayload {
  const parsed = CDC_PLACES_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError('cdc', parsed.error.message);
  }

  const counties: CdcCountyObesityEstimate[] = [];
  let national: CdcNationalObesityEstimate | null = null;
  let dataYear: number | null = null;

  for (const row of parsed.data) {
    const percent = readCdcNumber(row.data_value);
    const population = readCdcNumber(row.totalpopulation);
    const year = readCdcNumber(row.year);
    if (year !== undefined && Number.isInteger(year)) {
      dataYear = dataYear === null ? year : Math.max(dataYear, year);
    }
    if (percent === undefined || population === undefined) {
      continue;
    }
    if (row.stateabbr === CDC_PLACES_NATIONAL_STATE_CODE) {
      national = { percent, population };
      continue;
    }
    if (row.locationname === undefined || row.stateabbr === undefined) {
      continue;
    }
    counties.push({
      countyName: row.locationname,
      stateAbbr: row.stateabbr,
      percent,
      population,
    });
  }

  return { counties: sortCdcCountiesByPercent(counties), national, dataYear };
}

/**
 * Folds a parsed response into one set with its headline counties.
 *
 * @param payload - the parsed PLACES response
 * @returns the counties, the lowest and highest, and the national row
 */
export function buildCdcCountyObesitySet(payload: CdcCountyObesityPayload): CdcCountyObesitySet {
  const { counties, national, dataYear } = payload;
  const lowest = counties[0];
  const highest = counties[counties.length - 1];
  if (lowest === undefined || highest === undefined) {
    throw new UsSourceParseError('cdc', 'No county estimates in the response');
  }
  if (national === null) {
    throw new UsSourceParseError('cdc', 'The response carried no national row');
  }
  if (dataYear === null) {
    throw new UsSourceParseError('cdc', 'The response carried no survey year');
  }
  return { counties, countyCount: counties.length, lowest, highest, national, dataYear };
}

/**
 * Reads the county obesity estimates from CDC PLACES.
 *
 * Keyless, one request. There is no window to choose: the resource always
 * answers the release it belongs to.
 *
 * @param options - an optional fetch stub
 * @returns the county estimates, the national row, and the survey year
 */
export async function fetchCdcCountyObesity(options?: {
  fetchImpl?: typeof globalThis.fetch;
}): Promise<CdcCountyObesityPayload> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl(buildCdcCountyObesityUrl());
  if (!response.ok) {
    throw new UsSourceApiError('cdc', `HTTP ${response.status} reading the county estimates`);
  }
  return parseCdcCountyObesityPayload(await response.json());
}

/** CDC PLACES county obesity estimates, keyless. */
export const cdcCountyObesityAdapter: UsDataAdapter<CdcCountyObesitySet> = {
  id: 'cdc-county-obesity',
  name: 'CDC county adult obesity',
  auth: 'none',
  description:
    'Model-based share of adults with obesity in each US county, from the CDC PLACES release.',
  fetchLive: async (options) =>
    buildCdcCountyObesitySet(
      await fetchCdcCountyObesity({
        ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      })
    ),
  parse: (payload) => buildCdcCountyObesitySet(parseCdcCountyObesityPayload(payload)),
  loadFixture: () =>
    buildCdcCountyObesitySet(
      parseCdcCountyObesityPayload(readFixtureJson('cdc-county-obesity-2026-09-25.json'))
    ),
};
