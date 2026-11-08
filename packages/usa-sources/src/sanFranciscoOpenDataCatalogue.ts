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

/** Adapter id for the San Francisco Open Data catalogue source. */
export const SAN_FRANCISCO_OPEN_DATA_CATALOGUE_SOURCE_ID = 'san-francisco-open-data-catalogue';

/** Base URL for the San Francisco Open Data Socrata catalogue. */
export const SAN_FRANCISCO_OPEN_DATA_API_BASE = 'https://data.sf.gov/api/views.json';

/** How many catalogue entries one request reads. */
export const SAN_FRANCISCO_OPEN_DATA_CATALOGUE_LIMIT = SOCRATA_CATALOGUE_LIMIT;

/** One catalogue entry from the San Francisco Socrata discovery API. */
export type SanFranciscoOpenDataCatalogueEntry = SocrataCatalogueEntry;

/** One city topic and how many catalogue entries carry it. */
export type SanFranciscoOpenDataCategoryCount = SocrataCatalogueCategoryCount;

/** One page of the San Francisco catalogue, folded for a story. */
export type SanFranciscoOpenDataCatalogue = SocrataCatalogue;

/** Committed snapshot, so a build works when the San Francisco host is unreachable. */
const SAN_FRANCISCO_OPEN_DATA_FIXTURE_FILENAME =
  'san-francisco-open-data-catalogue-2026-11-08.json';

/**
 * Builds the request URL for one page of the San Francisco catalogue.
 *
 * @param options - an optional entry cap
 * @returns the full request URL
 */
export function buildSanFranciscoOpenDataCatalogueUrl(options?: { limit?: number }): string {
  return buildSocrataCatalogueUrl(SAN_FRANCISCO_OPEN_DATA_API_BASE, options);
}

/**
 * Parses one page of the San Francisco catalogue into entries and topic counts.
 *
 * @param payload - the JSON body from the San Francisco Socrata discovery API
 * @returns the entries in the page, the counts, and the newest entry
 */
export function parseSanFranciscoOpenDataCataloguePayload(
  payload: unknown
): SanFranciscoOpenDataCatalogue {
  return parseSocrataCataloguePayload(SAN_FRANCISCO_OPEN_DATA_CATALOGUE_SOURCE_ID, payload);
}

/**
 * Reads one page of the San Francisco Open Data catalogue.
 *
 * @param options - an optional entry cap and fetch stub
 * @returns the entries in the page, the counts, and the newest entry
 */
export async function fetchSanFranciscoOpenDataCatalogue(options?: {
  limit?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<SanFranciscoOpenDataCatalogue> {
  return fetchSocrataCatalogue(
    {
      sourceId: SAN_FRANCISCO_OPEN_DATA_CATALOGUE_SOURCE_ID,
      apiBase: SAN_FRANCISCO_OPEN_DATA_API_BASE,
    },
    options
  );
}

/** San Francisco Open Data catalogue of datasets, maps, and filtered views, keyless. */
export const sanFranciscoOpenDataCatalogueAdapter = createSocrataCatalogueAdapter({
  sourceId: SAN_FRANCISCO_OPEN_DATA_CATALOGUE_SOURCE_ID,
  name: 'San Francisco Open Data catalogue',
  description:
    'The San Francisco Open Data Socrata catalogue, one row per published dataset, map, or filtered view, with its city topic, view count, and download count.',
  apiBase: SAN_FRANCISCO_OPEN_DATA_API_BASE,
  fixtureFilename: SAN_FRANCISCO_OPEN_DATA_FIXTURE_FILENAME,
});
