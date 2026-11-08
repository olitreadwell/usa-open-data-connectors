import { z } from 'zod';

import { UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpGet } from './http.js';
import type { SocrataCatalogueCategoryCount } from './socrataCatalogue.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the California Open Data catalogue source. */
export const CALIFORNIA_OPEN_DATA_CATALOGUE_SOURCE_ID = 'california-open-data-catalogue';

/** Keyless CKAN package-search URL for the California Open Data catalogue. */
export const CALIFORNIA_OPEN_DATA_API_BASE = 'https://data.ca.gov/api/3/action/package_search';

/** How many catalogue entries one request reads. */
export const CALIFORNIA_OPEN_DATA_CATALOGUE_LIMIT = 10;

/** One CKAN package from the California Open Data catalogue. */
export interface CaliforniaOpenDataCatalogueEntry {
  /** CKAN package UUID. */
  id: string;
  /** CKAN package slug. */
  name: string;
  /** Human-readable dataset title. */
  title: string;
  /** CKAN package type, usually "dataset". */
  assetType: string;
  /** First CKAN group title, or null when the package belongs to no group. */
  category: string | null;
  /** When the package was created, in seconds since the Unix epoch. */
  createdAtEpochSeconds: number;
  /** When the package was last modified, in seconds since the Unix epoch. */
  viewLastModifiedEpochSeconds: number;
  /** Number of resources attached to the package. */
  resourceCount: number;
  /** Licence URL or title the portal attaches, or "" when it supplies none. */
  licenceUrl: string;
  /** Publishing organisation the portal attaches, or "" when it supplies none. */
  attribution: string;
}

/** One catalogue topic and how many entries carry it. */
export type CaliforniaOpenDataCategoryCount = SocrataCatalogueCategoryCount;

/** One page of the California catalogue, folded for a story. */
export interface CaliforniaOpenDataCatalogue {
  /** One entry per package in the page. */
  entries: CaliforniaOpenDataCatalogueEntry[];
  entryCount: number;
  /** Total packages the CKAN search reports for the query. */
  catalogueCount: number;
  /** Entries whose package type is "dataset". */
  datasetCount: number;
  /** Entry with the latest creation time. Ties go to the earlier list entry. */
  newestEntry: CaliforniaOpenDataCatalogueEntry;
  /** Categories in the page, most entries first, ties broken by name. */
  categories: CaliforniaOpenDataCategoryCount[];
}

/** Committed snapshot, so a build works when the California host is unreachable. */
const CALIFORNIA_OPEN_DATA_FIXTURE_FILENAME = 'california-open-data-catalogue-2026-11-08.json';

/** Category bucket the adapter uses for an entry the catalogue lists without one. */
const CALIFORNIA_OPEN_DATA_UNCATEGORISED = 'Uncategorised';

const CALIFORNIA_OPEN_DATA_PACKAGE_SCHEMA = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
  type: z.string().optional(),
  metadata_created: z.string().optional(),
  metadata_modified: z.string().optional(),
  license_url: z.string().nullable().optional(),
  license_title: z.string().nullable().optional(),
  organization: z.object({ title: z.string().optional() }).nullable().optional(),
  groups: z.array(z.object({ title: z.string().optional() })).optional(),
  num_resources: z.number().optional(),
  resources: z.array(z.unknown()).optional(),
});

const CALIFORNIA_OPEN_DATA_PAYLOAD_SCHEMA = z.object({
  success: z.literal(true),
  result: z.object({
    count: z.number(),
    results: z.array(CALIFORNIA_OPEN_DATA_PACKAGE_SCHEMA),
  }),
});

/** Reads one CKAN timestamp as seconds since the Unix epoch. */
function parseCkanTimestamp(sourceId: string, value: string, field: string): number {
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis)) {
    throw new UsSourceParseError(sourceId, `A catalogue entry carried an invalid ${field}`);
  }
  return Math.floor(millis / 1000);
}

/** Counts entries per category, most entries first, ties by name. */
function countCaliforniaOpenDataCategories(
  entries: CaliforniaOpenDataCatalogueEntry[]
): CaliforniaOpenDataCategoryCount[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const category = entry.category ?? CALIFORNIA_OPEN_DATA_UNCATEGORISED;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([leftCategory, leftCount], [rightCategory, rightCount]) =>
      leftCount === rightCount ? leftCategory.localeCompare(rightCategory) : rightCount - leftCount
    )
    .map(([category, entryCount]) => ({ category, entryCount }));
}

/** Picks the entry with the latest creation time, ties to the earlier entry. */
function newestCaliforniaOpenDataEntry(
  entries: CaliforniaOpenDataCatalogueEntry[]
): CaliforniaOpenDataCatalogueEntry {
  const first = entries[0];
  if (first === undefined) {
    throw new UsSourceParseError(
      CALIFORNIA_OPEN_DATA_CATALOGUE_SOURCE_ID,
      'No entries to summarise'
    );
  }
  return entries.reduce(
    (best, entry) => (entry.createdAtEpochSeconds > best.createdAtEpochSeconds ? entry : best),
    first
  );
}

/**
 * Builds the request URL for one page of the California CKAN catalogue.
 *
 * The endpoint is keyless. CKAN calls the entry cap `rows`.
 *
 * @param options - an optional entry cap
 * @returns the full request URL
 */
export function buildCaliforniaOpenDataCatalogueUrl(options?: { limit?: number }): string {
  const params = new URLSearchParams({
    rows: String(options?.limit ?? CALIFORNIA_OPEN_DATA_CATALOGUE_LIMIT),
  });
  return `${CALIFORNIA_OPEN_DATA_API_BASE}?${params.toString()}`;
}

/**
 * Parses one page of the California CKAN catalogue into entries and topic counts.
 *
 * An entry without an id, a name, a title, or a creation time is a changed
 * shape and stops the parse. An empty page also stops the parse.
 *
 * @param payload - the JSON body from the California CKAN package search
 * @returns the entries in the page, the counts, and the newest entry
 */
export function parseCaliforniaOpenDataCataloguePayload(
  payload: unknown
): CaliforniaOpenDataCatalogue {
  const parsed = CALIFORNIA_OPEN_DATA_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(CALIFORNIA_OPEN_DATA_CATALOGUE_SOURCE_ID, parsed.error.message);
  }
  if (parsed.data.result.results.length === 0) {
    throw new UsSourceParseError(
      CALIFORNIA_OPEN_DATA_CATALOGUE_SOURCE_ID,
      'The response carried no entries'
    );
  }

  const entries: CaliforniaOpenDataCatalogueEntry[] = parsed.data.result.results.map((row) => {
    if (
      row.id === undefined ||
      row.name === undefined ||
      row.title === undefined ||
      row.metadata_created === undefined
    ) {
      throw new UsSourceParseError(
        CALIFORNIA_OPEN_DATA_CATALOGUE_SOURCE_ID,
        'A catalogue entry arrived without its id, name, title, or creation time'
      );
    }
    const createdAtEpochSeconds = parseCkanTimestamp(
      CALIFORNIA_OPEN_DATA_CATALOGUE_SOURCE_ID,
      row.metadata_created,
      'metadata_created'
    );
    const modifiedAtEpochSeconds =
      row.metadata_modified === undefined
        ? createdAtEpochSeconds
        : parseCkanTimestamp(
            CALIFORNIA_OPEN_DATA_CATALOGUE_SOURCE_ID,
            row.metadata_modified,
            'metadata_modified'
          );
    return {
      id: row.id,
      name: row.name,
      title: row.title,
      assetType: row.type ?? '',
      category: row.groups?.[0]?.title ?? null,
      createdAtEpochSeconds,
      viewLastModifiedEpochSeconds: modifiedAtEpochSeconds,
      resourceCount: row.num_resources ?? row.resources?.length ?? 0,
      licenceUrl: (row.license_url ?? row.license_title ?? '').trim(),
      attribution: (row.organization?.title ?? '').trim(),
    };
  });

  return {
    entries,
    entryCount: entries.length,
    catalogueCount: parsed.data.result.count,
    datasetCount: entries.filter((entry) => entry.assetType === 'dataset').length,
    newestEntry: newestCaliforniaOpenDataEntry(entries),
    categories: countCaliforniaOpenDataCategories(entries),
  };
}

/**
 * Reads one page of the California Open Data catalogue through CKAN.
 *
 * One keyless request covers the page. The Socrata discovery endpoint on the
 * same host answers HTTP 404, while CKAN package search answers JSON.
 *
 * @param options - an optional entry cap and fetch stub
 * @returns the entries in the page, the counts, and the newest entry
 */
export async function fetchCaliforniaOpenDataCatalogue(options?: {
  limit?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<CaliforniaOpenDataCatalogue> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const url = buildCaliforniaOpenDataCatalogueUrl(
    options?.limit === undefined ? {} : { limit: options.limit }
  );
  const response = await httpGet(CALIFORNIA_OPEN_DATA_CATALOGUE_SOURCE_ID, url, { fetchImpl });
  return parseCaliforniaOpenDataCataloguePayload(await response.json());
}

/** California Open Data catalogue of datasets and resources, keyless through CKAN. */
export const californiaOpenDataCatalogueAdapter: UsDataAdapter<CaliforniaOpenDataCatalogue> = {
  id: CALIFORNIA_OPEN_DATA_CATALOGUE_SOURCE_ID,
  name: 'California Open Data catalogue',
  auth: 'none',
  description:
    'The California Open Data CKAN catalogue, one row per published dataset package, with its title, groups, resources, licence, and publishing organisation.',
  fetchLive: async (options) =>
    fetchCaliforniaOpenDataCatalogue(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => parseCaliforniaOpenDataCataloguePayload(payload),
  loadFixture: () =>
    parseCaliforniaOpenDataCataloguePayload(readFixtureJson(CALIFORNIA_OPEN_DATA_FIXTURE_FILENAME)),
};
