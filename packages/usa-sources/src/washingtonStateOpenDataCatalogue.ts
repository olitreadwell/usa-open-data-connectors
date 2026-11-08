import {
  buildSocrataCatalogueUrl,
  createSocrataCatalogueAdapter,
  fetchSocrataCatalogue,
  parseSocrataCataloguePayload,
  SOCRATA_CATALOGUE_LIMIT,
  type SocrataCatalogue,
  type SocrataCatalogueCategoryCount,
  type SocrataCatalogueEntry,
} from './socrataCatalogue.js';

/** Adapter id for the Washington State Open Data catalogue source. */
export const WASHINGTON_STATE_OPEN_DATA_CATALOGUE_SOURCE_ID =
  'washington-state-open-data-catalogue';

/** Base URL for the Washington State Open Data Socrata catalogue. */
export const WASHINGTON_STATE_OPEN_DATA_API_BASE = 'https://data.wa.gov/api/views.json';

/** How many catalogue entries one request reads. */
export const WASHINGTON_STATE_OPEN_DATA_CATALOGUE_LIMIT = SOCRATA_CATALOGUE_LIMIT;

/** One catalogue entry from the Washington State Socrata discovery API. */
export type WashingtonStateOpenDataCatalogueEntry = SocrataCatalogueEntry;

/** One state topic and how many catalogue entries carry it. */
export type WashingtonStateOpenDataCategoryCount = SocrataCatalogueCategoryCount;

/** One page of the Washington State catalogue, folded for a story. */
export type WashingtonStateOpenDataCatalogue = SocrataCatalogue;

/** Committed snapshot, so a build works when the Washington State host is unreachable. */
const WASHINGTON_STATE_OPEN_DATA_FIXTURE_FILENAME =
  'washington-state-open-data-catalogue-2026-11-08.json';

/**
 * Builds the request URL for one page of the Washington State catalogue.
 *
 * @param options - an optional entry cap
 * @returns the full request URL
 */
export function buildWashingtonStateOpenDataCatalogueUrl(options?: { limit?: number }): string {
  return buildSocrataCatalogueUrl(WASHINGTON_STATE_OPEN_DATA_API_BASE, options);
}

/**
 * Parses one page of the Washington State catalogue into entries and topic counts.
 *
 * @param payload - the JSON body from the Washington State Socrata discovery API
 * @returns the entries in the page, the counts, and the newest entry
 */
export function parseWashingtonStateOpenDataCataloguePayload(
  payload: unknown
): WashingtonStateOpenDataCatalogue {
  return parseSocrataCataloguePayload(WASHINGTON_STATE_OPEN_DATA_CATALOGUE_SOURCE_ID, payload);
}

/**
 * Reads one page of the Washington State Open Data catalogue.
 *
 * @param options - an optional entry cap and fetch stub
 * @returns the entries in the page, the counts, and the newest entry
 */
export async function fetchWashingtonStateOpenDataCatalogue(options?: {
  limit?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<WashingtonStateOpenDataCatalogue> {
  return fetchSocrataCatalogue(
    {
      sourceId: WASHINGTON_STATE_OPEN_DATA_CATALOGUE_SOURCE_ID,
      apiBase: WASHINGTON_STATE_OPEN_DATA_API_BASE,
    },
    options
  );
}

/** Washington State Open Data catalogue of datasets, charts, and stories, keyless. */
export const washingtonStateOpenDataCatalogueAdapter = createSocrataCatalogueAdapter({
  sourceId: WASHINGTON_STATE_OPEN_DATA_CATALOGUE_SOURCE_ID,
  name: 'Washington State Open Data catalogue',
  description:
    'The Washington State Open Data Socrata catalogue, one row per published dataset, chart, story, or other resource, with its state topic, view count, and download count.',
  apiBase: WASHINGTON_STATE_OPEN_DATA_API_BASE,
  fixtureFilename: WASHINGTON_STATE_OPEN_DATA_FIXTURE_FILENAME,
});
