import { z } from 'zod';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the Treasury debt-to-the-penny source. */
export const TREASURY_DEBT_TO_PENNY_SOURCE_ID = 'treasury-debt-to-penny';

/** One business day of the Treasury's outstanding public debt. */
export interface TreasuryDebtToPennyDay {
  /** The agency's own record date, e.g. "1993-04-01". */
  recordDate: string;
  /** Total public debt outstanding that day, in US dollars. */
  totalPublicDebtOutstandingUsd: number;
  /** Debt held by the public, in US dollars, or null when the row omits it. */
  debtHeldByPublicUsd: number | null;
  /** Intragovernmental holdings, in US dollars, or null when the row omits it. */
  intragovernmentalHoldingsUsd: number | null;
}

/** One page of the debt file, folded down to the days a story leans on. */
export interface TreasuryDebtToPennyPage {
  /** One entry per business day in the page, oldest first. */
  days: TreasuryDebtToPennyDay[];
  dayCount: number;
  /** Oldest day in the page. */
  firstDay: TreasuryDebtToPennyDay;
  /** Newest day in the page. */
  lastDay: TreasuryDebtToPennyDay;
  /** Day in the page with the largest total debt outstanding. Ties go to the earlier date. */
  highestTotalDebt: TreasuryDebtToPennyDay;
  /** Day in the page with the smallest total debt outstanding. Ties go to the earlier date. */
  lowestTotalDebt: TreasuryDebtToPennyDay;
}

/** Base URL for the Treasury Fiscal Data API. */
export const TREASURY_DEBT_TO_PENNY_API_BASE =
  'https://api.fiscaldata.treasury.gov/services/api/fiscal_service';

/** Dataset path for the debt to the penny file. */
export const TREASURY_DEBT_TO_PENNY_PATH = '/v2/accounting/od/debt_to_penny';

/**
 * Row cap for one request.
 *
 * The file runs to hundreds of thousands of daily rows, so the adapter reads
 * a short recent page rather than the whole run. The API defaults to
 * oldest-first, the same order the endpoint was probed in on 2026-10-05.
 */
export const TREASURY_DEBT_TO_PENNY_ROW_LIMIT = 10;

/** Committed snapshot, so a build works when the Treasury host is unreachable. */
const TREASURY_DEBT_TO_PENNY_FIXTURE_FILENAME = 'treasury-debt-to-penny-2026-10-05.json';

/** Shape of the agency's record date, e.g. "1993-04-01". */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Every field arrives as a string, and a value the agency could not report
// arrives as the literal text "null". A rejected request answers with an HTTP
// error and a body of {error, message} instead of the data.
const TREASURY_DEBT_ROW_SCHEMA = z.object({
  record_date: z.string().optional(),
  debt_held_public_amt: z.string().optional(),
  intragov_hold_amt: z.string().optional(),
  tot_pub_debt_out_amt: z.string().optional(),
});

const TREASURY_DEBT_PAYLOAD_SCHEMA = z.object({
  data: z.array(TREASURY_DEBT_ROW_SCHEMA).optional(),
  meta: z.object({ count: z.number().optional() }).optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

/**
 * Builds the request URL for one page of the debt file.
 *
 * The endpoint is keyless. The page size is small on purpose: the file holds
 * one row per business day since 1993, so a caller asking for the whole run
 * would read hundreds of thousands of rows.
 *
 * @param options - an optional row cap
 * @returns the full request URL
 */
export function buildTreasuryDebtToPennyUrl(options?: { rowLimit?: number }): string {
  const params = new URLSearchParams({
    'page[size]': String(options?.rowLimit ?? TREASURY_DEBT_TO_PENNY_ROW_LIMIT),
  });
  return `${TREASURY_DEBT_TO_PENNY_API_BASE}${TREASURY_DEBT_TO_PENNY_PATH}?${params.toString()}`;
}

/** Reads an amount the agency sends as a string, or null when it is missing. */
function readTreasuryDebtAmount(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '' || value === 'null') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new UsSourceParseError(
      TREASURY_DEBT_TO_PENNY_SOURCE_ID,
      `Unreadable debt amount: ${value}`
    );
  }
  return parsed;
}

/**
 * Parses one response into the days that carry a total debt figure.
 *
 * A row without a readable date stops the parse, because the file is a date
 * series and an undated row cannot be placed. A row without a total debt
 * figure is dropped, which is how a day the agency could not report arrives.
 *
 * @param payload - the JSON body from the Fiscal Data API
 * @returns the days that carry a total, in the order the agency sent them
 */
export function parseTreasuryDebtToPennyPayload(payload: unknown): TreasuryDebtToPennyDay[] {
  const parsed = TREASURY_DEBT_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(TREASURY_DEBT_TO_PENNY_SOURCE_ID, parsed.error.message);
  }
  if (parsed.data.error !== undefined) {
    throw new UsSourceApiError(
      TREASURY_DEBT_TO_PENNY_SOURCE_ID,
      parsed.data.message ?? `The API rejected the request: ${parsed.data.error}`
    );
  }

  const rows = parsed.data.data ?? [];
  if (rows.length === 0) {
    throw new UsSourceParseError(TREASURY_DEBT_TO_PENNY_SOURCE_ID, 'The response carried no rows');
  }

  const days: TreasuryDebtToPennyDay[] = [];
  for (const row of rows) {
    if (row.record_date === undefined || !ISO_DATE_PATTERN.test(row.record_date)) {
      throw new UsSourceParseError(
        TREASURY_DEBT_TO_PENNY_SOURCE_ID,
        `Unreadable record date: ${row.record_date ?? 'missing'}`
      );
    }
    const totalPublicDebtOutstandingUsd = readTreasuryDebtAmount(row.tot_pub_debt_out_amt);
    if (totalPublicDebtOutstandingUsd === null) {
      continue;
    }
    days.push({
      recordDate: row.record_date,
      totalPublicDebtOutstandingUsd,
      debtHeldByPublicUsd: readTreasuryDebtAmount(row.debt_held_public_amt),
      intragovernmentalHoldingsUsd: readTreasuryDebtAmount(row.intragov_hold_amt),
    });
  }

  if (days.length === 0) {
    throw new UsSourceParseError(
      TREASURY_DEBT_TO_PENNY_SOURCE_ID,
      'No daily values in the response'
    );
  }

  return days;
}

/**
 * Folds the parsed days into one page with the headline days named.
 *
 * The days are sorted oldest first, so a caller reading index 0 gets the
 * oldest day in the page and index -1 gets the newest.
 *
 * @param days - the parsed days, in any order
 * @returns the sorted days, the first and last, and the highest and lowest on the page
 */
export function buildTreasuryDebtToPennyPage(
  days: TreasuryDebtToPennyDay[]
): TreasuryDebtToPennyPage {
  const sorted = [...days].sort((left, right) => left.recordDate.localeCompare(right.recordDate));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) {
    throw new UsSourceParseError(TREASURY_DEBT_TO_PENNY_SOURCE_ID, 'No days to summarise');
  }

  let highest = first;
  let lowest = first;
  for (const day of sorted) {
    if (day.totalPublicDebtOutstandingUsd > highest.totalPublicDebtOutstandingUsd) {
      highest = day;
    }
    if (day.totalPublicDebtOutstandingUsd < lowest.totalPublicDebtOutstandingUsd) {
      lowest = day;
    }
  }

  return {
    days: sorted,
    dayCount: sorted.length,
    firstDay: first,
    lastDay: last,
    highestTotalDebt: highest,
    lowestTotalDebt: lowest,
  };
}

/**
 * Reads one page of the Treasury's debt to the penny file.
 *
 * One keyless request covers the short page the endpoint answers by default,
 * one row per business day.
 *
 * @param options - an optional row cap and fetch stub
 * @returns the daily totals in the page, oldest first, with the extremes named
 */
export async function fetchTreasuryDebtToPenny(options?: {
  rowLimit?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<TreasuryDebtToPennyPage> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const url = buildTreasuryDebtToPennyUrl(
    options?.rowLimit === undefined ? {} : { rowLimit: options.rowLimit }
  );
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new UsSourceApiError(
      TREASURY_DEBT_TO_PENNY_SOURCE_ID,
      `HTTP ${response.status} reading the debt to the penny file`
    );
  }
  return buildTreasuryDebtToPennyPage(parseTreasuryDebtToPennyPayload(await response.json()));
}

/** US Treasury debt to the penny, one row per business day, keyless. */
export const treasuryDebtToPennyAdapter: UsDataAdapter<TreasuryDebtToPennyPage> = {
  id: TREASURY_DEBT_TO_PENNY_SOURCE_ID,
  name: 'US Treasury debt to the penny',
  auth: 'none',
  description:
    'Daily total public debt outstanding the US Treasury reports, in dollars, from the debt to the penny file.',
  fetchLive: async (options) =>
    fetchTreasuryDebtToPenny(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => buildTreasuryDebtToPennyPage(parseTreasuryDebtToPennyPayload(payload)),
  loadFixture: () =>
    buildTreasuryDebtToPennyPage(
      parseTreasuryDebtToPennyPayload(readFixtureJson(TREASURY_DEBT_TO_PENNY_FIXTURE_FILENAME))
    ),
};
