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

/** Adapter id for the Los Angeles Open Data catalogue source. */
export const LOS_ANGELES_OPEN_DATA_CATALOGUE_SOURCE_ID = 'los-angeles-open-data-catalogue';

/** Base URL for the Los Angeles Open Data Socrata catalogue. */
export const LOS_ANGELES_OPEN_DATA_API_BASE = 'https://data.lacity.org/api/views.json';

/** How many catalogue entries one request reads. */
export const LOS_ANGELES_OPEN_DATA_CATALOGUE_LIMIT = SOCRATA_CATALOGUE_LIMIT;

/** One catalogue entry from the Los Angeles Socrata discovery API. */
export type LosAngelesOpenDataCatalogueEntry = SocrataCatalogueEntry;

/** One city topic and how many catalogue entries carry it. */
export type LosAngelesOpenDataCategoryCount = SocrataCatalogueCategoryCount;

/** One page of the Los Angeles catalogue, folded for a story. */
export type LosAngelesOpenDataCatalogue = SocrataCatalogue;

/** Committed snapshot, so a build works when the Los Angeles host is unreachable. */
const LOS_ANGELES_OPEN_DATA_FIXTURE_FILENAME = 'los-angeles-open-data-catalogue-2026-11-08.json';

/**
 * Builds the request URL for one page of the Los Angeles catalogue.
 *
 * @param options - an optional entry cap
 * @returns the full request URL
 */
export function buildLosAngelesOpenDataCatalogueUrl(options?: { limit?: number }): string {
  return buildSocrataCatalogueUrl(LOS_ANGELES_OPEN_DATA_API_BASE, options);
}

/**
 * Parses one page of the Los Angeles catalogue into entries and topic counts.
 *
 * @param payload - the JSON body from the Los Angeles Socrata discovery API
 * @returns the entries in the page, the counts, and the newest entry
 */
export function parseLosAngelesOpenDataCataloguePayload(
  payload: unknown
): LosAngelesOpenDataCatalogue {
  return parseSocrataCataloguePayload(LOS_ANGELES_OPEN_DATA_CATALOGUE_SOURCE_ID, payload);
}

/**
 * Reads one page of the Los Angeles Open Data catalogue.
 *
 * @param options - an optional entry cap and fetch stub
 * @returns the entries in the page, the counts, and the newest entry
 */
export async function fetchLosAngelesOpenDataCatalogue(options?: {
  limit?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<LosAngelesOpenDataCatalogue> {
  return fetchSocrataCatalogue(
    {
      sourceId: LOS_ANGELES_OPEN_DATA_CATALOGUE_SOURCE_ID,
      apiBase: LOS_ANGELES_OPEN_DATA_API_BASE,
    },
    options
  );
}

/** Los Angeles Open Data catalogue of datasets, maps, and filtered views, keyless. */
export const losAngelesOpenDataCatalogueAdapter = createSocrataCatalogueAdapter({
  sourceId: LOS_ANGELES_OPEN_DATA_CATALOGUE_SOURCE_ID,
  name: 'Los Angeles Open Data catalogue',
  description:
    'The Los Angeles Open Data Socrata catalogue, one row per published dataset, map, or filtered view, with its city topic, view count, and download count.',
  apiBase: LOS_ANGELES_OPEN_DATA_API_BASE,
  fixtureFilename: LOS_ANGELES_OPEN_DATA_FIXTURE_FILENAME,
});
