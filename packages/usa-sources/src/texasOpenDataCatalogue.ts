import { z } from 'zod';

import { UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpGet } from './http.js';
import { parseSocrataCatalogueMetadata } from './socrataCatalogueMetadata.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the Texas Open Data catalogue source. */
export const TEXAS_OPEN_DATA_CATALOGUE_SOURCE_ID = 'texas-open-data-catalogue';

/** Base URL for the Texas Open Data Socrata catalogue. */
export const TEXAS_OPEN_DATA_API_BASE = 'https://data.texas.gov/api/views.json';

/** How many catalogue entries one request reads. */
export const TEXAS_OPEN_DATA_CATALOGUE_LIMIT = 10;

/** One catalogue entry from the Texas Socrata discovery API. */
export interface TexasOpenDataCatalogueEntry {
  /** Four-by-four Socrata dataset id, e.g. "nqfs-mwbh". */
  id: string;
  /** Human-readable title of the dataset, chart, story, map, or file. */
  name: string;
  /** What the entry is: "dataset", "href", "map", or "measure". */
  assetType: string;
  /** State topic the entry belongs to, or null when the catalogue lists none. */
  category: string | null;
  /** How the entry is rendered, e.g. "tabular" or "href". */
  viewType: string;
  /** When the entry was created, in seconds since the Unix epoch. */
  createdAtEpochSeconds: number;
  /** When the entry was last modified, in seconds since the Unix epoch. */
  viewLastModifiedEpochSeconds: number;
  /** How many times the entry has been viewed. */
  viewCount: number;
  /** How many times the entry has been downloaded. */
  downloadCount: number;
  /** Licence text or URL the portal attaches, or "" when it supplies none. */
  licenceUrl: string;
  /** Publishing organisation the portal attaches, or "" when it supplies none. */
  attribution: string;
}

/** One state topic and how many catalogue entries carry it. */
export interface TexasOpenDataCategoryCount {
  category: string;
  entryCount: number;
}

/** One page of the Texas catalogue, folded for a story. */
export interface TexasOpenDataCatalogue {
  /** One entry per catalogue item in the page. */
  entries: TexasOpenDataCatalogueEntry[];
  entryCount: number;
  /** Entries whose asset type is "dataset". */
  datasetCount: number;
  /** Entry with the latest creation time. Ties go to the earlier list entry. */
  newestEntry: TexasOpenDataCatalogueEntry;
  /**
   * Categories in the page, most entries first, ties broken by name. An entry
   * the catalogue lists without a category is counted under "Uncategorised".
   */
  categories: TexasOpenDataCategoryCount[];
}

/** Committed snapshot, so a build works when the Texas host is unreachable. */
const TEXAS_OPEN_DATA_FIXTURE_FILENAME = 'texas-open-data-catalogue-2026-11-08.json';

/** Category bucket the adapter uses for an entry the catalogue lists without one. */
const TEXAS_OPEN_DATA_UNCATEGORISED = 'Uncategorised';

// The discovery API sends a bare JSON array. A value the catalogue does not
// carry arrives as null, and every count arrives as a number.
const TEXAS_OPEN_DATA_ENTRY_SCHEMA = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  assetType: z.string().optional(),
  category: z.string().nullable().optional(),
  viewType: z.string().optional(),
  createdAt: z.number().optional(),
  viewLastModified: z.number().optional(),
  viewCount: z.number().optional(),
  downloadCount: z.number().optional(),
  metadata: z.unknown().optional(),
});

const TEXAS_OPEN_DATA_PAYLOAD_SCHEMA = z.array(TEXAS_OPEN_DATA_ENTRY_SCHEMA);

/** Counts entries per category, most entries first, ties by name. */
function countTexasOpenDataCategories(
  entries: TexasOpenDataCatalogueEntry[]
): TexasOpenDataCategoryCount[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const category = entry.category ?? TEXAS_OPEN_DATA_UNCATEGORISED;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([leftCategory, leftCount], [rightCategory, rightCount]) =>
      leftCount === rightCount ? leftCategory.localeCompare(rightCategory) : rightCount - leftCount
    )
    .map(([category, entryCount]) => ({ category, entryCount }));
}

/** Picks the entry with the latest creation time, ties to the earlier entry. */
function newestTexasOpenDataEntry(
  entries: TexasOpenDataCatalogueEntry[]
): TexasOpenDataCatalogueEntry {
  const first = entries[0];
  if (first === undefined) {
    throw new UsSourceParseError(TEXAS_OPEN_DATA_CATALOGUE_SOURCE_ID, 'No entries to summarise');
  }
  return entries.reduce(
    (best, entry) => (entry.createdAtEpochSeconds > best.createdAtEpochSeconds ? entry : best),
    first
  );
}

/**
 * Builds the request URL for one page of the Texas catalogue.
 *
 * The endpoint is keyless. The service answers the whole catalogue by default,
 * so the adapter asks for a short page.
 *
 * @param options - an optional entry cap
 * @returns the full request URL
 */
export function buildTexasOpenDataCatalogueUrl(options?: { limit?: number }): string {
  const params = new URLSearchParams({
    limit: String(options?.limit ?? TEXAS_OPEN_DATA_CATALOGUE_LIMIT),
  });
  return `${TEXAS_OPEN_DATA_API_BASE}?${params.toString()}`;
}

/**
 * Parses one page of the Texas catalogue into the entries and topic counts.
 *
 * An entry without an id, a name, or a creation time is a changed shape and
 * stops the parse. An empty page also stops the parse, because a catalogue
 * with no entries is not a usable answer.
 *
 * @param payload - the JSON body from the Texas Socrata discovery API
 * @returns the entries in the page, the counts, and the newest entry
 */
export function parseTexasOpenDataCataloguePayload(payload: unknown): TexasOpenDataCatalogue {
  const parsed = TEXAS_OPEN_DATA_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(TEXAS_OPEN_DATA_CATALOGUE_SOURCE_ID, parsed.error.message);
  }
  if (parsed.data.length === 0) {
    throw new UsSourceParseError(
      TEXAS_OPEN_DATA_CATALOGUE_SOURCE_ID,
      'The response carried no entries'
    );
  }

  const entries: TexasOpenDataCatalogueEntry[] = parsed.data.map((row) => {
    if (row.id === undefined || row.name === undefined || row.createdAt === undefined) {
      throw new UsSourceParseError(
        TEXAS_OPEN_DATA_CATALOGUE_SOURCE_ID,
        'A catalogue entry arrived without its id, name, or creation time'
      );
    }
    return {
      id: row.id,
      name: row.name,
      assetType: row.assetType ?? '',
      category: row.category ?? null,
      viewType: row.viewType ?? '',
      createdAtEpochSeconds: row.createdAt,
      viewLastModifiedEpochSeconds: row.viewLastModified ?? row.createdAt,
      viewCount: row.viewCount ?? 0,
      downloadCount: row.downloadCount ?? 0,
      ...parseSocrataCatalogueMetadata(row.metadata),
    };
  });

  return {
    entries,
    entryCount: entries.length,
    datasetCount: entries.filter((entry) => entry.assetType === 'dataset').length,
    newestEntry: newestTexasOpenDataEntry(entries),
    categories: countTexasOpenDataCategories(entries),
  };
}

/**
 * Reads one page of the Texas Open Data catalogue.
 *
 * One keyless request covers the page and reports what the state portal holds,
 * without reading any dataset's rows.
 *
 * @param options - an optional entry cap and fetch stub
 * @returns the entries in the page, the counts, and the newest entry
 */
export async function fetchTexasOpenDataCatalogue(options?: {
  limit?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<TexasOpenDataCatalogue> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const url = buildTexasOpenDataCatalogueUrl(
    options?.limit === undefined ? {} : { limit: options.limit }
  );
  const response = await httpGet(TEXAS_OPEN_DATA_CATALOGUE_SOURCE_ID, url, { fetchImpl });
  return parseTexasOpenDataCataloguePayload(await response.json());
}

/** Texas Open Data catalogue of datasets, maps, charts, and linked resources, keyless. */
export const texasOpenDataCatalogueAdapter: UsDataAdapter<TexasOpenDataCatalogue> = {
  id: TEXAS_OPEN_DATA_CATALOGUE_SOURCE_ID,
  name: 'Texas Open Data catalogue',
  auth: 'none',
  description:
    'The Texas Open Data Socrata catalogue, one row per published dataset, map, chart, or linked resource, with its state topic, view count, and download count.',
  fetchLive: async (options) =>
    fetchTexasOpenDataCatalogue(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => parseTexasOpenDataCataloguePayload(payload),
  loadFixture: () =>
    parseTexasOpenDataCataloguePayload(readFixtureJson(TEXAS_OPEN_DATA_FIXTURE_FILENAME)),
};
