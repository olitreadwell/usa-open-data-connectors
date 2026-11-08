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

/** Adapter id for the Colorado Open Data catalogue source. */
export const COLORADO_OPEN_DATA_CATALOGUE_SOURCE_ID = 'colorado-open-data-catalogue';

/** Base URL for the Colorado Open Data Socrata catalogue. */
export const COLORADO_OPEN_DATA_API_BASE = 'https://data.colorado.gov/api/views.json';

/** How many catalogue entries one request reads. */
export const COLORADO_OPEN_DATA_CATALOGUE_LIMIT = SOCRATA_CATALOGUE_LIMIT;

/** One catalogue entry from the Colorado Socrata discovery API. */
export type ColoradoOpenDataCatalogueEntry = SocrataCatalogueEntry;

/** One state topic and how many catalogue entries carry it. */
export type ColoradoOpenDataCategoryCount = SocrataCatalogueCategoryCount;

/** One page of the Colorado catalogue, folded for a story. */
export type ColoradoOpenDataCatalogue = SocrataCatalogue;

/** Committed snapshot, so a build works when the Colorado host is unreachable. */
const COLORADO_OPEN_DATA_FIXTURE_FILENAME = 'colorado-open-data-catalogue-2026-11-08.json';

/**
 * Builds the request URL for one page of the Colorado catalogue.
 *
 * @param options - an optional entry cap
 * @returns the full request URL
 */
export function buildColoradoOpenDataCatalogueUrl(options?: { limit?: number }): string {
  return buildSocrataCatalogueUrl(COLORADO_OPEN_DATA_API_BASE, options);
}

/**
 * Parses one page of the Colorado catalogue into entries and topic counts.
 *
 * @param payload - the JSON body from the Colorado Socrata discovery API
 * @returns the entries in the page, the counts, and the newest entry
 */
export function parseColoradoOpenDataCataloguePayload(payload: unknown): ColoradoOpenDataCatalogue {
  return parseSocrataCataloguePayload(COLORADO_OPEN_DATA_CATALOGUE_SOURCE_ID, payload);
}

/**
 * Reads one page of the Colorado Open Data catalogue.
 *
 * @param options - an optional entry cap and fetch stub
 * @returns the entries in the page, the counts, and the newest entry
 */
export async function fetchColoradoOpenDataCatalogue(options?: {
  limit?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<ColoradoOpenDataCatalogue> {
  return fetchSocrataCatalogue(
    { sourceId: COLORADO_OPEN_DATA_CATALOGUE_SOURCE_ID, apiBase: COLORADO_OPEN_DATA_API_BASE },
    options
  );
}

/** Colorado Open Data catalogue of datasets, maps, charts, and linked resources, keyless. */
export const coloradoOpenDataCatalogueAdapter = createSocrataCatalogueAdapter({
  sourceId: COLORADO_OPEN_DATA_CATALOGUE_SOURCE_ID,
  name: 'Colorado Open Data catalogue',
  description:
    'The Colorado Open Data Socrata catalogue, one row per published dataset, map, chart, or linked resource, with its state topic, view count, and download count.',
  apiBase: COLORADO_OPEN_DATA_API_BASE,
  fixtureFilename: COLORADO_OPEN_DATA_FIXTURE_FILENAME,
});
