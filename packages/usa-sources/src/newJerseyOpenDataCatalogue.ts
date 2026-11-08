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

/** Adapter id for the New Jersey Open Data catalogue source. */
export const NEW_JERSEY_OPEN_DATA_CATALOGUE_SOURCE_ID = 'new-jersey-open-data-catalogue';

/** Base URL for the New Jersey Open Data Socrata catalogue. */
export const NEW_JERSEY_OPEN_DATA_API_BASE = 'https://data.nj.gov/api/views.json';

/** How many catalogue entries one request reads. */
export const NEW_JERSEY_OPEN_DATA_CATALOGUE_LIMIT = SOCRATA_CATALOGUE_LIMIT;

/** One catalogue entry from the New Jersey Socrata discovery API. */
export type NewJerseyOpenDataCatalogueEntry = SocrataCatalogueEntry;

/** One state topic and how many catalogue entries carry it. */
export type NewJerseyOpenDataCategoryCount = SocrataCatalogueCategoryCount;

/** One page of the New Jersey catalogue, folded for a story. */
export type NewJerseyOpenDataCatalogue = SocrataCatalogue;

/** Committed snapshot, so a build works when the New Jersey host is unreachable. */
const NEW_JERSEY_OPEN_DATA_FIXTURE_FILENAME = 'new-jersey-open-data-catalogue-2026-11-08.json';

/**
 * Builds the request URL for one page of the New Jersey catalogue.
 *
 * @param options - an optional entry cap
 * @returns the full request URL
 */
export function buildNewJerseyOpenDataCatalogueUrl(options?: { limit?: number }): string {
  return buildSocrataCatalogueUrl(NEW_JERSEY_OPEN_DATA_API_BASE, options);
}

/**
 * Parses one page of the New Jersey catalogue into entries and topic counts.
 *
 * @param payload - the JSON body from the New Jersey Socrata discovery API
 * @returns the entries in the page, the counts, and the newest entry
 */
export function parseNewJerseyOpenDataCataloguePayload(
  payload: unknown
): NewJerseyOpenDataCatalogue {
  return parseSocrataCataloguePayload(NEW_JERSEY_OPEN_DATA_CATALOGUE_SOURCE_ID, payload);
}

/**
 * Reads one page of the New Jersey Open Data catalogue.
 *
 * @param options - an optional entry cap and fetch stub
 * @returns the entries in the page, the counts, and the newest entry
 */
export async function fetchNewJerseyOpenDataCatalogue(options?: {
  limit?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<NewJerseyOpenDataCatalogue> {
  return fetchSocrataCatalogue(
    {
      sourceId: NEW_JERSEY_OPEN_DATA_CATALOGUE_SOURCE_ID,
      apiBase: NEW_JERSEY_OPEN_DATA_API_BASE,
    },
    options
  );
}

/** New Jersey Open Data catalogue of datasets, files, and stories, keyless. */
export const newJerseyOpenDataCatalogueAdapter = createSocrataCatalogueAdapter({
  sourceId: NEW_JERSEY_OPEN_DATA_CATALOGUE_SOURCE_ID,
  name: 'New Jersey Open Data catalogue',
  description:
    'The New Jersey Open Data Socrata catalogue, one row per published dataset, file, story, or other resource, with its state topic, view count, and download count.',
  apiBase: NEW_JERSEY_OPEN_DATA_API_BASE,
  fixtureFilename: NEW_JERSEY_OPEN_DATA_FIXTURE_FILENAME,
});
