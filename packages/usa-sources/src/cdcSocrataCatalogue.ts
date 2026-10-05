import { z } from 'zod';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the cdc-socrata-catalogue source. */
export const CDC_SOCRATA_CATALOGUE_SOURCE_ID = 'cdc-socrata-catalogue';

/** One catalogue entry from the Socrata discovery API. */
export interface CdcSocrataCatalogueEntry {
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
export interface CdcSocrataCategoryCount {
  category: string;
  entryCount: number;
}

/** One page of the catalogue, folded for a story. */
export interface CdcSocrataCatalogue {
  /** One entry per catalogue item in the page. */
  entries: CdcSocrataCatalogueEntry[];
  entryCount: number;
  /** Entries whose asset type is "dataset". */
  datasetCount: number;
  /** Entry with the latest creation time. Ties go to the earlier list entry. */
  newestEntry: CdcSocrataCatalogueEntry;
  /**
   * Categories in the page, most entries first, ties broken by name. An entry
   * the catalogue lists without a category is counted under "Uncategorised".
   */
  categories: CdcSocrataCategoryCount[];
}

/** Base URL for the CDC Socrata catalogue. */
export const CDC_SOCRATA_CATALOGUE_API_BASE = 'https://data.cdc.gov/api/views.json';

/** How many catalogue entries one request reads. */
export const CDC_SOCRATA_CATALOGUE_LIMIT = 10;

/** Committed snapshot, so a build works when the CDC host is unreachable. */
const CDC_SOCRATA_CATALOGUE_FIXTURE_FILENAME = 'cdc-socrata-catalogue-2026-10-05.json';

/** Category bucket the adapter uses for an entry the catalogue lists without one. */
const CDC_SOCRATA_UNCATEGORISED = 'Uncategorised';

// The discovery API sends a bare JSON array. A value the catalogue does not
// carry arrives as null, and every count arrives as a number.
const CDC_SOCRATA_CATALOGUE_ENTRY_SCHEMA = z.object({
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

const CDC_SOCRATA_CATALOGUE_PAYLOAD_SCHEMA = z.array(CDC_SOCRATA_CATALOGUE_ENTRY_SCHEMA);

/** Counts entries per category, most entries first, ties by name. */
function countCdcSocrataCategories(entries: CdcSocrataCatalogueEntry[]): CdcSocrataCategoryCount[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const category = entry.category ?? CDC_SOCRATA_UNCATEGORISED;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([leftCategory, leftCount], [rightCategory, rightCount]) =>
      leftCount === rightCount ? leftCategory.localeCompare(rightCategory) : rightCount - leftCount
    )
    .map(([category, entryCount]) => ({ category, entryCount }));
}

/** Picks the entry with the latest creation time, ties to the earlier entry. */
function newestCdcSocrataEntry(entries: CdcSocrataCatalogueEntry[]): CdcSocrataCatalogueEntry {
  const first = entries[0];
  if (first === undefined) {
    throw new UsSourceParseError(CDC_SOCRATA_CATALOGUE_SOURCE_ID, 'No entries to summarise');
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
export function buildCdcSocrataCatalogueUrl(options?: { limit?: number }): string {
  const params = new URLSearchParams({
    limit: String(options?.limit ?? CDC_SOCRATA_CATALOGUE_LIMIT),
  });
  return `https://data.cdc.gov/api/views.json?${params.toString()}`;
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
export function parseCdcSocrataCataloguePayload(payload: unknown): CdcSocrataCatalogue {
  const parsed = CDC_SOCRATA_CATALOGUE_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(CDC_SOCRATA_CATALOGUE_SOURCE_ID, parsed.error.message);
  }
  if (parsed.data.length === 0) {
    throw new UsSourceParseError(
      CDC_SOCRATA_CATALOGUE_SOURCE_ID,
      'The response carried no entries'
    );
  }

  const entries: CdcSocrataCatalogueEntry[] = parsed.data.map((row) => {
    if (row.id === undefined || row.name === undefined || row.createdAt === undefined) {
      throw new UsSourceParseError(
        CDC_SOCRATA_CATALOGUE_SOURCE_ID,
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
    newestEntry: newestCdcSocrataEntry(entries),
    categories: countCdcSocrataCategories(entries),
  };
}

/**
 * Reads one page of the CDC catalogue.
 *
 * One keyless request covers the page and reports what the catalogue holds,
 * without reading any dataset's rows.
 *
 * @param options - an optional entry cap and fetch stub
 * @returns the entries in the page, the counts, and the newest entry
 */
export async function fetchCdcSocrataCatalogue(options?: {
  limit?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<CdcSocrataCatalogue> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const url = buildCdcSocrataCatalogueUrl(
    options?.limit === undefined ? {} : { limit: options.limit }
  );
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new UsSourceApiError(
      CDC_SOCRATA_CATALOGUE_SOURCE_ID,
      `HTTP ${response.status} reading the catalogue`
    );
  }
  return parseCdcSocrataCataloguePayload(await response.json());
}

/** CDC Socrata catalogue of datasets, charts, and stories, keyless. */
export const cdcSocrataCatalogueAdapter: UsDataAdapter<CdcSocrataCatalogue> = {
  id: CDC_SOCRATA_CATALOGUE_SOURCE_ID,
  name: 'CDC Socrata catalogue',
  auth: 'none',
  description:
    "The CDC's Socrata catalogue, one row per published dataset, chart, or story, with its category, view count, and download count.",
  fetchLive: async (options) =>
    fetchCdcSocrataCatalogue(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => parseCdcSocrataCataloguePayload(payload),
  loadFixture: () =>
    parseCdcSocrataCataloguePayload(readFixtureJson(CDC_SOCRATA_CATALOGUE_FIXTURE_FILENAME)),
};
