import { z } from 'zod';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** One calendar year of complaints. */
export interface CfpComplaintYearCount {
  year: number;
  complaintCount: number;
}

/** One company and how many complaints name it. */
export interface CfpComplaintCompanyCount {
  company: string;
  complaintCount: number;
}

/** One product and how many complaints sit under it. */
export interface CfpComplaintProductCount {
  product: string;
  complaintCount: number;
}

/** The complaint file folded into the shape a story reads. */
export interface CfpConsumerComplaintSeries {
  firstYear: number;
  /** Newest year in the window. The bureau is still filling it. */
  newestYear: number;
  /** Date of the newest complaint in the file, e.g. "2026-10-02". */
  newestReceivedDate: string;
  /** Complaints counted across the window. */
  totalComplaints: number;
  /** One entry per year in the window, oldest first. */
  years: CfpComplaintYearCount[];
  /** Years in the window before the newest one. */
  completeYearCount: number;
  /** Busiest of the years before the newest one. */
  busiestCompleteYear: CfpComplaintYearCount;
  /** Quietest of the years before the newest one. */
  quietestCompleteYear: CfpComplaintYearCount;
  /** Products, most complaints first. */
  topProducts: CfpComplaintProductCount[];
  /** Companies, most complaints first. */
  topCompanies: CfpComplaintCompanyCount[];
}

/** Base URL for the Consumer Complaint Database search API. */
/** The user agent the search API accepts. Its edge rejects undici's default. */
export const CFPB_USER_AGENT = 'usa-open-data-connectors contact@example.com';

export const CFPB_COMPLAINT_SEARCH_API_BASE =
  'https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/';

/**
 * First calendar year the adapter reads.
 *
 * The bureau published its first complaints on 1 December 2011, so that year
 * holds one month. The window keeps it rather than dropping it, and the data
 * note on the page says the first bar covers December only.
 */
export const CFPB_COMPLAINT_FIRST_YEAR = 2011;

/**
 * How many days back the newest-complaint probe walks.
 *
 * The bureau adds complaints every day, but the newest one is normally filed
 * within the last day or two. The probe walks back from today and stops at
 * the first day with a complaint, so a quiet weekend costs a few requests.
 */
export const CFPB_NEWEST_DATE_PROBE_DAYS = 14;

/** How many products and companies one fetch keeps. */
export const CFPB_TOP_LIST_LIMIT = 10;

/** Committed snapshot, so a build works when consumerfinance.gov is unreachable. */
const CFPB_COMPLAINT_FIXTURE_FILENAME = 'cfpb-consumer-complaints-2026-10-03.json';

/** Shape of the totals-only response, `size=0&no_aggs=true`. */
const CFPB_TOTAL_SCHEMA = z.object({
  hits: z.object({ total: z.object({ value: z.number() }) }),
});

const CFPB_BUCKET_SCHEMA = z.object({ key: z.string(), doc_count: z.number() });

// The terms aggregations are nested twice: once for the aggregation name and
// once for the field group, so `product.buckets` sits under `aggregations.product.product`.
const CFPB_AGGREGATIONS_SCHEMA = z.object({
  aggregations: z.object({
    product: z.object({ product: z.object({ buckets: z.array(CFPB_BUCKET_SCHEMA) }) }),
    company: z.object({ company: z.object({ buckets: z.array(CFPB_BUCKET_SCHEMA) }) }),
  }),
});

// The committed snapshot holds the folded counts rather than the raw rows,
// because the full file is more than eighteen million records.
const CFPB_SNAPSHOT_SCHEMA = z.object({
  exportedAt: z.string(),
  firstYear: z.number(),
  newestYear: z.number(),
  newestReceivedDate: z.string(),
  totalComplaints: z.number(),
  years: z.array(z.object({ year: z.number(), complaintCount: z.number() })).min(1),
  topProducts: z.array(z.object({ product: z.string(), complaintCount: z.number() })),
  topCompanies: z.array(z.object({ company: z.string(), complaintCount: z.number() })),
});

/**
 * Builds the request URL for one calendar year of complaint totals.
 *
 * `no_aggs=true` drops the term aggregations the search API computes by
 * default, which takes the response from several hundred kilobytes to about
 * fifteen, and `size=0` drops the rows.
 *
 * @param year - the calendar year to read
 * @returns the full request URL
 */
export function buildCfpComplaintCountUrl(year: number): string {
  const params = new URLSearchParams({
    size: '0',
    no_aggs: 'true',
    date_received_min: `${year}-01-01`,
    date_received_max: `${year}-12-31`,
  });
  return `${CFPB_COMPLAINT_SEARCH_API_BASE}?${params.toString()}`;
}

/**
 * Builds the request URL for one day of complaint totals.
 *
 * @param isoDate - the day to read, e.g. "2026-10-02"
 * @returns the full request URL
 */
export function buildCfpComplaintDayUrl(isoDate: string): string {
  const params = new URLSearchParams({
    size: '0',
    no_aggs: 'true',
    date_received_min: isoDate,
    date_received_max: isoDate,
  });
  return `${CFPB_COMPLAINT_SEARCH_API_BASE}?${params.toString()}`;
}

/**
 * Builds the request URL for the product and company tallies.
 *
 * @returns the full request URL
 */
export function buildCfpComplaintAggregationUrl(): string {
  return `${CFPB_COMPLAINT_SEARCH_API_BASE}?size=0`;
}

/**
 * Reads the total complaint count out of a totals-only response.
 *
 * @param payload - the JSON body from the search API
 * @returns the number of complaints the query matched
 */
export function parseCfpComplaintTotal(payload: unknown): number {
  const parsed = CFPB_TOTAL_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError('cfpb-consumer-complaints', parsed.error.message);
  }
  return parsed.data.hits.total.value;
}

/**
 * Reads the product and company tallies out of an aggregation response.
 *
 * @param payload - the JSON body from the search API with aggregations
 * @returns products and companies, most complaints first
 */
export function parseCfpComplaintAggregations(payload: unknown): {
  topProducts: CfpComplaintProductCount[];
  topCompanies: CfpComplaintCompanyCount[];
} {
  const parsed = CFPB_AGGREGATIONS_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError('cfpb-consumer-complaints', parsed.error.message);
  }
  const topProducts = parsed.data.aggregations.product.product.buckets
    .filter((bucket) => bucket.doc_count > 0)
    .map((bucket) => ({ product: bucket.key, complaintCount: bucket.doc_count }))
    .slice(0, CFPB_TOP_LIST_LIMIT);
  const topCompanies = parsed.data.aggregations.company.company.buckets
    .filter((bucket) => bucket.doc_count > 0)
    .map((bucket) => ({ company: bucket.key, complaintCount: bucket.doc_count }))
    .slice(0, CFPB_TOP_LIST_LIMIT);
  return { topProducts, topCompanies };
}

/** Picks the year with the most, or fewest, complaints. Ties go to the earlier year. */
function extremeYear(
  years: CfpComplaintYearCount[],
  direction: 'most' | 'fewest'
): CfpComplaintYearCount {
  const first = years[0];
  if (first === undefined) {
    throw new UsSourceParseError('cfpb-consumer-complaints', 'No years to summarise');
  }
  return years.reduce((best, year) => {
    if (direction === 'most') {
      return year.complaintCount > best.complaintCount ? year : best;
    }
    return year.complaintCount < best.complaintCount ? year : best;
  }, first);
}

/**
 * Folds one window of year counts into the series a story reads.
 *
 * The newest year in the window is the year the bureau is still filling, so
 * the busiest and quietest years are picked from the years before it.
 *
 * @param input - the year rows and the tallies read alongside them
 * @returns the counts and the named years
 */
export function buildCfpConsumerComplaintSeries(input: {
  firstYear: number;
  newestYear: number;
  newestReceivedDate: string;
  years: CfpComplaintYearCount[];
  topProducts: CfpComplaintProductCount[];
  topCompanies: CfpComplaintCompanyCount[];
}): CfpConsumerComplaintSeries {
  if (input.newestYear <= input.firstYear) {
    throw new UsSourceParseError('cfpb-consumer-complaints', 'The window needs at least two years');
  }
  const first = input.years[0];
  const newest = input.years[input.years.length - 1];
  if (first === undefined || newest === undefined || first.year !== input.firstYear) {
    throw new UsSourceParseError(
      'cfpb-consumer-complaints',
      'The year rows do not cover the window asked for'
    );
  }
  if (newest.year !== input.newestYear) {
    throw new UsSourceParseError(
      'cfpb-consumer-complaints',
      'The year rows do not reach the newest year'
    );
  }
  const totalComplaints = input.years.reduce((sum, year) => sum + year.complaintCount, 0);
  if (totalComplaints === 0) {
    throw new UsSourceParseError('cfpb-consumer-complaints', 'No complaints to summarise');
  }
  const completeYears = input.years.filter((year) => year.year !== input.newestYear);
  if (completeYears.length === 0) {
    throw new UsSourceParseError('cfpb-consumer-complaints', 'No complete year to compare against');
  }

  return {
    firstYear: input.firstYear,
    newestYear: input.newestYear,
    newestReceivedDate: input.newestReceivedDate,
    totalComplaints,
    years: input.years,
    completeYearCount: completeYears.length,
    busiestCompleteYear: extremeYear(completeYears, 'most'),
    quietestCompleteYear: extremeYear(completeYears, 'fewest'),
    topProducts: input.topProducts,
    topCompanies: input.topCompanies,
  };
}

/**
 * Parses the folded counts a committed snapshot holds into the story shape.
 *
 * @param payload - the JSON body of a committed snapshot
 * @returns the counts and the named years
 */
export function parseCfpComplaintSnapshot(payload: unknown): CfpConsumerComplaintSeries {
  const parsed = CFPB_SNAPSHOT_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError('cfpb-consumer-complaints', parsed.error.message);
  }
  return buildCfpConsumerComplaintSeries({
    firstYear: parsed.data.firstYear,
    newestYear: parsed.data.newestYear,
    newestReceivedDate: parsed.data.newestReceivedDate,
    years: parsed.data.years,
    topProducts: parsed.data.topProducts,
    topCompanies: parsed.data.topCompanies,
  });
}

/**
 * Walks back from today to the newest day with a published complaint.
 *
 * The search API has no date sort, so the adapter asks a day at a time and
 * stops at the first non-empty one. That is normally one or two requests.
 *
 * @param fetchImpl - the fetch implementation to use
 * @param today - the day to start from, defaulting to now
 * @returns the newest day with a complaint, e.g. "2026-10-02"
 */
export async function findNewestCfpComplaintDate(
  fetchImpl: typeof globalThis.fetch,
  today: Date = new Date()
): Promise<string> {
  for (let daysBack = 0; daysBack < CFPB_NEWEST_DATE_PROBE_DAYS; daysBack += 1) {
    const day = new Date(today.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const isoDate = day.toISOString().slice(0, 10);
    const response = await fetchImpl(buildCfpComplaintDayUrl(isoDate), {
      headers: { 'User-Agent': CFPB_USER_AGENT },
    });
    if (!response.ok) {
      throw new UsSourceApiError(
        'cfpb-consumer-complaints',
        `HTTP ${response.status} reading the complaint count for ${isoDate}`
      );
    }
    if (parseCfpComplaintTotal(await response.json()) > 0) {
      return isoDate;
    }
  }
  throw new UsSourceApiError(
    'cfpb-consumer-complaints',
    `No complaint found in the last ${String(CFPB_NEWEST_DATE_PROBE_DAYS)} days`
  );
}

/**
 * Reads the complaint database at build time.
 *
 * The search API answers one question per request, so the window costs one
 * request per year plus one for the product and company tallies and one or
 * two to find the newest day. The endpoint is keyless.
 *
 * @param options - an optional window and fetch stub
 * @returns the counts and the named years
 */
export async function fetchCfpConsumerComplaints(options?: {
  firstYear?: number;
  newestYear?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<CfpConsumerComplaintSeries> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const firstYear = options?.firstYear ?? CFPB_COMPLAINT_FIRST_YEAR;
  const newestYear = options?.newestYear ?? new Date().getFullYear();

  const years: CfpComplaintYearCount[] = [];
  for (let year = firstYear; year <= newestYear; year += 1) {
    const response = await fetchImpl(buildCfpComplaintCountUrl(year), {
      headers: { 'User-Agent': CFPB_USER_AGENT },
    });
    if (!response.ok) {
      throw new UsSourceApiError(
        'cfpb-consumer-complaints',
        `HTTP ${response.status} reading the ${String(year)} complaint count`
      );
    }
    years.push({ year, complaintCount: parseCfpComplaintTotal(await response.json()) });
  }

  const aggregationResponse = await fetchImpl(buildCfpComplaintAggregationUrl(), {
    headers: { 'User-Agent': CFPB_USER_AGENT },
  });
  if (!aggregationResponse.ok) {
    throw new UsSourceApiError(
      'cfpb-consumer-complaints',
      `HTTP ${aggregationResponse.status} reading the product and company tallies`
    );
  }
  const { topProducts, topCompanies } = parseCfpComplaintAggregations(
    await aggregationResponse.json()
  );
  const newestReceivedDate = await findNewestCfpComplaintDate(fetchImpl);

  return buildCfpConsumerComplaintSeries({
    firstYear,
    newestYear,
    newestReceivedDate,
    years,
    topProducts,
    topCompanies,
  });
}

/** US Consumer Financial Protection Bureau Consumer Complaint Database, keyless. */
export const cfpbConsumerComplaintsAdapter: UsDataAdapter<CfpConsumerComplaintSeries> = {
  id: 'cfpb-consumer-complaints',
  name: 'CFPB consumer complaints',
  auth: 'none',
  description:
    'Every consumer complaint the Consumer Financial Protection Bureau has sent to a company, counted by year, with the products and companies named most often.',
  fetchLive: async (options) =>
    fetchCfpConsumerComplaints(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => parseCfpComplaintSnapshot(payload),
  loadFixture: () => parseCfpComplaintSnapshot(readFixtureJson(CFPB_COMPLAINT_FIXTURE_FILENAME)),
};
