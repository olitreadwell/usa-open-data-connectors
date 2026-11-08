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

/** Adapter id for the Michigan Open Data catalogue source. */
export const MICHIGAN_OPEN_DATA_CATALOGUE_SOURCE_ID = 'michigan-open-data-catalogue';

/** Base URL for the Michigan Open Data Socrata catalogue. */
export const MICHIGAN_OPEN_DATA_API_BASE = 'https://data.michigan.gov/api/views.json';

/** How many catalogue entries one request reads. */
export const MICHIGAN_OPEN_DATA_CATALOGUE_LIMIT = SOCRATA_CATALOGUE_LIMIT;

/** One catalogue entry from the Michigan Socrata discovery API. */
export type MichiganOpenDataCatalogueEntry = SocrataCatalogueEntry;

/** One state topic and how many catalogue entries carry it. */
export type MichiganOpenDataCategoryCount = SocrataCatalogueCategoryCount;

/** One page of the Michigan catalogue, folded for a story. */
export type MichiganOpenDataCatalogue = SocrataCatalogue;

/** Committed snapshot, so a build works when the Michigan host is unreachable. */
const MICHIGAN_OPEN_DATA_FIXTURE_FILENAME = 'michigan-open-data-catalogue-2026-11-08.json';

/**
 * Builds the request URL for one page of the Michigan catalogue.
 *
 * @param options - an optional entry cap
 * @returns the full request URL
 */
export function buildMichiganOpenDataCatalogueUrl(options?: { limit?: number }): string {
  return buildSocrataCatalogueUrl(MICHIGAN_OPEN_DATA_API_BASE, options);
}

/**
 * Parses one page of the Michigan catalogue into entries and topic counts.
 *
 * @param payload - the JSON body from the Michigan Socrata discovery API
 * @returns the entries in the page, the counts, and the newest entry
 */
export function parseMichiganOpenDataCataloguePayload(payload: unknown): MichiganOpenDataCatalogue {
  return parseSocrataCataloguePayload(MICHIGAN_OPEN_DATA_CATALOGUE_SOURCE_ID, payload);
}

/**
 * Reads one page of the Michigan Open Data catalogue.
 *
 * @param options - an optional entry cap and fetch stub
 * @returns the entries in the page, the counts, and the newest entry
 */
export async function fetchMichiganOpenDataCatalogue(options?: {
  limit?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<MichiganOpenDataCatalogue> {
  return fetchSocrataCatalogue(
    { sourceId: MICHIGAN_OPEN_DATA_CATALOGUE_SOURCE_ID, apiBase: MICHIGAN_OPEN_DATA_API_BASE },
    options
  );
}

/** Michigan Open Data catalogue of datasets, maps, charts, and stories, keyless. */
export const michiganOpenDataCatalogueAdapter = createSocrataCatalogueAdapter({
  sourceId: MICHIGAN_OPEN_DATA_CATALOGUE_SOURCE_ID,
  name: 'Michigan Open Data catalogue',
  description:
    'The Michigan Open Data Socrata catalogue, one row per published dataset, map, chart, story, or other resource, with its state topic, view count, and download count.',
  apiBase: MICHIGAN_OPEN_DATA_API_BASE,
  fixtureFilename: MICHIGAN_OPEN_DATA_FIXTURE_FILENAME,
});
