import { z } from 'zod';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the bts-transportation-stats source. */
export const BTS_TRANSPORTATION_STATS_SOURCE_ID = 'bts-transportation-stats';

/** One catalogue entry from the Socrata discovery API. */
export interface BtsCatalogueEntry {
  /** Four-by-four Socrata dataset id, e.g. "ahfs-x44r". */
  id: string;
  /** Human-readable title of the dataset, chart, story, or file. */
  name: string;
  /** What the entry is: "dataset", "chart", "story", "file", or "href". */
  assetType: string;
  /** Publishing office the entry belongs to, or null when the catalogue lists none. */
  category: string | null;
  /** How the entry is rendered, e.g. "tabular", "href", or "story". */
  viewType: string;
  /** When the entry was created, in seconds since the Unix epoch. */
  createdAtEpochSeconds: number;
  /** When the entry was last modified, in seconds since the Unix epoch. */
  viewLastModifiedEpochSeconds: number;
  /** How many times the entry has been viewed. */
  viewCount: number;
  /** How many times the entry has been downloaded. */
  downloadCount: number;
}

/** One category and how many catalogue entries carry it. */
export interface BtsCatalogueCategoryCount {
  category: string;
  entryCount: number;
}

/** One page of the catalogue, folded for a story. */
export interface BtsTransportationCatalogue {
  /** One entry per catalogue item in the page. */
  entries: BtsCatalogueEntry[];
  entryCount: number;
  /** Entries whose asset type is "dataset". */
  datasetCount: number;
  /** Entry with the latest creation time. Ties go to the earlier list entry. */
  newestEntry: BtsCatalogueEntry;
  /**
   * Categories in the page, most entries first, ties broken by name. An entry
   * the catalogue lists without a category is counted under "Uncategorised".
   */
  categories: BtsCatalogueCategoryCount[];
}

/** Base URL for the Bureau of Transportation Statistics Socrata catalogue. */
export const BTS_TRANSPORTATION_STATS_API_BASE = 'https://data.bts.gov/api/views.json';

/** How many catalogue entries one request reads. */
export const BTS_TRANSPORTATION_STATS_LIMIT = 10;

/** Committed snapshot, so a build works when the Bureau of Transportation Statistics host is unreachable. */
const BTS_TRANSPORTATION_STATS_FIXTURE_FILENAME = 'bts-transportation-stats-2026-10-05.json';

/** Category bucket the adapter uses for an entry the catalogue lists without one. */
const BTS_TRANSPORTATION_UNCATEGORISED = 'Uncategorised';

// The discovery API sends a bare JSON array. A value the catalogue does not
// carry arrives as null, and every count arrives as a number.
const BTS_TRANSPORTATION_STATS_ENTRY_SCHEMA = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  assetType: z.string().optional(),
  category: z.string().nullable().optional(),
  viewType: z.string().optional(),
  createdAt: z.number().optional(),
  viewLastModified: z.number().optional(),
  viewCount: z.number().optional(),
  downloadCount: z.number().optional(),
});

const BTS_TRANSPORTATION_STATS_PAYLOAD_SCHEMA = z.array(BTS_TRANSPORTATION_STATS_ENTRY_SCHEMA);

/** Counts entries per category, most entries first, ties by name. */
function countBtsCatalogueCategories(entries: BtsCatalogueEntry[]): BtsCatalogueCategoryCount[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const category = entry.category ?? BTS_TRANSPORTATION_UNCATEGORISED;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([leftCategory, leftCount], [rightCategory, rightCount]) =>
      leftCount === rightCount ? leftCategory.localeCompare(rightCategory) : rightCount - leftCount
    )
    .map(([category, entryCount]) => ({ category, entryCount }));
}

/** Picks the entry with the latest creation time, ties to the earlier entry. */
function newestBtsCatalogueEntry(entries: BtsCatalogueEntry[]): BtsCatalogueEntry {
  const first = entries[0];
  if (first === undefined) {
    throw new UsSourceParseError(BTS_TRANSPORTATION_STATS_SOURCE_ID, 'No entries to summarise');
  }
  return entries.reduce(
    (best, entry) => (entry.createdAtEpochSeconds > best.createdAtEpochSeconds ? entry : best),
    first
  );
}

/**
 * Builds the request URL for one page of the catalogue.
 *
 * The endpoint is keyless. The service answers the whole catalogue by default,
 * so the adapter asks for a short page.
 *
 * @param options - an optional entry cap
 * @returns the full request URL
 */
export function buildBtsTransportationStatsUrl(options?: { limit?: number }): string {
  const params = new URLSearchParams({
    limit: String(options?.limit ?? BTS_TRANSPORTATION_STATS_LIMIT),
  });
  return `https://data.bts.gov/api/views.json?${params.toString()}`;
}

/**
 * Parses one page of the catalogue into the entries and the category counts.
 *
 * An entry without an id, a name, or a creation time is a changed shape and
 * stops the parse. An empty page also stops the parse, because a catalogue
 * with no entries is not a usable answer.
 *
 * @param payload - the JSON body from the Socrata discovery API
 * @returns the entries in the page, the counts, and the newest entry
 */
export function parseBtsTransportationStatsPayload(payload: unknown): BtsTransportationCatalogue {
  const parsed = BTS_TRANSPORTATION_STATS_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(BTS_TRANSPORTATION_STATS_SOURCE_ID, parsed.error.message);
  }
  if (parsed.data.length === 0) {
    throw new UsSourceParseError(
      BTS_TRANSPORTATION_STATS_SOURCE_ID,
      'The response carried no entries'
    );
  }

  const entries: BtsCatalogueEntry[] = parsed.data.map((row) => {
    if (row.id === undefined || row.name === undefined || row.createdAt === undefined) {
      throw new UsSourceParseError(
        BTS_TRANSPORTATION_STATS_SOURCE_ID,
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
    };
  });

  return {
    entries,
    entryCount: entries.length,
    datasetCount: entries.filter((entry) => entry.assetType === 'dataset').length,
    newestEntry: newestBtsCatalogueEntry(entries),
    categories: countBtsCatalogueCategories(entries),
  };
}

/**
 * Reads one page of the Bureau of Transportation Statistics catalogue.
 *
 * One keyless request covers the page and reports what the catalogue holds,
 * without reading any dataset's rows.
 *
 * @param options - an optional entry cap and fetch stub
 * @returns the entries in the page, the counts, and the newest entry
 */
export async function fetchBtsTransportationStats(options?: {
  limit?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<BtsTransportationCatalogue> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const url = buildBtsTransportationStatsUrl(
    options?.limit === undefined ? {} : { limit: options.limit }
  );
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new UsSourceApiError(
      BTS_TRANSPORTATION_STATS_SOURCE_ID,
      `HTTP ${response.status} reading the catalogue`
    );
  }
  return parseBtsTransportationStatsPayload(await response.json());
}

/** Bureau of Transportation Statistics catalogue of datasets, charts, and stories, keyless. */
export const btsTransportationStatsAdapter: UsDataAdapter<BtsTransportationCatalogue> = {
  id: BTS_TRANSPORTATION_STATS_SOURCE_ID,
  name: 'BTS transportation statistics',
  auth: 'none',
  description:
    'The Bureau of Transportation Statistics Socrata catalogue, one row per published dataset, chart, or story, with its category, view count, and download count.',
  fetchLive: async (options) =>
    fetchBtsTransportationStats(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => parseBtsTransportationStatsPayload(payload),
  loadFixture: () =>
    parseBtsTransportationStatsPayload(readFixtureJson(BTS_TRANSPORTATION_STATS_FIXTURE_FILENAME)),
};
