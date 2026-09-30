import { z } from 'zod';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** Source name used in every error this adapter raises. */
const OPENFDA_SOURCE_NAME = 'openfda-food-recalls';

/** One value of a counted openFDA field, with how many records carry it. */
export interface OpenFdaRecallCount {
  /** The value as the agency publishes it, e.g. "Class I". */
  name: string;
  count: number;
}

/** One publication date and the recalls the agency published on it. */
export interface OpenFdaRecallDateCount {
  /** The agency's date stamp, e.g. "20120620". */
  date: string;
  count: number;
}

/**
 * Every response one summary is built from.
 *
 * The live endpoint answers one question per request, so the adapter folds
 * four responses into this shape before it counts anything.
 */
export interface OpenFdaFoodRecallSnapshot {
  /** Enforcement reports in the food endpoint, from the response metadata. */
  recallCount: number;
  /** Recalls published on each date, every classification. */
  reportDates: OpenFdaRecallDateCount[];
  /** Recalls published on each date whose classification is Class I. */
  classOneDates: OpenFdaRecallDateCount[];
  /** Recalls per classification, most first. */
  classifications: OpenFdaRecallCount[];
  /** Recalls per initiator, most first. */
  voluntary: OpenFdaRecallCount[];
}

/** One calendar year of food enforcement reports. */
export interface OpenFdaFoodRecallYear {
  year: number;
  total: number;
  /** Class I recalls: a reasonable chance of serious harm or death. */
  classOne: number;
  /** Every other classification, including Class II and Class III. */
  other: number;
}

/** The food recall file folded into the shape a story reads. */
export interface OpenFdaFoodRecallSummary {
  recallCount: number;
  /** Distinct publication dates in the file. */
  reportDateCount: number;
  /** Oldest publication date, e.g. "2012-06-20". */
  firstReportDate: string;
  /** Newest publication date, e.g. "2026-09-23". */
  newestReportDate: string;
  firstYear: number;
  /** Newest year in the file, which is still open. */
  newestYear: number;
  /** Recalls published against the newest year so far. */
  newestYearCount: number;
  /** One entry per calendar year in the file, oldest first. */
  years: OpenFdaFoodRecallYear[];
  busiestYear: OpenFdaFoodRecallYear;
  classOneCount: number;
  /** Class I recalls as a share of the file, in percent. */
  classOneSharePercent: number;
  classifications: OpenFdaRecallCount[];
  voluntaryCount: number;
  mandatedCount: number;
}

/** Base URL for the openFDA food enforcement endpoint. */
export const OPENFDA_FOOD_ENFORCEMENT_BASE = 'https://api.fda.gov/food/enforcement.json';

/**
 * Classification FDA gives a recall that can seriously harm or kill.
 *
 * The endpoint carries Class I, Class II, Class III, and a handful of
 * unclassified records; Class I is the one the story separates out.
 */
export const OPENFDA_CLASS_ONE = 'Class I';

/** Initiator terms the agency uses for a firm's own recall and a mandated one. */
export const OPENFDA_VOLUNTARY_TERM = 'Voluntary: Firm initiated';
export const OPENFDA_MANDATED_TERM = 'FDA Mandated';

/** Fields the adapter counts on. The endpoint carries exact-term variants. */
export const OPENFDA_REPORT_DATE_FIELD = 'report_date';
export const OPENFDA_CLASSIFICATION_COUNT_FIELD = 'classification.exact';
export const OPENFDA_VOLUNTARY_COUNT_FIELD = 'voluntary_mandated.exact';

/** Committed snapshot, so a build works when the openFDA host is unreachable. */
const OPENFDA_FOOD_RECALL_FIXTURE_FILENAME = 'openfda-food-recalls-2026-09-30.json';

/** Shape of the agency's date stamp, e.g. "20120620". */
const OPENFDA_DATE_PATTERN = /^(\d{4})(\d{2})(\d{2})$/;

// A rejected query answers with HTTP 404 or 400 and a body of
// {error: {code, message}} instead of the data.
const OPENFDA_ERROR_SCHEMA = z.object({
  error: z.object({ code: z.string().optional(), message: z.string().optional() }),
});

const OPENFDA_COUNT_SCHEMA = z.object({
  meta: z.object({ last_updated: z.string().optional() }).optional(),
  results: z.array(z.object({ term: z.string(), count: z.number() })).min(1),
});

// A count of a date field comes back keyed by `time`; every other field is
// keyed by `term`.
const OPENFDA_DATE_COUNT_SCHEMA = z.object({
  meta: z.object({ last_updated: z.string().optional() }).optional(),
  results: z.array(z.object({ time: z.string(), count: z.number() })).min(1),
});

const OPENFDA_TOTAL_SCHEMA = z.object({
  meta: z.object({ results: z.object({ total: z.number() }), last_updated: z.string().optional() }),
});

// The committed snapshot holds the four responses one summary needs, each
// under the key that names the question it answers.
const OPENFDA_FIXTURE_SCHEMA = z.object({
  recallCount: z.number(),
  reportDates: z.array(z.object({ time: z.string(), count: z.number() })),
  classOneDates: z.array(z.object({ time: z.string(), count: z.number() })),
  classifications: z.array(z.object({ term: z.string(), count: z.number() })),
  voluntary: z.array(z.object({ term: z.string(), count: z.number() })),
});

/**
 * Refuses an openFDA body that carries an error instead of data.
 *
 * @param payload - the JSON body from any endpoint on the host
 */
function throwOnOpenFdaError(payload: unknown): void {
  const parsed = OPENFDA_ERROR_SCHEMA.safeParse(payload);
  if (parsed.success) {
    const { code, message } = parsed.data.error;
    throw new UsSourceApiError(
      OPENFDA_SOURCE_NAME,
      `The API rejected the query: ${code ?? 'error'} ${message ?? ''}`.trim()
    );
  }
}

/**
 * Builds the URL that reports how many records the endpoint holds.
 *
 * @returns the request URL
 */
export function buildOpenFdaFoodRecallTotalUrl(): string {
  return `${OPENFDA_FOOD_ENFORCEMENT_BASE}?limit=1`;
}

/**
 * Builds the URL for one counted field, optionally inside a search.
 *
 * @param options - the field to count, and an optional openFDA search clause
 * @returns the request URL
 */
export function buildOpenFdaFoodRecallCountUrl(options?: {
  field?: string;
  search?: string;
}): string {
  const params = new URLSearchParams({
    count: options?.field ?? OPENFDA_REPORT_DATE_FIELD,
  });
  if (options?.search !== undefined) {
    params.set('search', options.search);
  }
  return `${OPENFDA_FOOD_ENFORCEMENT_BASE}?${params.toString()}`;
}

/**
 * Reads the record count out of the metadata block.
 *
 * @param payload - the JSON body from the limit=1 request
 * @returns how many enforcement reports the endpoint holds
 */
export function parseOpenFdaRecallTotal(payload: unknown): number {
  throwOnOpenFdaError(payload);
  const parsed = OPENFDA_TOTAL_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(OPENFDA_SOURCE_NAME, parsed.error.message);
  }
  return parsed.data.meta.results.total;
}

/**
 * Reads one counted field into value and count pairs.
 *
 * @param payload - the JSON body from a count request
 * @returns the values with their counts, in the order the agency sent them
 */
export function parseOpenFdaRecallCounts(payload: unknown): OpenFdaRecallCount[] {
  throwOnOpenFdaError(payload);
  const parsed = OPENFDA_COUNT_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(OPENFDA_SOURCE_NAME, parsed.error.message);
  }
  return parsed.data.results.map((entry) => ({ name: entry.term, count: entry.count }));
}

/**
 * Reads a count of the date field into dated counts.
 *
 * @param payload - the JSON body from a count=report_date request
 * @returns one entry per publication date, in the order the agency sent them
 */
export function parseOpenFdaRecallDateCounts(payload: unknown): OpenFdaRecallDateCount[] {
  throwOnOpenFdaError(payload);
  const parsed = OPENFDA_DATE_COUNT_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(OPENFDA_SOURCE_NAME, parsed.error.message);
  }
  return parsed.data.results.map((entry) => {
    if (OPENFDA_DATE_PATTERN.exec(entry.time) === null) {
      throw new UsSourceParseError(
        OPENFDA_SOURCE_NAME,
        `Unreadable publication date: ${entry.time}`
      );
    }
    return { date: entry.time, count: entry.count };
  });
}

/**
 * Reads the committed snapshot: four responses under the keys that name them.
 *
 * @param payload - the parsed contents of the snapshot file
 * @returns the snapshot in the shape the summary builder reads
 */
export function parseOpenFdaFoodRecallSnapshot(payload: unknown): OpenFdaFoodRecallSnapshot {
  const parsed = OPENFDA_FIXTURE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(OPENFDA_SOURCE_NAME, parsed.error.message);
  }
  return {
    recallCount: parsed.data.recallCount,
    reportDates: parsed.data.reportDates.map((entry) => ({
      date: entry.time,
      count: entry.count,
    })),
    classOneDates: parsed.data.classOneDates.map((entry) => ({
      date: entry.time,
      count: entry.count,
    })),
    classifications: parsed.data.classifications.map((entry) => ({
      name: entry.term,
      count: entry.count,
    })),
    voluntary: parsed.data.voluntary.map((entry) => ({ name: entry.term, count: entry.count })),
  };
}

/** Sums the counts of a dated or named list. */
function sumCounts(entries: { count: number }[]): number {
  return entries.reduce((total, entry) => total + entry.count, 0);
}

/** Counts one dated list by calendar year. */
function countByYear(entries: OpenFdaRecallDateCount[]): Map<number, number> {
  const byYear = new Map<number, number>();
  for (const entry of entries) {
    const year = Number(entry.date.slice(0, 4));
    byYear.set(year, (byYear.get(year) ?? 0) + entry.count);
  }
  return byYear;
}

/** Turns the agency's date stamp into the ISO date a reader recognises. */
export function openFdaReportDateLabel(date: string): string {
  const match = OPENFDA_DATE_PATTERN.exec(date);
  if (match === null) {
    throw new UsSourceParseError(OPENFDA_SOURCE_NAME, `Unreadable publication date: ${date}`);
  }
  return `${match[1] ?? ''}-${match[2] ?? ''}-${match[3] ?? ''}`;
}

/**
 * Folds the four responses into the per-year counts a story reads.
 *
 * Every recall in the file carries a publication date and a classification,
 * so the two counts have to agree: a snapshot whose dates cover fewer recalls
 * than the metadata reports is refused rather than charted short.
 *
 * @param snapshot - the counted responses, all from the same day
 * @returns the per-year counts and the figures the copy quotes
 */
export function buildOpenFdaFoodRecallSummary(
  snapshot: OpenFdaFoodRecallSnapshot
): OpenFdaFoodRecallSummary {
  const { recallCount, reportDates, classOneDates, classifications, voluntary } = snapshot;
  if (reportDates.length === 0) {
    throw new UsSourceParseError(OPENFDA_SOURCE_NAME, 'No publication dates to summarise');
  }

  const datedTotal = sumCounts(reportDates);
  if (datedTotal !== recallCount) {
    throw new UsSourceParseError(
      OPENFDA_SOURCE_NAME,
      `The publication dates cover ${String(datedTotal)} recalls and the endpoint reports ${String(recallCount)}`
    );
  }

  const classOneTotal = sumCounts(classOneDates);
  const classOneInCounts = classifications.find((entry) => entry.name === OPENFDA_CLASS_ONE)?.count;
  if (classOneInCounts !== undefined && classOneInCounts !== classOneTotal) {
    throw new UsSourceParseError(
      OPENFDA_SOURCE_NAME,
      `The Class I dates cover ${String(classOneTotal)} recalls and the classification count reports ${String(classOneInCounts)}`
    );
  }

  const totalByYear = countByYear(reportDates);
  const classOneByYear = countByYear(classOneDates);
  const years: OpenFdaFoodRecallYear[] = [...totalByYear.entries()]
    .map(([year, total]) => {
      const classOne = classOneByYear.get(year) ?? 0;
      return { year, total, classOne, other: total - classOne };
    })
    .sort((left, right) => left.year - right.year);

  const busiestYear = years.reduce((busiest, year) =>
    year.total > busiest.total ? year : busiest
  );
  const first = years[0];
  const last = years[years.length - 1];
  if (first === undefined || last === undefined) {
    throw new UsSourceParseError(OPENFDA_SOURCE_NAME, 'No years to summarise');
  }

  const firstDate = reportDates[0];
  const lastDate = reportDates[reportDates.length - 1];
  if (firstDate === undefined || lastDate === undefined) {
    throw new UsSourceParseError(OPENFDA_SOURCE_NAME, 'No publication dates to summarise');
  }

  return {
    recallCount,
    reportDateCount: reportDates.length,
    firstReportDate: openFdaReportDateLabel(firstDate.date),
    newestReportDate: openFdaReportDateLabel(lastDate.date),
    firstYear: first.year,
    newestYear: last.year,
    newestYearCount: last.total,
    years,
    busiestYear,
    classOneCount: classOneTotal,
    classOneSharePercent: (classOneTotal / recallCount) * 100,
    classifications,
    voluntaryCount: voluntary.find((entry) => entry.name === OPENFDA_VOLUNTARY_TERM)?.count ?? 0,
    mandatedCount: voluntary.find((entry) => entry.name === OPENFDA_MANDATED_TERM)?.count ?? 0,
  };
}

/** Reads one URL as JSON, refusing a response the host did not deliver. */
async function fetchOpenFdaJson(url: string, fetchImpl: typeof globalThis.fetch): Promise<unknown> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new UsSourceApiError(OPENFDA_SOURCE_NAME, `HTTP ${response.status} reading ${url}`);
  }
  return response.json();
}

/**
 * Reads the food enforcement file as four counted responses.
 *
 * Keyless. The endpoint answers one question per request and cannot group by
 * two fields at once, so the per-year Class I counts come from a second date
 * count under a search clause. Without an API key the endpoint allows 240
 * requests a minute and 1,000 a day, and five requests cover the whole file.
 *
 * @param options - an optional fetch stub
 * @returns the per-year counts and the figures the copy quotes
 */
export async function fetchOpenFdaFoodRecalls(options?: {
  fetchImpl?: typeof globalThis.fetch;
}): Promise<OpenFdaFoodRecallSummary> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const [totalPayload, reportDatePayload, classOneDatePayload, classPayload, voluntaryPayload] =
    await Promise.all([
      fetchOpenFdaJson(buildOpenFdaFoodRecallTotalUrl(), fetchImpl),
      fetchOpenFdaJson(
        buildOpenFdaFoodRecallCountUrl({ field: OPENFDA_REPORT_DATE_FIELD }),
        fetchImpl
      ),
      fetchOpenFdaJson(
        buildOpenFdaFoodRecallCountUrl({
          field: OPENFDA_REPORT_DATE_FIELD,
          search: `classification:"${OPENFDA_CLASS_ONE}"`,
        }),
        fetchImpl
      ),
      fetchOpenFdaJson(
        buildOpenFdaFoodRecallCountUrl({ field: OPENFDA_CLASSIFICATION_COUNT_FIELD }),
        fetchImpl
      ),
      fetchOpenFdaJson(
        buildOpenFdaFoodRecallCountUrl({ field: OPENFDA_VOLUNTARY_COUNT_FIELD }),
        fetchImpl
      ),
    ]);

  return buildOpenFdaFoodRecallSummary({
    recallCount: parseOpenFdaRecallTotal(totalPayload),
    reportDates: parseOpenFdaRecallDateCounts(reportDatePayload),
    classOneDates: parseOpenFdaRecallDateCounts(classOneDatePayload),
    classifications: parseOpenFdaRecallCounts(classPayload),
    voluntary: parseOpenFdaRecallCounts(voluntaryPayload),
  });
}

/** openFDA food enforcement reports, keyless. */
export const openFdaFoodRecallsAdapter: UsDataAdapter<OpenFdaFoodRecallSummary> = {
  id: 'openfda-food-recalls',
  name: 'openFDA food enforcement reports',
  auth: 'none',
  description:
    'Every food recall FDA has published as an enforcement report, one record per recall, from June 2012 to the newest publication date.',
  fetchLive: async (options) =>
    fetchOpenFdaFoodRecalls(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => buildOpenFdaFoodRecallSummary(parseOpenFdaFoodRecallSnapshot(payload)),
  loadFixture: () =>
    buildOpenFdaFoodRecallSummary(
      parseOpenFdaFoodRecallSnapshot(readFixtureJson(OPENFDA_FOOD_RECALL_FIXTURE_FILENAME))
    ),
};
