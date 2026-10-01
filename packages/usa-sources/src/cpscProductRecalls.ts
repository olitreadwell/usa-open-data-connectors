import { z } from 'zod';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** One consumer product recall, trimmed to the fields a story counts. */
export interface CpscProductRecall {
  /** The agency's recall number, e.g. "26156". */
  recallNumber: string;
  /** Date the recall was published, e.g. "2025-12-18". */
  recallDate: string;
  /** Title of the recall notice. */
  title: string;
  /** Names of the products the recall covers. */
  productNames: string[];
  /** Remedies offered, e.g. "Refund" or "Repair". Empty when none are listed. */
  remedyOptions: string[];
  /**
   * Countries that made the recalled product, e.g. "China". A recall names
   * every country involved, so one recall can carry several.
   */
  manufacturerCountries: string[];
}

/** One calendar year of recalls. */
export interface CpscRecallYearCount {
  year: number;
  recallCount: number;
}

/** One remedy option and how many recalls offer it. */
export interface CpscRemedyOptionCount {
  option: string;
  recallCount: number;
}

/** One manufacturer country and how many recalls name it. */
export interface CpscManufacturerCountryCount {
  country: string;
  recallCount: number;
}

/** The recall file folded into the shape a story reads. */
export interface CpscProductRecallSeries {
  firstYear: number;
  /** Newest year in the window. The agency is still filling it. */
  newestYear: number;
  /** Date of the newest recall in the file, e.g. "2026-09-24". */
  newestRecallDate: string;
  totalRecalls: number;
  /** One entry per year in the window, oldest first. A year with no recall keeps its zero row. */
  years: CpscRecallYearCount[];
  /** Years in the window before the newest one, which is complete. */
  completeYearCount: number;
  /** Busiest of the complete years. */
  busiestCompleteYear: CpscRecallYearCount;
  /** Quietest of the complete years. */
  quietestCompleteYear: CpscRecallYearCount;
  /** Remedy options, most recalls first. */
  remedyOptions: CpscRemedyOptionCount[];
  /** Manufacturer countries, most recalls first. */
  manufacturerCountries: CpscManufacturerCountryCount[];
}

/** Window of calendar years one fetch reads. */
export interface CpscRecallWindow {
  firstYear: number;
  newestYear: number;
}

/** Base URL for the SaferProducts.gov recall service. */
export const CPSC_RECALL_API_BASE = 'https://www.saferproducts.gov/RestWebServices/Recall';

/**
 * First calendar year the adapter reads.
 *
 * The service holds recalls from the 1970s, but a story that leans on recent
 * years does not need a fifty-year fetch: every request costs a year of
 * data, and the counts before 2014 are thin enough that the year-to-year
 * shape is noise.
 */
export const CPSC_RECALL_FIRST_YEAR = 2014;

/**
 * Recall id the service uses for an error row.
 *
 * A failed query does not answer with an HTTP error. It answers 200 with a
 * single row whose id is 0 and whose title begins "Error retrieving Recalls",
 * which is why the parser checks the row rather than the status code.
 */
export const CPSC_ERROR_RECALL_ID = 0;

/** Start of the first row the agency sends in the error case. */
const CPSC_ERROR_TITLE_PREFIX = 'Error retrieving Recalls';

/** Committed snapshot, so a build works when the SaferProducts host is unreachable. */
const CPSC_RECALL_FIXTURE_FILENAME = 'cpsc-product-recalls-2026-10-02.json';

/** Shape of the agency's recall date, e.g. "2025-12-18T00:00:00". */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

// Every field arrives as PascalCase. A row the agency could not complete
// arrives with the field null, and the nested arrays arrive as [].
const CPSC_ROW_SCHEMA = z.object({
  RecallID: z.number().optional(),
  RecallNumber: z.string().nullable().optional(),
  RecallDate: z.string().nullable().optional(),
  Title: z.string().nullable().optional(),
  Products: z
    .array(z.object({ Name: z.string().nullable().optional() }))
    .nullable()
    .optional(),
  RemedyOptions: z
    .array(z.object({ Option: z.string().nullable().optional() }))
    .nullable()
    .optional(),
  ManufacturerCountries: z
    .array(z.object({ Country: z.string().nullable().optional() }))
    .nullable()
    .optional(),
});

const CPSC_PAYLOAD_SCHEMA = z.array(CPSC_ROW_SCHEMA);

// The committed snapshot holds the folded counts rather than the year of raw
// rows they came from, because the raw years run to roughly a megabyte each
// and a build only needs the counts.
const CPSC_SNAPSHOT_SCHEMA = z.object({
  exportedAt: z.string(),
  firstYear: z.number(),
  newestYear: z.number(),
  newestRecallDate: z.string(),
  totalRecalls: z.number(),
  years: z.array(z.object({ year: z.number(), recallCount: z.number() })).min(1),
  remedyOptions: z.array(z.object({ option: z.string(), recallCount: z.number() })),
  manufacturerCountries: z.array(z.object({ country: z.string(), recallCount: z.number() })),
});

/** One entry of a nested list, with whichever named field the list carries. */
interface CpscNamedRow {
  Name?: string | null | undefined;
  Option?: string | null | undefined;
  Country?: string | null | undefined;
}

/** Pulls one named field out of a nested list, dropping blank entries. */
function valuesFrom(
  rows: CpscNamedRow[] | null | undefined,
  key: 'Name' | 'Option' | 'Country'
): string[] {
  return (rows ?? []).flatMap((row) => {
    const value = row[key];
    return value === null || value === undefined ? [] : [value];
  });
}

/**
 * Builds the request URL for one calendar year of recalls.
 *
 * The service refuses a range wider than a year with a body reading
 * "The underlying provider failed on Open", so a caller reads one year per
 * request. The endpoint is keyless.
 *
 * @param year - the calendar year to read
 * @returns the full request URL
 */
export function buildCpscRecallUrl(year: number): string {
  const params = new URLSearchParams({
    format: 'json',
    RecallDateStart: `${year}-01-01`,
    RecallDateEnd: `${year}-12-31`,
  });
  return `${CPSC_RECALL_API_BASE}?${params.toString()}`;
}

/**
 * Parses one year's response into the recalls dated inside that year.
 *
 * A failed query answers 200 with a single error row, which stops the parse
 * rather than counting as a recall. A row dated outside the year asked for is
 * dropped, so a response that ignored the date filter cannot widen the year.
 * A row with no recall number or no readable date is a changed shape and also
 * stops the parse.
 *
 * @param payload - the JSON body from the recall service
 * @param year - the calendar year the request asked for
 * @returns the recalls dated inside that year, in the order the agency sent them
 */
export function parseCpscRecallPayload(payload: unknown, year: number): CpscProductRecall[] {
  const parsed = CPSC_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError('cpsc-product-recalls', parsed.error.message);
  }

  const yearPrefix = `${year}-`;
  const recalls: CpscProductRecall[] = [];
  for (const row of parsed.data) {
    if (
      row.RecallID === CPSC_ERROR_RECALL_ID ||
      (row.Title?.startsWith(CPSC_ERROR_TITLE_PREFIX) ?? false)
    ) {
      throw new UsSourceApiError(
        'cpsc-product-recalls',
        row.Title ?? 'The recall service returned an error row'
      );
    }
    if (row.RecallDate === null || row.RecallDate === undefined) {
      continue;
    }
    if (!ISO_DATE_PATTERN.test(row.RecallDate)) {
      throw new UsSourceParseError(
        'cpsc-product-recalls',
        `Unreadable recall date: ${row.RecallDate}`
      );
    }
    if (!row.RecallDate.startsWith(yearPrefix)) {
      continue;
    }
    if (
      row.RecallNumber === null ||
      row.RecallNumber === undefined ||
      row.RecallNumber.trim() === ''
    ) {
      throw new UsSourceParseError(
        'cpsc-product-recalls',
        `Recall dated ${row.RecallDate} carries no number`
      );
    }
    recalls.push({
      recallNumber: row.RecallNumber,
      recallDate: row.RecallDate.slice(0, 10),
      title: row.Title ?? '',
      productNames: valuesFrom(row.Products, 'Name'),
      remedyOptions: valuesFrom(row.RemedyOptions, 'Option'),
      manufacturerCountries: valuesFrom(row.ManufacturerCountries, 'Country'),
    });
  }

  return recalls;
}

/** Counts how often each value appears, in the order the values were seen. */
function countValues(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/** Turns a counted map into a list, most first, ties broken by name. */
function sortCounts<T>(
  counts: Map<string, number>,
  build: (name: string, count: number) => T
): T[] {
  return [...counts.entries()]
    .sort(([leftName, leftCount], [rightName, rightCount]) =>
      leftCount === rightCount ? leftName.localeCompare(rightName) : rightCount - leftCount
    )
    .map(([name, count]) => build(name, count));
}

/** Picks the year with the most, or fewest, recalls. Ties go to the earlier year. */
function extremeYear(
  years: CpscRecallYearCount[],
  direction: 'most' | 'fewest'
): CpscRecallYearCount {
  const first = years[0];
  if (first === undefined) {
    throw new UsSourceParseError('cpsc-product-recalls', 'No years to summarise');
  }
  return years.reduce((best, year) => {
    if (direction === 'most') {
      return year.recallCount > best.recallCount ? year : best;
    }
    return year.recallCount < best.recallCount ? year : best;
  }, first);
}

/** Folds year rows and counted fields into the series a story reads. */
function assembleCpscRecallSeries(input: {
  firstYear: number;
  newestYear: number;
  newestRecallDate: string;
  totalRecalls: number;
  years: CpscRecallYearCount[];
  remedyOptions: CpscRemedyOptionCount[];
  manufacturerCountries: CpscManufacturerCountryCount[];
}): CpscProductRecallSeries {
  const yearTotal = input.years.reduce((sum, year) => sum + year.recallCount, 0);
  if (yearTotal !== input.totalRecalls) {
    throw new UsSourceParseError(
      'cpsc-product-recalls',
      `Year counts add to ${yearTotal}, not the file total of ${input.totalRecalls}`
    );
  }
  const completeYears = input.years.filter((year) => year.year !== input.newestYear);
  if (completeYears.length === 0) {
    throw new UsSourceParseError('cpsc-product-recalls', 'No complete year to compare against');
  }
  const first = input.years[0];
  const newest = input.years[input.years.length - 1];
  if (first === undefined || newest === undefined || first.year !== input.firstYear) {
    throw new UsSourceParseError(
      'cpsc-product-recalls',
      'The year rows do not cover the window asked for'
    );
  }

  return {
    firstYear: input.firstYear,
    newestYear: input.newestYear,
    newestRecallDate: input.newestRecallDate,
    totalRecalls: input.totalRecalls,
    years: input.years,
    completeYearCount: completeYears.length,
    busiestCompleteYear: extremeYear(completeYears, 'most'),
    quietestCompleteYear: extremeYear(completeYears, 'fewest'),
    remedyOptions: input.remedyOptions,
    manufacturerCountries: input.manufacturerCountries,
  };
}

/**
 * Folds one window of recalls into the counts, the busiest and quietest
 * complete years, and the remedy and country tallies.
 *
 * The newest year in the window is the year the agency is still filling, so
 * the busiest and quietest years are picked from the years before it.
 *
 * @param recalls - the recalls read across the window
 * @param window - the first and newest year the fetch covered
 * @returns the counts and the named years
 */
export function buildCpscProductRecallSeries(
  recalls: CpscProductRecall[],
  window: CpscRecallWindow
): CpscProductRecallSeries {
  if (window.newestYear <= window.firstYear) {
    throw new UsSourceParseError('cpsc-product-recalls', 'The window needs at least two years');
  }
  if (recalls.length === 0) {
    throw new UsSourceParseError('cpsc-product-recalls', 'No recalls to summarise');
  }

  const years: CpscRecallYearCount[] = [];
  for (let year = window.firstYear; year <= window.newestYear; year += 1) {
    years.push({ year, recallCount: 0 });
  }
  for (const recall of recalls) {
    const row = years.find((candidate) => candidate.year === Number(recall.recallDate.slice(0, 4)));
    if (row === undefined) {
      throw new UsSourceParseError(
        'cpsc-product-recalls',
        `Recall dated ${recall.recallDate} falls outside the window`
      );
    }
    row.recallCount += 1;
  }

  const dates = recalls.map((recall) => recall.recallDate).sort();
  const newestRecallDate = dates[dates.length - 1];
  if (newestRecallDate === undefined) {
    throw new UsSourceParseError('cpsc-product-recalls', 'No recall date to summarise');
  }

  return assembleCpscRecallSeries({
    firstYear: window.firstYear,
    newestYear: window.newestYear,
    newestRecallDate,
    totalRecalls: recalls.length,
    years,
    remedyOptions: sortCounts(
      countValues(recalls.flatMap((recall) => recall.remedyOptions)),
      (option, recallCount) => ({ option, recallCount })
    ),
    manufacturerCountries: sortCounts(
      countValues(recalls.flatMap((recall) => recall.manufacturerCountries)),
      (country, recallCount) => ({ country, recallCount })
    ),
  });
}

/**
 * Parses the folded counts a snapshot holds into the story shape.
 *
 * A snapshot is written by the daily loop and keeps the counts, not the year
 * of raw rows they came from. The year counts must add to the file total, so
 * a snapshot from a half-finished fetch cannot be read as a smaller file.
 *
 * @param payload - the JSON body of a committed snapshot
 * @returns the counts and the named years
 */
export function parseCpscRecallSnapshot(payload: unknown): CpscProductRecallSeries {
  const parsed = CPSC_SNAPSHOT_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError('cpsc-product-recalls', parsed.error.message);
  }
  return assembleCpscRecallSeries({
    firstYear: parsed.data.firstYear,
    newestYear: parsed.data.newestYear,
    newestRecallDate: parsed.data.newestRecallDate,
    totalRecalls: parsed.data.totalRecalls,
    years: parsed.data.years,
    remedyOptions: parsed.data.remedyOptions,
    manufacturerCountries: parsed.data.manufacturerCountries,
  });
}

/**
 * Reads the recall file one calendar year at a time.
 *
 * The window runs from 2014 to the current year, so a build makes one
 * request per year and reads about thirteen. Each request carries a whole
 * year as JSON: 2025 is 420 rows in about 1.3 MB. A failed query answers
 * 200 with an error row, which the parser turns into a thrown error.
 *
 * @param options - an optional window and fetch stub
 * @returns the counts and the named years
 */
export async function fetchCpscProductRecalls(options?: {
  firstYear?: number;
  newestYear?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<CpscProductRecallSeries> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const firstYear = options?.firstYear ?? CPSC_RECALL_FIRST_YEAR;
  const newestYear = options?.newestYear ?? new Date().getFullYear();

  const recalls: CpscProductRecall[] = [];
  for (let year = firstYear; year <= newestYear; year += 1) {
    const url = buildCpscRecallUrl(year);
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new UsSourceApiError(
        'cpsc-product-recalls',
        `HTTP ${response.status} reading the ${year} recall file`
      );
    }
    recalls.push(...parseCpscRecallPayload(await response.json(), year));
  }

  return buildCpscProductRecallSeries(recalls, { firstYear, newestYear });
}

/** US Consumer Product Safety Commission product recalls, keyless. */
export const cpscProductRecallsAdapter: UsDataAdapter<CpscProductRecallSeries> = {
  id: 'cpsc-product-recalls',
  name: 'CPSC product recalls',
  auth: 'none',
  description:
    'Every consumer product recall the Consumer Product Safety Commission has published, one row per recall, with the remedy offered and the countries that made the product.',
  fetchLive: async (options) =>
    fetchCpscProductRecalls(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => parseCpscRecallSnapshot(payload),
  loadFixture: () => parseCpscRecallSnapshot(readFixtureJson(CPSC_RECALL_FIXTURE_FILENAME)),
};
