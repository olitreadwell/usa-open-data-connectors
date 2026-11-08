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

/** Adapter id for the Pennsylvania Open Data catalogue source. */
export const PENNSYLVANIA_OPEN_DATA_CATALOGUE_SOURCE_ID = 'pennsylvania-open-data-catalogue';

/** Base URL for the Pennsylvania Open Data Socrata catalogue. */
export const PENNSYLVANIA_OPEN_DATA_API_BASE = 'https://data.pa.gov/api/views.json';

/** How many catalogue entries one request reads. */
export const PENNSYLVANIA_OPEN_DATA_CATALOGUE_LIMIT = SOCRATA_CATALOGUE_LIMIT;

/** One catalogue entry from the Pennsylvania Socrata discovery API. */
export type PennsylvaniaOpenDataCatalogueEntry = SocrataCatalogueEntry;

/** One state topic and how many catalogue entries carry it. */
export type PennsylvaniaOpenDataCategoryCount = SocrataCatalogueCategoryCount;

/** One page of the Pennsylvania catalogue, folded for a story. */
export type PennsylvaniaOpenDataCatalogue = SocrataCatalogue;

/** Committed snapshot, so a build works when the Pennsylvania host is unreachable. */
const PENNSYLVANIA_OPEN_DATA_FIXTURE_FILENAME = 'pennsylvania-open-data-catalogue-2026-11-08.json';

/**
 * Builds the request URL for one page of the Pennsylvania catalogue.
 *
 * @param options - an optional entry cap
 * @returns the full request URL
 */
export function buildPennsylvaniaOpenDataCatalogueUrl(options?: { limit?: number }): string {
  return buildSocrataCatalogueUrl(PENNSYLVANIA_OPEN_DATA_API_BASE, options);
}

/**
 * Parses one page of the Pennsylvania catalogue into entries and topic counts.
 *
 * @param payload - the JSON body from the Pennsylvania Socrata discovery API
 * @returns the entries in the page, the counts, and the newest entry
 */
export function parsePennsylvaniaOpenDataCataloguePayload(
  payload: unknown
): PennsylvaniaOpenDataCatalogue {
  return parseSocrataCataloguePayload(PENNSYLVANIA_OPEN_DATA_CATALOGUE_SOURCE_ID, payload);
}

/**
 * Reads one page of the Pennsylvania Open Data catalogue.
 *
 * @param options - an optional entry cap and fetch stub
 * @returns the entries in the page, the counts, and the newest entry
 */
export async function fetchPennsylvaniaOpenDataCatalogue(options?: {
  limit?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<PennsylvaniaOpenDataCatalogue> {
  return fetchSocrataCatalogue(
    {
      sourceId: PENNSYLVANIA_OPEN_DATA_CATALOGUE_SOURCE_ID,
      apiBase: PENNSYLVANIA_OPEN_DATA_API_BASE,
    },
    options
  );
}

/** Pennsylvania Open Data catalogue of datasets, charts, and linked resources, keyless. */
export const pennsylvaniaOpenDataCatalogueAdapter = createSocrataCatalogueAdapter({
  sourceId: PENNSYLVANIA_OPEN_DATA_CATALOGUE_SOURCE_ID,
  name: 'Pennsylvania Open Data catalogue',
  description:
    'The Pennsylvania Open Data Socrata catalogue, one row per published dataset, chart, or linked resource, with its state topic, view count, and download count.',
  apiBase: PENNSYLVANIA_OPEN_DATA_API_BASE,
  fixtureFilename: PENNSYLVANIA_OPEN_DATA_FIXTURE_FILENAME,
});
