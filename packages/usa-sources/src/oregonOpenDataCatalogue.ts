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

/** Adapter id for the Oregon Open Data catalogue source. */
export const OREGON_OPEN_DATA_CATALOGUE_SOURCE_ID = 'oregon-open-data-catalogue';

/** Base URL for the Oregon Open Data Socrata catalogue. */
export const OREGON_OPEN_DATA_API_BASE = 'https://data.oregon.gov/api/views.json';

/** How many catalogue entries one request reads. */
export const OREGON_OPEN_DATA_CATALOGUE_LIMIT = SOCRATA_CATALOGUE_LIMIT;

/** One catalogue entry from the Oregon Socrata discovery API. */
export type OregonOpenDataCatalogueEntry = SocrataCatalogueEntry;

/** One state topic and how many catalogue entries carry it. */
export type OregonOpenDataCategoryCount = SocrataCatalogueCategoryCount;

/** One page of the Oregon catalogue, folded for a story. */
export type OregonOpenDataCatalogue = SocrataCatalogue;

/** Committed snapshot, so a build works when the Oregon host is unreachable. */
const OREGON_OPEN_DATA_FIXTURE_FILENAME = 'oregon-open-data-catalogue-2026-11-08.json';

/**
 * Builds the request URL for one page of the Oregon catalogue.
 *
 * @param options - an optional entry cap
 * @returns the full request URL
 */
export function buildOregonOpenDataCatalogueUrl(options?: { limit?: number }): string {
  return buildSocrataCatalogueUrl(OREGON_OPEN_DATA_API_BASE, options);
}

/**
 * Parses one page of the Oregon catalogue into entries and topic counts.
 *
 * @param payload - the JSON body from the Oregon Socrata discovery API
 * @returns the entries in the page, the counts, and the newest entry
 */
export function parseOregonOpenDataCataloguePayload(payload: unknown): OregonOpenDataCatalogue {
  return parseSocrataCataloguePayload(OREGON_OPEN_DATA_CATALOGUE_SOURCE_ID, payload);
}

/**
 * Reads one page of the Oregon Open Data catalogue.
 *
 * @param options - an optional entry cap and fetch stub
 * @returns the entries in the page, the counts, and the newest entry
 */
export async function fetchOregonOpenDataCatalogue(options?: {
  limit?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<OregonOpenDataCatalogue> {
  return fetchSocrataCatalogue(
    { sourceId: OREGON_OPEN_DATA_CATALOGUE_SOURCE_ID, apiBase: OREGON_OPEN_DATA_API_BASE },
    options
  );
}

/** Oregon Open Data catalogue of datasets, files, and filtered views, keyless. */
export const oregonOpenDataCatalogueAdapter = createSocrataCatalogueAdapter({
  sourceId: OREGON_OPEN_DATA_CATALOGUE_SOURCE_ID,
  name: 'Oregon Open Data catalogue',
  description:
    'The Oregon Open Data Socrata catalogue, one row per published dataset, file, or filtered view, with its state topic, view count, and download count.',
  apiBase: OREGON_OPEN_DATA_API_BASE,
  fixtureFilename: OREGON_OPEN_DATA_FIXTURE_FILENAME,
});
