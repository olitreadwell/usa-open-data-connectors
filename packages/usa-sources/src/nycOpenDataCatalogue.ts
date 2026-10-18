import { z } from 'zod';

import { UsSourceParseError } from './errors.js';
import { httpGet } from './http.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the nyc-open-data-catalogue source. */
export const NYC_OPEN_DATA_CATALOGUE_SOURCE_ID = 'nyc-open-data-catalogue';

/** One catalogue entry from the NYC Socrata discovery API. */
export interface NycOpenDataCatalogueEntry {
  /** Four-by-four Socrata dataset id, e.g. "irx2-vgm4". */
  id: string;
  /** Human-readable title of the dataset, map, chart, story, or file. */
  name: string;
  /** What the entry is: "dataset", "map", "chart", "story", or "file". */
  assetType: string;
  /** City topic the entry belongs to, or null when the catalogue lists none. */
  category: string | null;
  /** How the entry is rendered, e.g. "tabular" or "map". */
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

/** One city topic and how many catalogue entries carry it. */
export interface NycOpenDataCategoryCount {
  category: string;
  entryCount: number;
}

/** One page of the New York City catalogue, folded for a story. */
export interface NycOpenDataCatalogue {
  /** One entry per catalogue item in the page. */
  entries: NycOpenDataCatalogueEntry[];
  entryCount: number;
  /** Entries whose asset type is "dataset". */
  datasetCount: number;
  /** Entries whose asset type is "map". */
  mapCount: number;
  /** Entry with the latest creation time. Ties go to the earlier list entry. */
  newestEntry: NycOpenDataCatalogueEntry;
  /** Entry the page has been viewed the most. Ties go to the earlier entry. */
  mostViewedEntry: NycOpenDataCatalogueEntry;
  /** Entry the page has been downloaded the most. Ties go to the earlier entry. */
  mostDownloadedEntry: NycOpenDataCatalogueEntry;
  /** Views across every entry in the page. */
  totalViewCount: number;
  /** Downloads across every entry in the page. */
  totalDownloadCount: number;
  /**
   * Categories in the page, most entries first, ties broken by name. An entry
   * the catalogue lists without a category is counted under "Uncategorised".
   */
  categories: NycOpenDataCategoryCount[];
}

/** Base URL for the New York City Socrata catalogue. */
export const NYC_OPEN_DATA_API_BASE = 'https://data.cityofnewyork.us/api/views.json';

/** How many catalogue entries one request reads. */
export const NYC_OPEN_DATA_CATALOGUE_LIMIT = 50;

/** Committed snapshot, so a build works when the NYC host is unreachable. */
const NYC_OPEN_DATA_FIXTURE_FILENAME = 'nyc-open-data-catalogue-2026-10-19.json';

/** Category bucket the adapter uses for an entry the catalogue lists without one. */
const NYC_OPEN_DATA_UNCATEGORISED = 'Uncategorised';

// The discovery API sends a bare JSON array. A value the catalogue does not
// carry arrives as null, and every count arrives as a number.
const NYC_OPEN_DATA_ENTRY_SCHEMA = z.object({
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

const NYC_OPEN_DATA_PAYLOAD_SCHEMA = z.array(NYC_OPEN_DATA_ENTRY_SCHEMA);

/** Counts entries per category, most entries first, ties by name. */
function countNycOpenDataCategories(
  entries: NycOpenDataCatalogueEntry[]
): NycOpenDataCategoryCount[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const category = entry.category ?? NYC_OPEN_DATA_UNCATEGORISED;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([leftCategory, leftCount], [rightCategory, rightCount]) =>
      leftCount === rightCount ? leftCategory.localeCompare(rightCategory) : rightCount - leftCount
    )
    .map(([category, entryCount]) => ({ category, entryCount }));
}

/** Picks the entry with the latest creation time, ties to the earlier entry. */
function newestNycOpenDataEntry(entries: NycOpenDataCatalogueEntry[]): NycOpenDataCatalogueEntry {
  const first = entries[0];
  if (first === undefined) {
    throw new UsSourceParseError(NYC_OPEN_DATA_CATALOGUE_SOURCE_ID, 'No entries to summarise');
  }
  return entries.reduce(
    (best, entry) => (entry.createdAtEpochSeconds > best.createdAtEpochSeconds ? entry : best),
    first
  );
}

/** Picks the entry with the highest view count, ties to the earlier entry. */
function mostViewedNycOpenDataEntry(
  entries: NycOpenDataCatalogueEntry[]
): NycOpenDataCatalogueEntry {
  const first = entries[0];
  if (first === undefined) {
    throw new UsSourceParseError(NYC_OPEN_DATA_CATALOGUE_SOURCE_ID, 'No entries to summarise');
  }
  return entries.reduce((best, entry) => (entry.viewCount > best.viewCount ? entry : best), first);
}

/** Picks the entry with the highest download count, ties to the earlier entry. */
function mostDownloadedNycOpenDataEntry(
  entries: NycOpenDataCatalogueEntry[]
): NycOpenDataCatalogueEntry {
  const first = entries[0];
  if (first === undefined) {
    throw new UsSourceParseError(NYC_OPEN_DATA_CATALOGUE_SOURCE_ID, 'No entries to summarise');
  }
  return entries.reduce(
    (best, entry) => (entry.downloadCount > best.downloadCount ? entry : best),
    first
  );
}

/**
 * Builds the request URL for one page of the New York City catalogue.
 *
 * The endpoint is keyless. The service answers the whole catalogue by default,
 * so the adapter asks for a short page.
 *
 * @param options - an optional entry cap
 * @returns the full request URL
 */
export function buildNycOpenDataCatalogueUrl(options?: { limit?: number }): string {
  const params = new URLSearchParams({
    limit: String(options?.limit ?? NYC_OPEN_DATA_CATALOGUE_LIMIT),
  });
  return `${NYC_OPEN_DATA_API_BASE}?${params.toString()}`;
}

/**
 * Parses one page of the catalogue into the entries and the city-topic counts.
 *
 * An entry without an id, a name, or a creation time is a changed shape and
 * stops the parse. An empty page also stops the parse, because a catalogue
 * with no entries is not a usable answer.
 *
 * @param payload - the JSON body from the NYC Socrata discovery API
 * @returns the entries in the page, the counts, the totals, and the leaders
 */
export function parseNycOpenDataCataloguePayload(payload: unknown): NycOpenDataCatalogue {
  const parsed = NYC_OPEN_DATA_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(NYC_OPEN_DATA_CATALOGUE_SOURCE_ID, parsed.error.message);
  }
  if (parsed.data.length === 0) {
    throw new UsSourceParseError(
      NYC_OPEN_DATA_CATALOGUE_SOURCE_ID,
      'The response carried no entries'
    );
  }

  const entries: NycOpenDataCatalogueEntry[] = parsed.data.map((row) => {
    if (row.id === undefined || row.name === undefined || row.createdAt === undefined) {
      throw new UsSourceParseError(
        NYC_OPEN_DATA_CATALOGUE_SOURCE_ID,
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
    mapCount: entries.filter((entry) => entry.assetType === 'map').length,
    newestEntry: newestNycOpenDataEntry(entries),
    mostViewedEntry: mostViewedNycOpenDataEntry(entries),
    mostDownloadedEntry: mostDownloadedNycOpenDataEntry(entries),
    totalViewCount: entries.reduce((total, entry) => total + entry.viewCount, 0),
    totalDownloadCount: entries.reduce((total, entry) => total + entry.downloadCount, 0),
    categories: countNycOpenDataCategories(entries),
  };
}

/**
 * Reads one page of the New York City catalogue.
 *
 * One keyless request covers the page and reports what the city portal holds,
 * without reading any dataset's rows.
 *
 * @param options - an optional entry cap and fetch stub
 * @returns the entries in the page, the counts, the totals, and the leaders
 */
export async function fetchNycOpenDataCatalogue(options?: {
  limit?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<NycOpenDataCatalogue> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const url = buildNycOpenDataCatalogueUrl(
    options?.limit === undefined ? {} : { limit: options.limit }
  );
  const response = await httpGet(NYC_OPEN_DATA_CATALOGUE_SOURCE_ID, url, { fetchImpl });
  return parseNycOpenDataCataloguePayload(await response.json());
}

/** New York City Open Data catalogue of datasets and maps, keyless. */
export const nycOpenDataCatalogueAdapter: UsDataAdapter<NycOpenDataCatalogue> = {
  id: NYC_OPEN_DATA_CATALOGUE_SOURCE_ID,
  name: 'NYC Open Data catalogue',
  auth: 'none',
  description:
    'The New York City open data catalogue on Socrata, one row per published dataset or map, with its city topic, view count, and download count.',
  fetchLive: async (options) =>
    fetchNycOpenDataCatalogue(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => parseNycOpenDataCataloguePayload(payload),
  loadFixture: () =>
    parseNycOpenDataCataloguePayload(readFixtureJson(NYC_OPEN_DATA_FIXTURE_FILENAME)),
};
