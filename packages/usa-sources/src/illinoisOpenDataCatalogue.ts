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

/** Adapter id for the Illinois Open Data catalogue source. */
export const ILLINOIS_OPEN_DATA_CATALOGUE_SOURCE_ID = 'illinois-open-data-catalogue';

/** Base URL for the Illinois Open Data Socrata catalogue. */
export const ILLINOIS_OPEN_DATA_API_BASE = 'https://data.illinois.gov/api/views.json';

/** How many catalogue entries one request reads. */
export const ILLINOIS_OPEN_DATA_CATALOGUE_LIMIT = SOCRATA_CATALOGUE_LIMIT;

/** One catalogue entry from the Illinois Socrata discovery API. */
export type IllinoisOpenDataCatalogueEntry = SocrataCatalogueEntry;

/** One state topic and how many catalogue entries carry it. */
export type IllinoisOpenDataCategoryCount = SocrataCatalogueCategoryCount;

/** One page of the Illinois catalogue, folded for a story. */
export type IllinoisOpenDataCatalogue = SocrataCatalogue;

/** Committed snapshot, so a build works when the Illinois host is unreachable. */
const ILLINOIS_OPEN_DATA_FIXTURE_FILENAME = 'illinois-open-data-catalogue-2026-11-08.json';

/**
 * Builds the request URL for one page of the Illinois catalogue.
 *
 * @param options - an optional entry cap
 * @returns the full request URL
 */
export function buildIllinoisOpenDataCatalogueUrl(options?: { limit?: number }): string {
  return buildSocrataCatalogueUrl(ILLINOIS_OPEN_DATA_API_BASE, options);
}

/**
 * Parses one page of the Illinois catalogue into entries and topic counts.
 *
 * @param payload - the JSON body from the Illinois Socrata discovery API
 * @returns the entries in the page, the counts, and the newest entry
 */
export function parseIllinoisOpenDataCataloguePayload(payload: unknown): IllinoisOpenDataCatalogue {
  return parseSocrataCataloguePayload(ILLINOIS_OPEN_DATA_CATALOGUE_SOURCE_ID, payload);
}

/**
 * Reads one page of the Illinois Open Data catalogue.
 *
 * @param options - an optional entry cap and fetch stub
 * @returns the entries in the page, the counts, and the newest entry
 */
export async function fetchIllinoisOpenDataCatalogue(options?: {
  limit?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<IllinoisOpenDataCatalogue> {
  return fetchSocrataCatalogue(
    { sourceId: ILLINOIS_OPEN_DATA_CATALOGUE_SOURCE_ID, apiBase: ILLINOIS_OPEN_DATA_API_BASE },
    options
  );
}

/** Illinois Open Data catalogue of datasets, charts, stories, and filtered views, keyless. */
export const illinoisOpenDataCatalogueAdapter = createSocrataCatalogueAdapter({
  sourceId: ILLINOIS_OPEN_DATA_CATALOGUE_SOURCE_ID,
  name: 'Illinois Open Data catalogue',
  description:
    'The Illinois Open Data Socrata catalogue, one row per published dataset, chart, story, or filtered view, with its state topic, view count, and download count.',
  apiBase: ILLINOIS_OPEN_DATA_API_BASE,
  fixtureFilename: ILLINOIS_OPEN_DATA_FIXTURE_FILENAME,
});
