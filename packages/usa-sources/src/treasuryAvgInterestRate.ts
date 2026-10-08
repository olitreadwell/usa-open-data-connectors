import { z } from 'zod';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { httpGet } from './http.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** One month of the average interest rate the Treasury pays on its debt. */
export interface TreasuryInterestRateMonth {
  /** The agency's own date for the row, e.g. "2026-08-31". */
  recordDate: string;
  /** Calendar year the month belongs to. */
  year: number;
  /** Calendar month, 1 for January. */
  month: number;
  /**
   * Average interest rate on the interest-bearing debt outstanding that
   * month, in percent. The agency averages every security in the portfolio,
   * so it is the rate the whole debt carries rather than the rate on
   * anything issued today.
   */
  averageInterestRatePercent: number;
}

/** One published run of the rate, folded down to the points a story leans on. */
export interface TreasuryInterestRateSeries {
  /** One entry per month with a value, oldest first. */
  months: TreasuryInterestRateMonth[];
  monthCount: number;
  firstMonth: TreasuryInterestRateMonth;
  lastMonth: TreasuryInterestRateMonth;
  highest: TreasuryInterestRateMonth;
  lowest: TreasuryInterestRateMonth;
  /** Latest month minus the lowest month, in percentage points. */
  changeSinceLowPercentPoints: number;
  /** Latest month minus the first month, in percentage points. */
  changeFirstToLastPercentPoints: number;
}

/** Base URL for the Treasury Fiscal Data API. */
export const TREASURY_FISCAL_DATA_API_BASE =
  'https://api.fiscaldata.treasury.gov/services/api/fiscal_service';

/** Dataset path for the average interest rates on Treasury securities. */
export const TREASURY_AVG_INTEREST_RATE_PATH = '/v2/accounting/od/avg_interest_rates';

/**
 * Security type the adapter reads.
 *
 * "Interest-bearing Debt" holds the portfolio totals, the same rows the
 * bureau's monthly statement is built from, rather than the rates on the
 * bills, notes, and bonds issued today.
 */
export const TREASURY_AVG_INTEREST_RATE_SECURITY_TYPE = 'Interest-bearing Debt';

/** Security description that carries the whole portfolio's average rate. */
export const TREASURY_AVG_INTEREST_RATE_SECURITY_DESCRIPTION = 'Total Interest-bearing Debt';

/** First year the dataset covers. */
export const TREASURY_AVG_INTEREST_RATE_FIRST_YEAR = 2001;

/**
 * Row cap for one request.
 *
 * The API returns at most 10,000 rows a page and the series is around 300
 * rows, so one request covers the whole run and the adapter never pages.
 */
export const TREASURY_AVG_INTEREST_RATE_ROW_LIMIT = 10_000;

/** Columns the adapter asks for. The dataset carries a date breakdown too. */
const TREASURY_AVG_INTEREST_RATE_COLUMNS =
  'record_date,security_type_desc,security_desc,avg_interest_rate_amt';

/** Committed snapshot, so a build works when the Treasury host is unreachable. */
const TREASURY_AVG_INTEREST_RATE_FIXTURE_FILENAME = 'treasury-avg-interest-rate-2026-09-28.json';

/** Shape of the agency's record date, e.g. "2026-08-31". */
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Every field arrives as a string, and a row the agency could not compute
// arrives without a value. A rejected request answers with an HTTP error and
// a body of {error, message} instead of the data.
const TREASURY_ROW_SCHEMA = z.object({
  record_date: z.string().optional(),
  security_type_desc: z.string().optional(),
  security_desc: z.string().optional(),
  avg_interest_rate_amt: z.string().optional(),
});

const TREASURY_PAYLOAD_SCHEMA = z.object({
  data: z.array(TREASURY_ROW_SCHEMA).optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

/**
 * Builds the request URL for the whole published series.
 *
 * The filter pins the response to the portfolio's own total, so the rows for
 * bills, notes, bonds, and the non-marketable debt never reach the parser.
 * The endpoint is keyless.
 *
 * @param options - an optional security type and row cap
 * @returns the full request URL
 */
export function buildTreasuryAvgInterestRateUrl(options?: {
  securityType?: string;
  rowLimit?: number;
}): string {
  const params = new URLSearchParams({
    fields: TREASURY_AVG_INTEREST_RATE_COLUMNS,
    filter: `security_type_desc:eq:${options?.securityType ?? TREASURY_AVG_INTEREST_RATE_SECURITY_TYPE}`,
    sort: 'record_date',
    'page[size]': String(options?.rowLimit ?? TREASURY_AVG_INTEREST_RATE_ROW_LIMIT),
  });
  return `${TREASURY_FISCAL_DATA_API_BASE}${TREASURY_AVG_INTEREST_RATE_PATH}?${params.toString()}`;
}

/**
 * Parses one response into the months that carry a rate.
 *
 * A row for another security type is a changed filter and stops the parse,
 * so a response that ignored the filter cannot quietly widen the series. A
 * row without a rate is dropped, which is how a month the agency could not
 * compute would arrive. A row without a readable date is a changed shape and
 * also stops the parse.
 *
 * @param payload - the JSON body from the Fiscal Data API
 * @returns the months that carry a rate, in the order the agency sent them
 */
export function parseTreasuryAvgInterestRatePayload(payload: unknown): TreasuryInterestRateMonth[] {
  const parsed = TREASURY_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError('treasury', parsed.error.message);
  }
  if (parsed.data.error !== undefined) {
    throw new UsSourceApiError(
      'treasury',
      parsed.data.message ?? `The API rejected the request: ${parsed.data.error}`
    );
  }

  const rows = parsed.data.data ?? [];
  if (rows.length === 0) {
    throw new UsSourceParseError('treasury', 'The response carried no rows');
  }

  const months: TreasuryInterestRateMonth[] = [];
  for (const row of rows) {
    if (
      row.security_type_desc !== undefined &&
      row.security_type_desc !== TREASURY_AVG_INTEREST_RATE_SECURITY_TYPE
    ) {
      throw new UsSourceParseError(
        'treasury',
        `Unexpected security type in the response: ${row.security_type_desc}`
      );
    }
    if (
      row.security_desc !== undefined &&
      row.security_desc !== TREASURY_AVG_INTEREST_RATE_SECURITY_DESCRIPTION
    ) {
      throw new UsSourceParseError(
        'treasury',
        `Unexpected security in the response: ${row.security_desc}`
      );
    }
    if (row.record_date === undefined) {
      throw new UsSourceParseError('treasury', 'A row carries no record date');
    }
    const match = ISO_DATE_PATTERN.exec(row.record_date);
    if (match === null) {
      throw new UsSourceParseError('treasury', `Unreadable record date: ${row.record_date}`);
    }
    if (row.avg_interest_rate_amt === undefined || row.avg_interest_rate_amt.trim() === '') {
      continue;
    }
    const averageInterestRatePercent = Number(row.avg_interest_rate_amt);
    if (!Number.isFinite(averageInterestRatePercent)) {
      throw new UsSourceParseError(
        'treasury',
        `Unreadable average interest rate: ${row.avg_interest_rate_amt}`
      );
    }
    months.push({
      recordDate: row.record_date,
      year: Number(match[1]),
      month: Number(match[2]),
      averageInterestRatePercent,
    });
  }

  if (months.length === 0) {
    throw new UsSourceParseError('treasury', 'No monthly values in the response');
  }

  return months;
}

/**
 * Folds the parsed months into one series with the headline months named.
 *
 * The months are sorted oldest first, so a caller reading index 0 gets the
 * start of the run and index -1 gets the newest month.
 *
 * @param months - the parsed months, in any order
 * @returns the sorted months, the highest and lowest in the run, and the change
 */
export function buildTreasuryAvgInterestRateSeries(
  months: TreasuryInterestRateMonth[]
): TreasuryInterestRateSeries {
  const sorted = [...months].sort((left, right) => left.recordDate.localeCompare(right.recordDate));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) {
    throw new UsSourceParseError('treasury', 'No months to summarise');
  }

  let highest = first;
  let lowest = first;
  for (const month of sorted) {
    if (month.averageInterestRatePercent > highest.averageInterestRatePercent) {
      highest = month;
    }
    if (month.averageInterestRatePercent < lowest.averageInterestRatePercent) {
      lowest = month;
    }
  }

  return {
    months: sorted,
    monthCount: sorted.length,
    firstMonth: first,
    lastMonth: last,
    highest,
    lowest,
    changeSinceLowPercentPoints:
      last.averageInterestRatePercent - lowest.averageInterestRatePercent,
    changeFirstToLastPercentPoints:
      last.averageInterestRatePercent - first.averageInterestRatePercent,
  };
}

/**
 * Reads the average interest rate on the Treasury's interest-bearing debt.
 *
 * One keyless request covers the whole published run, which starts in
 * January 2001 and answers one row per month.
 *
 * @param options - an optional security type and fetch stub
 * @returns the monthly rates, the highest and lowest months, and the change
 */
export async function fetchTreasuryAvgInterestRates(options?: {
  securityType?: string;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<TreasuryInterestRateSeries> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const url = buildTreasuryAvgInterestRateUrl(
    options?.securityType === undefined ? {} : { securityType: options.securityType }
  );
  const response = await httpGet('treasury', url, { fetchImpl });
  return buildTreasuryAvgInterestRateSeries(
    parseTreasuryAvgInterestRatePayload(await response.json())
  );
}

/** US Treasury average interest rate on the debt outstanding, keyless. */
export const treasuryAvgInterestRateAdapter: UsDataAdapter<TreasuryInterestRateSeries> = {
  id: 'treasury-avg-interest-rate',
  name: 'US Treasury average interest rate',
  auth: 'none',
  description:
    'Average interest rate on the interest-bearing US Treasury debt outstanding, one row per month since 2001.',
  fetchLive: async (options) =>
    fetchTreasuryAvgInterestRates(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) =>
    buildTreasuryAvgInterestRateSeries(parseTreasuryAvgInterestRatePayload(payload)),
  loadFixture: () =>
    buildTreasuryAvgInterestRateSeries(
      parseTreasuryAvgInterestRatePayload(
        readFixtureJson(TREASURY_AVG_INTEREST_RATE_FIXTURE_FILENAME)
      )
    ),
};
