import { z } from 'zod';

import { UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpGet } from './http.js';
import { parseSocrataCatalogueMetadata } from './socrataCatalogueMetadata.js';
import type { UsDataAdapter } from './types.js';

/** Default number of catalogue entries one request reads. */
export const SOCRATA_CATALOGUE_LIMIT = 10;

/** Category bucket used when a catalogue entry carries no category. */
export const SOCRATA_UNCATEGORISED = 'Uncategorised';

/** One catalogue entry from a Socrata discovery API. */
export interface SocrataCatalogueEntry {
  /** Socrata four-by-four id, e.g. "p4pq-bxn9". */
  id: string;
  /** Human-readable title of the dataset, chart, story, map, or file. */
  name: string;
  /** What the entry is, e.g. "dataset", "chart", "story", "map", or "file". */
  assetType: string;
  /** Source topic the entry belongs to, or null when the catalogue lists none. */
  category: string | null;
  /** How the entry is rendered, e.g. "tabular" or "story". */
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

/** One catalogue topic and how many entries carry it. */
export interface SocrataCatalogueCategoryCount {
  category: string;
  entryCount: number;
}

/** One page of a Socrata catalogue, folded for a story. */
export interface SocrataCatalogue {
  /** One entry per catalogue item in the page. */
  entries: SocrataCatalogueEntry[];
  entryCount: number;
  /** Entries whose asset type is "dataset". */
  datasetCount: number;
  /** Entry with the latest creation time. Ties go to the earlier list entry. */
  newestEntry: SocrataCatalogueEntry;
  /**
   * Categories in the page, most entries first, ties broken by name. An entry
   * the catalogue lists without a category is counted under the configured
   * uncategorised label.
   */
  categories: SocrataCatalogueCategoryCount[];
}

/** Configuration for one Socrata catalogue source. */
export interface SocrataCatalogueSource {
  /** Adapter id, used in errors and the registry. */
  sourceId: string;
  /** Base URL of the Socrata discovery API, without the limit parameter. */
  apiBase: string;
  /** Default entry cap. Defaults to {@link SOCRATA_CATALOGUE_LIMIT}. */
  limit?: number;
  /** Category bucket for entries without a category. Defaults to "Uncategorised". */
  uncategorisedLabel?: string;
}

/** Configuration for one Socrata catalogue adapter. */
export interface SocrataCatalogueAdapterConfig extends SocrataCatalogueSource {
  /** Human-readable source name. */
  name: string;
  /** What the adapter reads, in one sentence. */
  description: string;
  /** Filename inside src/fixtures for the committed snapshot. */
  fixtureFilename: string;
}

// The discovery API sends a bare JSON array. A value the catalogue does not
// carry arrives as null, and every count arrives as a number.
const SOCRATA_CATALOGUE_ENTRY_SCHEMA = z.object({
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

const SOCRATA_CATALOGUE_PAYLOAD_SCHEMA = z.array(SOCRATA_CATALOGUE_ENTRY_SCHEMA);

/** Counts entries per category, most entries first, ties by name. */
function countSocrataCategories(
  entries: SocrataCatalogueEntry[],
  uncategorisedLabel: string
): SocrataCatalogueCategoryCount[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const category = entry.category ?? uncategorisedLabel;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([leftCategory, leftCount], [rightCategory, rightCount]) =>
      leftCount === rightCount ? leftCategory.localeCompare(rightCategory) : rightCount - leftCount
    )
    .map(([category, entryCount]) => ({ category, entryCount }));
}

/** Picks the entry with the latest creation time, ties to the earlier entry. */
function newestSocrataEntry(
  sourceId: string,
  entries: SocrataCatalogueEntry[]
): SocrataCatalogueEntry {
  const first = entries[0];
  if (first === undefined) {
    throw new UsSourceParseError(sourceId, 'No entries to summarise');
  }
  return entries.reduce(
    (best, entry) => (entry.createdAtEpochSeconds > best.createdAtEpochSeconds ? entry : best),
    first
  );
}

/**
 * Builds the request URL for one page of a Socrata catalogue.
 *
 * The endpoint is keyless. The service answers the whole catalogue by default,
 * so the adapter asks for a short page unless the caller sets a cap.
 *
 * @param apiBase - the Socrata discovery API URL, without query parameters
 * @param options - an optional entry cap
 * @returns the full request URL
 */
export function buildSocrataCatalogueUrl(apiBase: string, options?: { limit?: number }): string {
  const params = new URLSearchParams({
    limit: String(options?.limit ?? SOCRATA_CATALOGUE_LIMIT),
  });
  return `${apiBase}?${params.toString()}`;
}

/**
 * Parses one page of a Socrata catalogue into entries and topic counts.
 *
 * An entry without an id, a name, or a creation time is a changed shape and
 * stops the parse. An empty page also stops the parse, because a catalogue
 * with no entries is not a usable answer.
 *
 * @param sourceId - adapter id used in parse errors
 * @param payload - the JSON body from the Socrata discovery API
 * @param options - an optional category label for entries without one
 * @returns the entries in the page, the counts, and the newest entry
 */
export function parseSocrataCataloguePayload(
  sourceId: string,
  payload: unknown,
  options?: { uncategorisedLabel?: string }
): SocrataCatalogue {
  const parsed = SOCRATA_CATALOGUE_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(sourceId, parsed.error.message);
  }
  if (parsed.data.length === 0) {
    throw new UsSourceParseError(sourceId, 'The response carried no entries');
  }

  const entries: SocrataCatalogueEntry[] = parsed.data.map((row) => {
    if (row.id === undefined || row.name === undefined || row.createdAt === undefined) {
      throw new UsSourceParseError(
        sourceId,
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
    newestEntry: newestSocrataEntry(sourceId, entries),
    categories: countSocrataCategories(
      entries,
      options?.uncategorisedLabel ?? SOCRATA_UNCATEGORISED
    ),
  };
}

/**
 * Reads one page of a Socrata catalogue.
 *
 * One keyless request covers the page and reports what the portal holds,
 * without reading any dataset's rows.
 *
 * @param source - source id, API base, and optional defaults
 * @param options - an optional entry cap and fetch stub
 * @returns the entries in the page, the counts, and the newest entry
 */
export async function fetchSocrataCatalogue(
  source: SocrataCatalogueSource,
  options?: { limit?: number; fetchImpl?: typeof globalThis.fetch }
): Promise<SocrataCatalogue> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const limit = options?.limit ?? source.limit;
  const url = buildSocrataCatalogueUrl(source.apiBase, limit === undefined ? {} : { limit });
  const response = await httpGet(source.sourceId, url, { fetchImpl });
  return parseSocrataCataloguePayload(
    source.sourceId,
    await response.json(),
    source.uncategorisedLabel === undefined ? {} : { uncategorisedLabel: source.uncategorisedLabel }
  );
}

/**
 * Creates an adapter around one Socrata catalogue endpoint.
 *
 * @param config - source id, endpoint, fixture, and the text the API shows
 * @returns an adapter that fetches, parses, and loads the committed snapshot
 */
export function createSocrataCatalogueAdapter(
  config: SocrataCatalogueAdapterConfig
): UsDataAdapter<SocrataCatalogue> {
  const source: SocrataCatalogueSource = {
    sourceId: config.sourceId,
    apiBase: config.apiBase,
    ...(config.limit === undefined ? {} : { limit: config.limit }),
    ...(config.uncategorisedLabel === undefined
      ? {}
      : { uncategorisedLabel: config.uncategorisedLabel }),
  };
  return {
    id: config.sourceId,
    name: config.name,
    auth: 'none',
    description: config.description,
    fetchLive: async (options) =>
      fetchSocrataCatalogue(
        source,
        options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
      ),
    parse: (payload) =>
      parseSocrataCataloguePayload(
        source.sourceId,
        payload,
        source.uncategorisedLabel === undefined
          ? {}
          : { uncategorisedLabel: source.uncategorisedLabel }
      ),
    loadFixture: () =>
      parseSocrataCataloguePayload(
        source.sourceId,
        readFixtureJson(config.fixtureFilename),
        source.uncategorisedLabel === undefined
          ? {}
          : { uncategorisedLabel: source.uncategorisedLabel }
      ),
  };
}
