import { z } from 'zod';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the SEC EDGAR submissions source. */
export const SEC_EDGAR_FILINGS_SOURCE_ID = 'sec-edgar-filings';

/**
 * User-Agent header the SEC asks every caller to send.
 *
 * The SEC blocks a request that does not identify its operator, so the
 * adapter sends a descriptive name and a contact address on every call. A
 * real deployment should override the contact with its own address.
 */
export const SEC_EDGAR_USER_AGENT = 'usa-open-data-connectors contact@example.com';

/** One filing in an issuer's recent submissions list. */
export interface SecEdgarFiling {
  /** The SEC's accession number, e.g. "0001958244-26-000636". */
  accessionNumber: string;
  /** Date the filing was made, e.g. "2026-10-02". */
  filingDate: string;
  /** End of the period the filing covers, or null when the form has none. */
  reportDate: string | null;
  /** Form type, e.g. "4" or "10-Q". */
  form: string;
  /** Path to the filing's main document inside the filing archive. */
  primaryDocument: string;
  /** Description of the main document, or null when the form has none. */
  primaryDocDescription: string | null;
  /** Size of the filing in bytes, or null when the SEC did not report one. */
  sizeBytes: number | null;
  /** Whether the filing carries XBRL data. */
  isXbrl: boolean;
  /** Whether the filing carries inline XBRL data. */
  isInlineXbrl: boolean;
}

/** One form type and how many of the recent filings use it. */
export interface SecEdgarFormCount {
  form: string;
  count: number;
}

/** An issuer's profile plus its recent filings, folded for a story. */
export interface SecEdgarCompanyFilings {
  /** Zero-padded Central Index Key, e.g. "0000320193". */
  cik: string;
  /** The issuer's registered name, e.g. "Apple Inc.". */
  name: string;
  entityType: string | null;
  /** Standard Industrial Classification code. */
  sic: string | null;
  sicDescription: string | null;
  /** Exchange tickers, empty when the issuer has none. */
  tickers: string[];
  /** Exchanges the issuer is listed on, empty when it has none. */
  exchanges: string[];
  /** Fiscal year end as the SEC writes it, e.g. "0926". */
  fiscalYearEnd: string | null;
  /** Recent filings, in the order the SEC sends them, newest first. */
  filings: SecEdgarFiling[];
  filingCount: number;
  /** Date of the newest filing in the list, e.g. "2026-10-02". */
  newestFilingDate: string;
  /** Form types, most filings first, ties broken by form name. */
  formCounts: SecEdgarFormCount[];
}

/** Base URL for the SEC EDGAR submissions service. */
export const SEC_EDGAR_SUBMISSIONS_API_BASE = 'https://data.sec.gov/submissions';

/** Apple's Central Index Key, the issuer the committed fixture covers. */
export const SEC_EDGAR_APPLE_CIK = '0000320193';

/** Committed snapshot, so a build works when the SEC host is unreachable. */
const SEC_EDGAR_FIXTURE_FILENAME = 'sec-edgar-filings-2026-10-05.json';

/** Shape of a CIK as the submissions service uses it. */
const CIK_PATTERN = /^\d{1,10}$/;

/** Shape of a filing date, e.g. "2026-10-02". */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// The SEC sends the recent filings as parallel arrays, one array per column,
// rather than one object per row. A field the form does not carry arrives as
// an empty string rather than a missing key.
const SEC_EDGAR_RECENT_SCHEMA = z.object({
  accessionNumber: z.array(z.string()).optional(),
  filingDate: z.array(z.string()).optional(),
  reportDate: z.array(z.string()).optional(),
  form: z.array(z.string()).optional(),
  size: z.array(z.number()).optional(),
  isXBRL: z.array(z.number()).optional(),
  isInlineXBRL: z.array(z.number()).optional(),
  primaryDocument: z.array(z.string()).optional(),
  primaryDocDescription: z.array(z.string()).optional(),
});

const SEC_EDGAR_PAYLOAD_SCHEMA = z.object({
  cik: z.string().optional(),
  name: z.string().optional(),
  entityType: z.string().optional(),
  sic: z.string().optional(),
  sicDescription: z.string().optional(),
  tickers: z.array(z.string()).optional(),
  exchanges: z.array(z.string()).optional(),
  fiscalYearEnd: z.string().optional(),
  stateOfIncorporation: z.string().optional(),
  filings: z.object({ recent: SEC_EDGAR_RECENT_SCHEMA.optional() }).optional(),
});

/**
 * Builds the request URL for one issuer's submissions file.
 *
 * The endpoint is keyless. The CIK is zero-padded to the ten digits the
 * service expects, so a caller can pass "320193" as well as "0000320193".
 *
 * @param cik - the issuer's Central Index Key
 * @returns the full request URL
 */
export function buildSecEdgarSubmissionsUrl(cik: string = SEC_EDGAR_APPLE_CIK): string {
  const trimmed = cik.trim();
  if (!CIK_PATTERN.test(trimmed)) {
    throw new UsSourceParseError(
      SEC_EDGAR_FILINGS_SOURCE_ID,
      `A Central Index Key must be up to ten digits: ${cik}`
    );
  }
  return `${SEC_EDGAR_SUBMISSIONS_API_BASE}/CIK${trimmed.padStart(10, '0')}.json`;
}

/** Reads a column the SEC may omit, as an empty list. */
function columnOrEmpty(column: string[] | undefined): string[] {
  return column ?? [];
}

/**
 * Zips the SEC's parallel filing arrays into one row per filing.
 *
 * The columns are parallel arrays, so a mismatch in their lengths means the
 * response cannot be read as rows and stops the parse. A filing without a
 * readable date is a changed shape and also stops the parse.
 *
 * @param recent - the recent filings object from the submissions file
 * @returns one row per filing, in the order the SEC sent them
 */
function zipSecEdgarFilings(recent: z.infer<typeof SEC_EDGAR_RECENT_SCHEMA>): SecEdgarFiling[] {
  const accessions = columnOrEmpty(recent.accessionNumber);
  const dates = columnOrEmpty(recent.filingDate);
  const reportDates = columnOrEmpty(recent.reportDate);
  const forms = columnOrEmpty(recent.form);
  const sizes = recent.size ?? [];
  const xbrl = recent.isXBRL ?? [];
  const inlineXbrl = recent.isInlineXBRL ?? [];
  const primaryDocuments = columnOrEmpty(recent.primaryDocument);
  const primaryDescriptions = columnOrEmpty(recent.primaryDocDescription);

  const columns: { name: string; values: unknown[] }[] = [
    { name: 'filingDate', values: dates },
    { name: 'reportDate', values: reportDates },
    { name: 'form', values: forms },
    { name: 'size', values: sizes },
    { name: 'isXBRL', values: xbrl },
    { name: 'isInlineXBRL', values: inlineXbrl },
    { name: 'primaryDocument', values: primaryDocuments },
    { name: 'primaryDocDescription', values: primaryDescriptions },
  ];
  for (const column of columns) {
    if (column.values.length !== accessions.length) {
      throw new UsSourceParseError(
        SEC_EDGAR_FILINGS_SOURCE_ID,
        `The ${column.name} column holds ${column.values.length} entries, not ${accessions.length}`
      );
    }
  }

  return accessions.map((accessionNumber, index) => {
    const filingDate = dates[index] ?? '';
    if (!ISO_DATE_PATTERN.test(filingDate)) {
      throw new UsSourceParseError(
        SEC_EDGAR_FILINGS_SOURCE_ID,
        `Unreadable filing date: ${filingDate}`
      );
    }
    return {
      accessionNumber,
      filingDate,
      reportDate: blankToNull(reportDates[index]),
      form: forms[index] ?? '',
      primaryDocument: primaryDocuments[index] ?? '',
      primaryDocDescription: blankToNull(primaryDescriptions[index]),
      sizeBytes: sizes[index] ?? null,
      isXbrl: xbrl[index] === 1,
      isInlineXbrl: inlineXbrl[index] === 1,
    };
  });
}

/** Turns the SEC's empty-string sentinel into null, and keeps real text. */
function blankToNull(value: string | undefined): string | null {
  if (value === undefined || value.trim() === '') {
    return null;
  }
  return value;
}

/** Counts how often each form appears, most filings first, ties by name. */
function countSecEdgarForms(filings: SecEdgarFiling[]): SecEdgarFormCount[] {
  const counts = new Map<string, number>();
  for (const filing of filings) {
    counts.set(filing.form, (counts.get(filing.form) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([leftForm, leftCount], [rightForm, rightCount]) =>
      leftCount === rightCount ? leftForm.localeCompare(rightForm) : rightCount - leftCount
    )
    .map(([form, count]) => ({ form, count }));
}

/**
 * Parses one submissions response into an issuer's profile and recent filings.
 *
 * A response without a filings block, or with parallel arrays that do not line
 * up, stops the parse. A filing without a readable date is a changed shape and
 * also stops the parse.
 *
 * @param payload - the JSON body from the SEC submissions service
 * @returns the issuer's profile, its recent filings, and the form counts
 */
export function parseSecEdgarFilingsPayload(payload: unknown): SecEdgarCompanyFilings {
  const parsed = SEC_EDGAR_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(SEC_EDGAR_FILINGS_SOURCE_ID, parsed.error.message);
  }
  const recent = parsed.data.filings?.recent;
  if (recent === undefined) {
    throw new UsSourceParseError(SEC_EDGAR_FILINGS_SOURCE_ID, 'The response carried no filings');
  }

  const filings = zipSecEdgarFilings(recent);
  if (filings.length === 0) {
    throw new UsSourceParseError(SEC_EDGAR_FILINGS_SOURCE_ID, 'The response carried no filings');
  }

  const newestFilingDate = filings
    .map((filing) => filing.filingDate)
    .sort()
    .at(-1);
  if (newestFilingDate === undefined) {
    throw new UsSourceParseError(SEC_EDGAR_FILINGS_SOURCE_ID, 'No filing date to summarise');
  }

  return {
    cik: parsed.data.cik ?? '',
    name: parsed.data.name ?? '',
    entityType: blankToNull(parsed.data.entityType),
    sic: blankToNull(parsed.data.sic),
    sicDescription: blankToNull(parsed.data.sicDescription),
    tickers: parsed.data.tickers ?? [],
    exchanges: parsed.data.exchanges ?? [],
    fiscalYearEnd: blankToNull(parsed.data.fiscalYearEnd),
    filings,
    filingCount: filings.length,
    newestFilingDate,
    formCounts: countSecEdgarForms(filings),
  };
}

/**
 * Reads one issuer's recent filings from the SEC's submissions service.
 *
 * The SEC asks every caller to identify itself, so the request carries a
 * descriptive User-Agent header. One keyless request covers the issuer's
 * recent filings and a little under a thousand rows.
 *
 * @param options - an optional Central Index Key and fetch stub
 * @returns the issuer's profile, its recent filings, and the form counts
 */
export async function fetchSecEdgarFilings(options?: {
  cik?: string;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<SecEdgarCompanyFilings> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const url = buildSecEdgarSubmissionsUrl(options?.cik ?? SEC_EDGAR_APPLE_CIK);
  const response = await fetchImpl(url, { headers: { 'User-Agent': SEC_EDGAR_USER_AGENT } });
  if (!response.ok) {
    throw new UsSourceApiError(
      SEC_EDGAR_FILINGS_SOURCE_ID,
      `HTTP ${response.status} reading the submissions file`
    );
  }
  return parseSecEdgarFilingsPayload(await response.json());
}

/** SEC EDGAR issuer submissions and recent filings, keyless. */
export const secEdgarFilingsAdapter: UsDataAdapter<SecEdgarCompanyFilings> = {
  id: SEC_EDGAR_FILINGS_SOURCE_ID,
  name: 'SEC EDGAR filings',
  auth: 'none',
  description:
    "An issuer's recent filing history from SEC EDGAR, one row per filing, with the form type and the newest date in the list.",
  fetchLive: async (options) =>
    fetchSecEdgarFilings(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  parse: (payload) => parseSecEdgarFilingsPayload(payload),
  loadFixture: () => parseSecEdgarFilingsPayload(readFixtureJson(SEC_EDGAR_FIXTURE_FILENAME)),
};
