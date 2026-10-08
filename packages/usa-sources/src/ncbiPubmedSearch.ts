import { z } from 'zod';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { httpGet } from './http.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the NCBI PubMed search source. */
export const NCBI_PUBMED_SEARCH_SOURCE_ID = 'ncbi-pubmed-search';

/** One query's translation and the PubMed ids it matched. */
export interface NcbiPubmedSearchResult {
  /** How many records in PubMed match the query. */
  totalCount: number;
  /** How many ids this response returned. */
  returnedCount: number;
  /** PubMed ids of the matching records, in the order NCBI ranked them. */
  pmids: string[];
  /** Plain-text translation of the query, e.g. how "asthma" expands to MeSH terms. */
  queryTranslation: string;
  /** The query translation broken into field mappings, empty when none are sent. */
  translationSet: NcbiPubmedTranslation[];
}

/** One `from` to `to` mapping in NCBI's query translation. */
export interface NcbiPubmedTranslation {
  from: string;
  to: string;
}

/** Base URL for the NCBI Entrez Utilities API. */
export const NCBI_EUTILS_API_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

/** Path of the PubMed search endpoint. */
export const NCBI_PUBMED_ESEARCH_PATH = '/esearch.fcgi';

/** Search term the committed fixture was captured with. */
export const NCBI_PUBMED_DEFAULT_TERM = 'asthma';

/** Number of ids one request asks for. */
export const NCBI_PUBMED_DEFAULT_RETMAX = 10;

/** Committed snapshot, so a build works when the NCBI host is unreachable. */
const NCBI_PUBMED_FIXTURE_FILENAME = 'ncbi-pubmed-search-2026-10-05.json';

// NCBI sends every count as a string and leaves a field out when it does not
// apply. A rejected query answers 200 with an esearchresult that carries an
// error key rather than an HTTP error.
const NCBI_PUBMED_TRANSLATION_SCHEMA = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

const NCBI_PUBMED_PAYLOAD_SCHEMA = z.object({
  header: z.object({ type: z.string().optional(), version: z.string().optional() }).optional(),
  esearchresult: z
    .object({
      count: z.string().optional(),
      retmax: z.string().optional(),
      retstart: z.string().optional(),
      idlist: z.array(z.string()).optional(),
      querytranslation: z.string().optional(),
      translationset: z.array(NCBI_PUBMED_TRANSLATION_SCHEMA).optional(),
      error: z.string().optional(),
      warninglist: z.object({ phrasesignored: z.array(z.string()).optional() }).optional(),
    })
    .optional(),
});

/**
 * Builds the request URL for one PubMed search.
 *
 * The endpoint is keyless. The default term is the one the committed fixture
 * was captured with, and the default cap of ten ids keeps the response small.
 *
 * @param options - an optional search term and id cap
 * @returns the full request URL
 */
export function buildNcbiPubmedSearchUrl(options?: { term?: string; retmax?: number }): string {
  const params = new URLSearchParams({
    db: 'pubmed',
    term: options?.term ?? NCBI_PUBMED_DEFAULT_TERM,
    retmode: 'json',
    retmax: String(options?.retmax ?? NCBI_PUBMED_DEFAULT_RETMAX),
  });
  return `${NCBI_EUTILS_API_BASE}${NCBI_PUBMED_ESEARCH_PATH}?${params.toString()}`;
}

/**
 * Parses one search response into the count, the ids, and the translation.
 *
 * A response that carries an error key is an API error, even though NCBI
 * answers it with HTTP 200. A count that does not read as a number, or a
 * response without a result block, is a changed shape and stops the parse.
 *
 * @param payload - the JSON body from the NCBI Entrez Utilities API
 * @returns the match count, the PubMed ids, and the query translation
 */
export function parseNcbiPubmedSearchPayload(payload: unknown): NcbiPubmedSearchResult {
  const parsed = NCBI_PUBMED_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(NCBI_PUBMED_SEARCH_SOURCE_ID, parsed.error.message);
  }
  const result = parsed.data.esearchresult;
  if (result === undefined) {
    throw new UsSourceParseError(
      NCBI_PUBMED_SEARCH_SOURCE_ID,
      'The response carried no result block'
    );
  }
  if (result.error !== undefined) {
    throw new UsSourceApiError(NCBI_PUBMED_SEARCH_SOURCE_ID, result.error);
  }

  const totalCount = Number(result.count);
  if (result.count === undefined || !Number.isFinite(totalCount)) {
    throw new UsSourceParseError(
      NCBI_PUBMED_SEARCH_SOURCE_ID,
      `Unreadable match count: ${result.count ?? 'missing'}`
    );
  }

  const pmids = result.idlist ?? [];
  return {
    totalCount,
    returnedCount: pmids.length,
    pmids,
    queryTranslation: result.querytranslation ?? '',
    translationSet: (result.translationset ?? []).flatMap((translation) => {
      if (translation.from === undefined || translation.to === undefined) {
        return [];
      }
      return [{ from: translation.from, to: translation.to }];
    }),
  };
}

/**
 * Runs one PubMed search through the NCBI Entrez Utilities API.
 *
 * One keyless request returns the match count, a page of PubMed ids, and how
 * NCBI translated the query. The response is small, so the adapter asks for
 * ten ids by default.
 *
 * @param options - an optional search term, id cap, and fetch stub
 * @returns the match count, the PubMed ids, and the query translation
 */
export async function fetchNcbiPubmedSearch(options?: {
  term?: string;
  retmax?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<NcbiPubmedSearchResult> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const url = buildNcbiPubmedSearchUrl({
    ...(options?.term === undefined ? {} : { term: options.term }),
    ...(options?.retmax === undefined ? {} : { retmax: options.retmax }),
  });
  const response = await httpGet(NCBI_PUBMED_SEARCH_SOURCE_ID, url, { fetchImpl });
  return parseNcbiPubmedSearchPayload(await response.json());
}

/** NCBI PubMed literature search, one query per request, keyless. */
export const ncbiPubmedSearchAdapter: UsDataAdapter<NcbiPubmedSearchResult> = {
  id: NCBI_PUBMED_SEARCH_SOURCE_ID,
  name: 'NCBI PubMed search',
  auth: 'none',
  description:
    'PubMed literature searches through the NCBI Entrez Utilities API, with the match count, a page of PubMed ids, and how NCBI translated the query.',
  fetchLive: async (options) =>
    fetchNcbiPubmedSearch(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  parse: (payload) => parseNcbiPubmedSearchPayload(payload),
  loadFixture: () => parseNcbiPubmedSearchPayload(readFixtureJson(NCBI_PUBMED_FIXTURE_FILENAME)),
};
