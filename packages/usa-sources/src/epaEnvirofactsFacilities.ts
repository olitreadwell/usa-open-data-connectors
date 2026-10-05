import { z } from 'zod';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the EPA Envirofacts facility source. */
export const EPA_ENVIROFACTS_FACILITIES_SOURCE_ID = 'epa-envirofacts-facilities';

/** One Toxics Release Inventory facility from the Envirofacts service. */
export interface EpaEnvirofactsFacility {
  /** The EPA's own TRI facility id. */
  facilityId: string;
  /** Facility name as the register holds it. */
  facilityName: string;
  /** Street address of the site. */
  streetAddress: string;
  /** City of the site. */
  city: string;
  /** County the site sits in, spelled the way the service spells it. */
  countyName: string;
  /** Two-letter state code the service reports for the site. */
  stateAbbr: string;
  /** Postal code of the site. */
  postalCode: string;
  /** EPA region number as the service reports it, for example "1". */
  region: string;
  /** True when the service marks the facility as closed. */
  closed: boolean;
  /** Parent company name, or null when the service reports "NA" or leaves it out. */
  parentCompanyName: string | null;
}

/** One county and how many facilities in the page sit there. */
export interface EpaEnvirofactsCountyCount {
  countyName: string;
  facilityCount: number;
}

/** One page of facilities, folded for a story. */
export interface EpaEnvirofactsFacilityPage {
  facilities: EpaEnvirofactsFacility[];
  facilityCount: number;
  /** Facilities the service does not mark as closed. */
  openCount: number;
  /** Facilities the service marks as closed. */
  closedCount: number;
  /** Counties the facilities in the page sit in, most facilities first. */
  counties: EpaEnvirofactsCountyCount[];
}

/** Base URL for the EPA Envirofacts service. */
export const EPA_ENVIROFACTS_API_BASE = 'https://data.epa.gov/efservice';

/** Envirofacts table that holds the Toxics Release Inventory facility records. */
export const EPA_ENVIROFACTS_TABLE = 'TRI_FACILITY';

/** Envirofacts column the state filter reads. */
export const EPA_ENVIROFACTS_STATE_COLUMN = 'STATE_ABBR';

/** State the default URL asks for. */
export const EPA_ENVIROFACTS_STATE_ABBR = 'RI';

/** Row window one request reads, the first ten rows. */
export const EPA_ENVIROFACTS_ROW_WINDOW = '0:9';

/** Committed snapshot, so a build works when the Envirofacts host is unreachable. */
const EPA_ENVIROFACTS_FIXTURE_FILENAME = 'epa-envirofacts-facilities-2026-10-05.json';

// The service answers with a bare JSON array, and a rejected query answers
// with a body of {error}. The filter segment takes the value on its own: an
// "equals" operator is accepted in the URL but never narrows the rows, so the
// URL builder below does not use one.
const EPA_ENVIROFACTS_FACILITY_SCHEMA = z.object({
  tri_facility_id: z.string(),
  facility_name: z.string(),
  street_address: z.string().nullable().optional(),
  city_name: z.string().nullable().optional(),
  county_name: z.string().nullable().optional(),
  state_abbr: z.string(),
  zip_code: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  fac_closed_ind: z.string().nullable().optional(),
  parent_co_name: z.string().nullable().optional(),
});

const EPA_ENVIROFACTS_PAYLOAD_SCHEMA = z.union([
  z.array(EPA_ENVIROFACTS_FACILITY_SCHEMA),
  z.object({ error: z.string().optional() }),
]);

/** Reads the parent company, treating the register's "NA" as absent. */
function readEpaParentCompany(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' || trimmed === 'NA' ? null : trimmed;
}

/** Counts facilities per county, most facilities first, then by name. */
function countEpaEnvirofactsCounties(
  facilities: EpaEnvirofactsFacility[]
): EpaEnvirofactsCountyCount[] {
  const counts = new Map<string, number>();
  for (const facility of facilities) {
    counts.set(facility.countyName, (counts.get(facility.countyName) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([leftCounty, leftCount], [rightCounty, rightCount]) =>
      leftCount === rightCount ? leftCounty.localeCompare(rightCounty) : rightCount - leftCount
    )
    .map(([countyName, facilityCount]) => ({ countyName, facilityCount }));
}

/**
 * Builds the request URL for one page of Toxics Release Inventory facilities.
 *
 * The endpoint is keyless, and the state segment does narrow the rows: the
 * value sits directly after the column name, with no `equals` operator.
 * Envirofacts accepts an `equals` segment without complaining but then
 * returns the table's first rows instead of the ones asked for.
 *
 * @param options - an optional state code and row window
 * @returns the full request URL
 */
export function buildEpaEnvirofactsFacilitiesUrl(options?: {
  stateAbbr?: string;
  rowWindow?: string;
}): string {
  const stateAbbr = options?.stateAbbr ?? EPA_ENVIROFACTS_STATE_ABBR;
  const rowWindow = options?.rowWindow ?? EPA_ENVIROFACTS_ROW_WINDOW;
  return `${EPA_ENVIROFACTS_API_BASE}/${EPA_ENVIROFACTS_TABLE}/${EPA_ENVIROFACTS_STATE_COLUMN}/${stateAbbr}/rows/${rowWindow}/JSON`;
}

/**
 * Parses one response into the facilities in the page and its rollups.
 *
 * A row without a facility id, name, or state code fails the schema and stops
 * the parse. An empty array is treated as a changed source, because the
 * default query always returns rows.
 *
 * @param payload - the JSON body from the Envirofacts service
 * @returns the facilities in the page, the open and closed counts, and the counties
 */
export function parseEpaEnvirofactsFacilitiesPayload(payload: unknown): EpaEnvirofactsFacilityPage {
  const parsed = EPA_ENVIROFACTS_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(EPA_ENVIROFACTS_FACILITIES_SOURCE_ID, parsed.error.message);
  }
  if (!Array.isArray(parsed.data)) {
    throw new UsSourceApiError(
      EPA_ENVIROFACTS_FACILITIES_SOURCE_ID,
      parsed.data.error ?? 'The service rejected the query'
    );
  }
  if (parsed.data.length === 0) {
    throw new UsSourceParseError(
      EPA_ENVIROFACTS_FACILITIES_SOURCE_ID,
      'The response carried no rows'
    );
  }

  const facilities: EpaEnvirofactsFacility[] = parsed.data.map((row) => ({
    facilityId: row.tri_facility_id,
    facilityName: row.facility_name,
    streetAddress: row.street_address ?? '',
    city: row.city_name ?? '',
    countyName: row.county_name ?? '',
    stateAbbr: row.state_abbr,
    postalCode: row.zip_code ?? '',
    region: row.region ?? '',
    closed: row.fac_closed_ind === '1',
    parentCompanyName: readEpaParentCompany(row.parent_co_name),
  }));

  const closedCount = facilities.filter((facility) => facility.closed).length;

  return {
    facilities,
    facilityCount: facilities.length,
    openCount: facilities.length - closedCount,
    closedCount,
    counties: countEpaEnvirofactsCounties(facilities),
  };
}

/**
 * Reads one page of Toxics Release Inventory facilities from Envirofacts.
 *
 * One keyless request covers the page. The state segment in the URL narrows
 * the rows, so the page holds facilities from the state that was asked for.
 *
 * @param options - an optional state code, row window, and fetch stub
 * @returns the facilities in the page and its rollups
 */
export async function fetchEpaEnvirofactsFacilities(options?: {
  stateAbbr?: string;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<EpaEnvirofactsFacilityPage> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const url = buildEpaEnvirofactsFacilitiesUrl(
    options?.stateAbbr === undefined ? {} : { stateAbbr: options.stateAbbr }
  );
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new UsSourceApiError(
      EPA_ENVIROFACTS_FACILITIES_SOURCE_ID,
      `HTTP ${response.status} reading the facilities`
    );
  }
  return parseEpaEnvirofactsFacilitiesPayload(await response.json());
}

/** EPA Envirofacts Toxics Release Inventory facilities, keyless. */
export const epaEnvirofactsFacilitiesAdapter: UsDataAdapter<EpaEnvirofactsFacilityPage> = {
  id: EPA_ENVIROFACTS_FACILITIES_SOURCE_ID,
  name: 'EPA Envirofacts facilities',
  auth: 'none',
  description:
    'Toxics Release Inventory facilities from the EPA Envirofacts service, one row per site, with its county, address, and open or closed status.',
  fetchLive: async (options) =>
    fetchEpaEnvirofactsFacilities(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => parseEpaEnvirofactsFacilitiesPayload(payload),
  loadFixture: () =>
    parseEpaEnvirofactsFacilitiesPayload(readFixtureJson(EPA_ENVIROFACTS_FIXTURE_FILENAME)),
};
