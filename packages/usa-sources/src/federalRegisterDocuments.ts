import { z } from 'zod';

import { UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpGet } from './http.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the Federal Register documents source. */
export const FEDERAL_REGISTER_DOCUMENTS_SOURCE_ID = 'federal-register-documents';

/** Base URL for the Federal Register documents API. */
export const FEDERAL_REGISTER_API_BASE = 'https://www.federalregister.gov/api/v1/documents.json';

/** Number of documents one request asks for by default. */
export const FEDERAL_REGISTER_DEFAULT_PAGE_SIZE = 10;

/** Order the default request asks the service to use. */
export const FEDERAL_REGISTER_DEFAULT_ORDER = 'newest';

/** One Federal Register document, trimmed to the fields a story reads. */
export interface FederalRegisterDocument {
  /** The register's own document number, e.g. "2026-22789". */
  documentNumber: string;
  title: string;
  /** Document type, e.g. "Rule", "Proposed Rule", "Notice", or "Presidential Document". */
  type: string;
  /** Publication date as YYYY-MM-DD, as the register wrote it. */
  publicationDate: string;
  /** Abstract, or null when the register published none. */
  abstract: string | null;
  /** Agency names the document belongs to. Empty when the register names none. */
  agencies: string[];
  /** Public HTML page for the document. */
  htmlUrl: string;
  /** Public PDF for the document, or "" when the register supplied none. */
  pdfUrl: string;
}

/** One page of Federal Register documents, with the service's page counts. */
export interface FederalRegisterDocumentsPage {
  documents: FederalRegisterDocument[];
  documentCount: number;
  /** Total the service reports for the query. The service caps large result sets. */
  reportedCount: number;
  totalPages: number;
  nextPageUrl: string | null;
}

/** Caller-selected window for one document page. */
export interface FederalRegisterDocumentsQuery {
  perPage?: number;
  page?: number;
  order?: 'newest' | 'oldest' | 'relevance';
}

/** Committed snapshot, so a build works when the Federal Register host is unreachable. */
const FEDERAL_REGISTER_FIXTURE_FILENAME = 'federal-register-documents-2026-11-08.json';

// Every document in the live page carries these fields. The abstract and the
// agency list can be empty, but a missing number, title, or date is a change.
const FEDERAL_REGISTER_DOCUMENT_SCHEMA = z.object({
  document_number: z.string().min(1),
  title: z.string().min(1),
  type: z.string().min(1),
  publication_date: z.string(),
  abstract: z.string().nullable().optional(),
  agencies: z.array(z.object({ name: z.string().optional() })).optional(),
  html_url: z.string().min(1),
  pdf_url: z.string().nullable().optional(),
});

const FEDERAL_REGISTER_PAYLOAD_SCHEMA = z.object({
  count: z.number().int().nonnegative(),
  total_pages: z.number().int().nonnegative(),
  next_page_url: z.string().nullable().optional(),
  results: z.array(FEDERAL_REGISTER_DOCUMENT_SCHEMA),
});

/**
 * Builds the request URL for one page of Federal Register documents.
 *
 * The endpoint is keyless. The default order is newest first, so repeated
 * calls return the documents published most recently.
 *
 * @param query - an optional page size, page number, and order
 * @returns the full request URL
 */
export function buildFederalRegisterDocumentsUrl(
  query: FederalRegisterDocumentsQuery = {}
): string {
  const params = new URLSearchParams({
    per_page: String(query.perPage ?? FEDERAL_REGISTER_DEFAULT_PAGE_SIZE),
    page: String(query.page ?? 1),
    order: query.order ?? FEDERAL_REGISTER_DEFAULT_ORDER,
  });
  return `${FEDERAL_REGISTER_API_BASE}?${params.toString()}`;
}

/** Reads a YYYY-MM-DD date, throwing when the register writes another shape. */
function parseFederalRegisterDate(value: string, documentNumber: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new UsSourceParseError(
      FEDERAL_REGISTER_DOCUMENTS_SOURCE_ID,
      `Document ${documentNumber} carried an unreadable publication date: ${value}`
    );
  }
  return value;
}

/**
 * Parses one page of Federal Register documents.
 *
 * A document without its number, title, type, publication date, or HTML page
 * is a changed shape and stops the parse. An empty result page is valid and
 * returns zero documents with the service's counts.
 *
 * @param payload - the JSON body from the Federal Register documents API
 * @returns the documents on the page and the service's page counts
 */
export function parseFederalRegisterDocumentsPayload(
  payload: unknown
): FederalRegisterDocumentsPage {
  const parsed = FEDERAL_REGISTER_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(FEDERAL_REGISTER_DOCUMENTS_SOURCE_ID, parsed.error.message);
  }

  const documents: FederalRegisterDocument[] = parsed.data.results.map((row) => ({
    documentNumber: row.document_number,
    title: row.title,
    type: row.type,
    publicationDate: parseFederalRegisterDate(row.publication_date, row.document_number),
    abstract: row.abstract ?? null,
    agencies: (row.agencies ?? []).flatMap((agency) =>
      agency.name === undefined || agency.name.trim() === '' ? [] : [agency.name]
    ),
    htmlUrl: row.html_url,
    pdfUrl: row.pdf_url ?? '',
  }));

  return {
    documents,
    documentCount: documents.length,
    reportedCount: parsed.data.count,
    totalPages: parsed.data.total_pages,
    nextPageUrl: parsed.data.next_page_url ?? null,
  };
}

/**
 * Reads one page of Federal Register documents.
 *
 * One keyless request covers the page. The response carries the service
 * count, page total, and next-page URL alongside the documents themselves.
 *
 * @param query - an optional page size, page number, order, and fetch stub
 * @returns the documents on the page and the service's page counts
 */
export async function fetchFederalRegisterDocuments(
  query: FederalRegisterDocumentsQuery & { fetchImpl?: typeof globalThis.fetch } = {}
): Promise<FederalRegisterDocumentsPage> {
  const fetchImpl = query.fetchImpl ?? globalThis.fetch;
  const url = buildFederalRegisterDocumentsUrl({
    ...(query.perPage === undefined ? {} : { perPage: query.perPage }),
    ...(query.page === undefined ? {} : { page: query.page }),
    ...(query.order === undefined ? {} : { order: query.order }),
  });
  const response = await httpGet(FEDERAL_REGISTER_DOCUMENTS_SOURCE_ID, url, { fetchImpl });
  return parseFederalRegisterDocumentsPayload(await response.json());
}

/** Federal Register documents, one row per document, keyless. */
export const federalRegisterDocumentsAdapter: UsDataAdapter<FederalRegisterDocumentsPage> = {
  id: FEDERAL_REGISTER_DOCUMENTS_SOURCE_ID,
  name: 'Federal Register documents',
  auth: 'none',
  description:
    'Documents published in the Federal Register, one row per document, with its type, publication date, agencies, abstract, and public HTML and PDF links.',
  fetchLive: async (options) =>
    fetchFederalRegisterDocuments(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => parseFederalRegisterDocumentsPayload(payload),
  loadFixture: () =>
    parseFederalRegisterDocumentsPayload(readFixtureJson(FEDERAL_REGISTER_FIXTURE_FILENAME)),
};
