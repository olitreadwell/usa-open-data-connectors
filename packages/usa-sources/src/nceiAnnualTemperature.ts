import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { readFixtureText } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** One calendar year of the contiguous United States temperature record. */
export interface NceiTemperatureYear {
  /** The calendar year the average covers. */
  year: number;
  /** Mean temperature over the year, in degrees Fahrenheit. */
  valueFahrenheit: number;
}

/** The annual record, with the points a story leans on. */
export interface NceiTemperatureSeries {
  /** Every year in the record, oldest first. */
  years: NceiTemperatureYear[];
  yearCount: number;
  firstYear: number;
  lastYear: number;
  /** The warmest year in the record. */
  warmest: NceiTemperatureYear;
  /** The coldest year in the record. */
  coldest: NceiTemperatureYear;
  /** Mean of every year in the record, in degrees Fahrenheit. */
  meanFahrenheit: number;
}

/** The window, in years, that one request reads. */
export interface NceiTemperatureQuery {
  /** First year in the window. */
  startYear: number;
  /** Last year in the window. A calendar year needs a full December first. */
  endYear: number;
}

/** Climate at a Glance region id for the contiguous United States. */
export const NCEI_CONTIGUOUS_US_REGION_ID = '110';

/** Climate at a Glance parameter id for average temperature. */
export const NCEI_AVERAGE_TEMPERATURE_PARAMETER_ID = 'tavg';

/**
 * Months in the averaging window.
 *
 * Climate at a Glance labels a window by its length and by the month it ends
 * on. Twelve months ending in December is the calendar year, which is the
 * number a story about a year can compare.
 */
export const NCEI_ANNUAL_WINDOW_MONTHS = 12;

/** Base URL for the Climate at a Glance time series download. */
export const NCEI_CLIMATE_AT_A_GLANCE_BASE =
  'https://www.ncei.noaa.gov/access/monitoring/climate-at-a-glance';

/** First year in the contiguous United States record the agency publishes. */
export const NCEI_FIRST_RECORD_YEAR = 1895;

/** The month an annual row is stamped with: December closes the year. */
const NCEI_ANNUAL_ROW_MONTH = '12';

/** One data row of the CSV: a four digit year, a two digit month, a value. */
const NCEI_DATA_ROW_PATTERN = /^(\d{4})(\d{2}),(.+)$/;

/** Committed snapshot, so a build works when the agency host is unreachable. */
const NCEI_FIXTURE_FILENAME = 'ncei-annual-temperature-2026-09-26.csv';

/**
 * Builds the URL for the annual temperature series.
 *
 * The download is keyless and public domain. One request covers the whole
 * window: the file is one row per year, so two centuries cost about 20 KB.
 *
 * @param query - the first and last year to read
 * @returns the full CSV URL
 */
export function buildNceiAnnualTemperatureUrl(query: NceiTemperatureQuery): string {
  const { startYear, endYear } = query;
  return (
    `${NCEI_CLIMATE_AT_A_GLANCE_BASE}/national/time-series/${NCEI_CONTIGUOUS_US_REGION_ID}` +
    `/${NCEI_AVERAGE_TEMPERATURE_PARAMETER_ID}/${NCEI_ANNUAL_WINDOW_MONTHS}` +
    `/${NCEI_ANNUAL_WINDOW_MONTHS}/${startYear}-${endYear}.csv`
  );
}

/**
 * Parses the Climate at a Glance CSV into one entry per calendar year.
 *
 * The file opens with two comment lines and a header, then carries one row
 * per year as `YYYYMM,value`, where the month is always December because the
 * window is the calendar year. Anything else is treated as a changed shape
 * and stops the parse rather than being dropped in silence.
 *
 * @param csv - the response body from the Climate at a Glance download
 * @returns the years in the file, oldest first
 */
export function parseNceiAnnualTemperatureCsv(csv: string): NceiTemperatureYear[] {
  const years: NceiTemperatureYear[] = [];
  const seen = new Set<number>();

  for (const line of csv.split('\n')) {
    const row = line.trim();
    if (row === '' || row.startsWith('#') || row === 'Date,Value') {
      continue;
    }
    const match = NCEI_DATA_ROW_PATTERN.exec(row);
    if (match === null) {
      throw new UsSourceParseError('ncei', `Unreadable row in the temperature file: ${row}`);
    }
    const [, yearPart, monthPart, valuePart] = match;
    if (
      yearPart === undefined ||
      monthPart === undefined ||
      valuePart === undefined ||
      monthPart !== NCEI_ANNUAL_ROW_MONTH
    ) {
      throw new UsSourceParseError('ncei', `Expected one calendar year per row, got ${row}`);
    }
    const year = Number(yearPart);
    if (seen.has(year)) {
      throw new UsSourceParseError('ncei', `Two rows for ${year}`);
    }
    const valueFahrenheit = Number(valuePart);
    if (!Number.isFinite(valueFahrenheit)) {
      throw new UsSourceParseError('ncei', `Unreadable value in the temperature file: ${row}`);
    }
    seen.add(year);
    years.push({ year, valueFahrenheit });
  }

  if (years.length === 0) {
    throw new UsSourceParseError('ncei', 'No annual rows in the response');
  }

  return years.sort((left, right) => left.year - right.year);
}

/**
 * Folds the parsed years into one series with its headline years.
 *
 * @param years - the years in the file
 * @returns the same years, oldest first, plus the warmest, the coldest, and the mean
 */
export function buildNceiAnnualTemperatureSeries(
  years: NceiTemperatureYear[]
): NceiTemperatureSeries {
  const sorted = [...years].sort((left, right) => left.year - right.year);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) {
    throw new UsSourceParseError('ncei', 'No years to summarise');
  }

  let warmest = first;
  let coldest = first;
  let total = 0;
  for (const row of sorted) {
    total += row.valueFahrenheit;
    if (row.valueFahrenheit > warmest.valueFahrenheit) {
      warmest = row;
    }
    if (row.valueFahrenheit < coldest.valueFahrenheit) {
      coldest = row;
    }
  }

  return {
    years: sorted,
    yearCount: sorted.length,
    firstYear: first.year,
    lastYear: last.year,
    warmest,
    coldest,
    meanFahrenheit: total / sorted.length,
  };
}

/**
 * Reads the annual temperature series from NOAA NCEI.
 *
 * The window defaults to the whole record. The current year joins the file
 * once December has closed it, so the newest row is the last complete
 * calendar year rather than a partial one.
 *
 * @param options - an optional window and fetch stub
 * @returns the years in the window, oldest first, with the headline years
 */
export async function fetchNceiAnnualTemperature(options?: {
  startYear?: number;
  endYear?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<NceiTemperatureSeries> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const url = buildNceiAnnualTemperatureUrl({
    startYear: options?.startYear ?? NCEI_FIRST_RECORD_YEAR,
    endYear: options?.endYear ?? new Date().getFullYear(),
  });
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new UsSourceApiError('ncei', `HTTP ${response.status} reading the temperature series`);
  }
  return buildNceiAnnualTemperatureSeries(parseNceiAnnualTemperatureCsv(await response.text()));
}

/** NOAA NCEI contiguous United States annual average temperature, keyless. */
export const nceiAnnualTemperatureAdapter: UsDataAdapter<NceiTemperatureSeries> = {
  id: 'ncei-annual-temperature',
  name: 'NOAA NCEI contiguous US annual temperature',
  auth: 'none',
  description:
    'Calendar-year average temperature for the contiguous United States since 1895, from the NOAA National Centers for Environmental Information.',
  fetchLive: async (options) =>
    fetchNceiAnnualTemperature(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => {
    if (typeof payload !== 'string') {
      throw new UsSourceParseError('ncei', 'The temperature download is CSV text, not JSON');
    }
    return buildNceiAnnualTemperatureSeries(parseNceiAnnualTemperatureCsv(payload));
  },
  loadFixture: () =>
    buildNceiAnnualTemperatureSeries(
      parseNceiAnnualTemperatureCsv(readFixtureText(NCEI_FIXTURE_FILENAME))
    ),
};
