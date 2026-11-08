import { z } from 'zod';

import { UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpGet } from './http.js';
import { parseSocrataCatalogueMetadata } from './socrataCatalogueMetadata.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the FCC Open Data catalogue source. */
export const FCC_SOCRATA_CATALOGUE_SOURCE_ID = 'fcc-socrata-catalogue';

/** Base URL for the FCC Open Data Socrata catalogue. */
export const FCC_SOCRATA_CATALOGUE_API_BASE = 'https://opendata.fcc.gov/api/views.json';

/** How many catalogue entries one request reads. */
export const FCC_SOCRATA_CATALOGUE_LIMIT = 10;

/** One catalogue entry from the FCC Socrata discovery API. */
export interface FccSocrataCatalogueEntry {
  /** Four-by-four Socrata dataset id, e.g. "jdr4-3q4p". */
  id: string;
  /** Human-readable title of the dataset, chart, story, or file. */
  name: string;
  /** What the entry is: "dataset", "chart", "story", "file", or "href". */
  assetType: string;
  /** Bureau or topic the entry belongs to, or null when the catalogue lists none. */
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
  /** Licence URL the portal attaches to the entry, or "" when it supplies none. */
  licenceUrl: string;
  /** Publishing organisation the portal attaches to the entry, or "" when it supplies none. */
  attribution: string;
}

/** One category and how many catalogue entries carry it. */
export interface FccSocrataCategoryCount {
  category: string;
  entryCount: number;
}

/** One page of the FCC catalogue, folded for a story. */
export interface FccSocrataCatalogue {
  /** One entry per catalogue item in the page. */
  entries: FccSocrataCatalogueEntry[];
  entryCount: number;
  /** Entries whose asset type is "dataset". */
  datasetCount: number;
  /** Entry with the latest creation time. Ties go to the earlier list entry. */
  newestEntry: FccSocrataCatalogueEntry;
  /**
   * Categories in the page, most entries first, ties broken by name. An entry
   * the catalogue lists without a category is counted under "Uncategorised".
   */
  categories: FccSocrataCategoryCount[];
}

/** Committed snapshot, so a build works when the FCC host is unreachable. */
const FCC_SOCRATA_CATALOGUE_FIXTURE_FILENAME = 'fcc-socrata-catalogue-2026-11-08.json';

/** Category bucket the adapter uses for an entry the catalogue lists without one. */
const FCC_SOCRATA_UNCATEGORISED = 'Uncategorised';

// The discovery API sends a bare JSON array. A value the catalogue does not
// carry arrives as null, and every count arrives as a number.
const FCC_SOCRATA_ENTRY_SCHEMA = z.object({
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

const FCC_SOCRATA_PAYLOAD_SCHEMA = z.array(FCC_SOCRATA_ENTRY_SCHEMA);

/** Counts entries per category, most entries first, ties by name. */
function countFccCatalogueCategories(
  entries: FccSocrataCatalogueEntry[]
): FccSocrataCategoryCount[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const category = entry.category ?? FCC_SOCRATA_UNCATEGORISED;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([leftCategory, leftCount], [rightCategory, rightCount]) =>
      leftCount === rightCount ? leftCategory.localeCompare(rightCategory) : rightCount - leftCount
    )
    .map(([category, entryCount]) => ({ category, entryCount }));
}

/** Picks the entry with the latest creation time, ties to the earlier entry. */
function newestFccCatalogueEntry(entries: FccSocrataCatalogueEntry[]): FccSocrataCatalogueEntry {
  const first = entries[0];
  if (first === undefined) {
    throw new UsSourceParseError(FCC_SOCRATA_CATALOGUE_SOURCE_ID, 'No entries to summarise');
  }
  return entries.reduce(
    (best, entry) => (entry.createdAtEpochSeconds > best.createdAtEpochSeconds ? entry : best),
    first
  );
}

/**
 * Builds the request URL for one page of the FCC catalogue.
 *
 * The endpoint is keyless. The service answers the whole catalogue by default,
 * so the adapter asks for a short page.
 *
 * @param options - an optional entry cap
 * @returns the full request URL
 */
export function buildFccSocrataCatalogueUrl(options?: { limit?: number }): string {
  const params = new URLSearchParams({
    limit: String(options?.limit ?? FCC_SOCRATA_CATALOGUE_LIMIT),
  });
  return `${FCC_SOCRATA_CATALOGUE_API_BASE}?${params.toString()}`;
}

/**
 * Parses one page of the FCC catalogue into the entries and category counts.
 *
 * An entry without an id, a name, or a creation time is a changed shape and
 * stops the parse. An empty page also stops the parse, because a catalogue
 * with no entries is not a usable answer.
 *
 * @param payload - the JSON body from the FCC Socrata discovery API
 * @returns the entries in the page, the counts, and the newest entry
 */
export function parseFccSocrataCataloguePayload(payload: unknown): FccSocrataCatalogue {
  const parsed = FCC_SOCRATA_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(FCC_SOCRATA_CATALOGUE_SOURCE_ID, parsed.error.message);
  }
  if (parsed.data.length === 0) {
    throw new UsSourceParseError(
      FCC_SOCRATA_CATALOGUE_SOURCE_ID,
      'The response carried no entries'
    );
  }

  const entries: FccSocrataCatalogueEntry[] = parsed.data.map((row) => {
    if (row.id === undefined || row.name === undefined || row.createdAt === undefined) {
      throw new UsSourceParseError(
        FCC_SOCRATA_CATALOGUE_SOURCE_ID,
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
    newestEntry: newestFccCatalogueEntry(entries),
    categories: countFccCatalogueCategories(entries),
  };
}

/**
 * Reads one page of the Federal Communications Commission catalogue.
 *
 * One keyless request covers the page and reports what the catalogue holds,
 * without reading any dataset's rows.
 *
 * @param options - an optional entry cap and fetch stub
 * @returns the entries in the page, the counts, and the newest entry
 */
export async function fetchFccSocrataCatalogue(options?: {
  limit?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<FccSocrataCatalogue> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const url = buildFccSocrataCatalogueUrl(
    options?.limit === undefined ? {} : { limit: options.limit }
  );
  const response = await httpGet(FCC_SOCRATA_CATALOGUE_SOURCE_ID, url, { fetchImpl });
  return parseFccSocrataCataloguePayload(await response.json());
}

/** Federal Communications Commission catalogue of datasets and stories, keyless. */
export const fccSocrataCatalogueAdapter: UsDataAdapter<FccSocrataCatalogue> = {
  id: FCC_SOCRATA_CATALOGUE_SOURCE_ID,
  name: 'FCC Open Data catalogue',
  auth: 'none',
  description:
    'The Federal Communications Commission Socrata catalogue, one row per published dataset, chart, or story, with its category, view count, and download count.',
  fetchLive: async (options) =>
    fetchFccSocrataCatalogue(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => parseFccSocrataCataloguePayload(payload),
  loadFixture: () =>
    parseFccSocrataCataloguePayload(readFixtureJson(FCC_SOCRATA_CATALOGUE_FIXTURE_FILENAME)),
};
