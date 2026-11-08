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

/** Adapter id for the Vermont Open Data catalogue source. */
export const VERMONT_OPEN_DATA_CATALOGUE_SOURCE_ID = 'vermont-open-data-catalogue';

/** Base URL for the Vermont Open Data Socrata catalogue. */
export const VERMONT_OPEN_DATA_API_BASE = 'https://data.vermont.gov/api/views.json';

/** How many catalogue entries one request reads. */
export const VERMONT_OPEN_DATA_CATALOGUE_LIMIT = SOCRATA_CATALOGUE_LIMIT;

/** One catalogue entry from the Vermont Socrata discovery API. */
export type VermontOpenDataCatalogueEntry = SocrataCatalogueEntry;

/** One state topic and how many catalogue entries carry it. */
export type VermontOpenDataCategoryCount = SocrataCatalogueCategoryCount;

/** One page of the Vermont catalogue, folded for a story. */
export type VermontOpenDataCatalogue = SocrataCatalogue;

/** Committed snapshot, so a build works when the Vermont host is unreachable. */
const VERMONT_OPEN_DATA_FIXTURE_FILENAME = 'vermont-open-data-catalogue-2026-11-08.json';

/**
 * Builds the request URL for one page of the Vermont catalogue.
 *
 * @param options - an optional entry cap
 * @returns the full request URL
 */
export function buildVermontOpenDataCatalogueUrl(options?: { limit?: number }): string {
  return buildSocrataCatalogueUrl(VERMONT_OPEN_DATA_API_BASE, options);
}

/**
 * Parses one page of the Vermont catalogue into entries and topic counts.
 *
 * @param payload - the JSON body from the Vermont Socrata discovery API
 * @returns the entries in the page, the counts, and the newest entry
 */
export function parseVermontOpenDataCataloguePayload(payload: unknown): VermontOpenDataCatalogue {
  return parseSocrataCataloguePayload(VERMONT_OPEN_DATA_CATALOGUE_SOURCE_ID, payload);
}

/**
 * Reads one page of the Vermont Open Data catalogue.
 *
 * @param options - an optional entry cap and fetch stub
 * @returns the entries in the page, the counts, and the newest entry
 */
export async function fetchVermontOpenDataCatalogue(options?: {
  limit?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<VermontOpenDataCatalogue> {
  return fetchSocrataCatalogue(
    { sourceId: VERMONT_OPEN_DATA_CATALOGUE_SOURCE_ID, apiBase: VERMONT_OPEN_DATA_API_BASE },
    options
  );
}

/** Vermont Open Data catalogue of datasets and filtered views, keyless. */
export const vermontOpenDataCatalogueAdapter = createSocrataCatalogueAdapter({
  sourceId: VERMONT_OPEN_DATA_CATALOGUE_SOURCE_ID,
  name: 'Vermont Open Data catalogue',
  description:
    'The Vermont Open Data Socrata catalogue, one row per published dataset or filtered view, with its state topic, view count, and download count.',
  apiBase: VERMONT_OPEN_DATA_API_BASE,
  fixtureFilename: VERMONT_OPEN_DATA_FIXTURE_FILENAME,
});
