import { z } from 'zod';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** One month of mean sea level at a tide gauge. */
export interface NoaaSeaLevelMonth {
  /** Calendar year the month belongs to. */
  year: number;
  /** Calendar month, 1 for January. */
  month: number;
  /**
   * Mean sea level for the month, in metres against the station's tidal
   * datum: the 1983-2001 National Tidal Datum Epoch.
   */
  meanSeaLevelMeters: number;
}

/** One calendar year, averaged from the months the gauge published. */
export interface NoaaSeaLevelYear {
  /** Calendar year the average covers. */
  year: number;
  /** Mean of the monthly values published that year. */
  meanSeaLevelMeters: number;
  /** Months that went into the average. A complete year holds twelve. */
  monthCount: number;
}

/** The gauge a series came from. */
export interface NoaaSeaLevelStation {
  /** Station id as the agency publishes it, e.g. "8518750". */
  id: string;
  /** Station name as the agency publishes it, e.g. "The Battery". */
  name: string;
}

/** One response, as the monthly rows plus the station they came from. */
export interface NoaaSeaLevelPayload {
  station: NoaaSeaLevelStation;
  /** Months with a published value, in the order the agency sent them. */
  months: NoaaSeaLevelMonth[];
}

/** One gauge's record, folded down to the points a story leans on. */
export interface NoaaSeaLevelSeries {
  station: NoaaSeaLevelStation;
  /** One entry per calendar year that has a value, oldest first. */
  years: NoaaSeaLevelYear[];
  yearCount: number;
  firstYear: NoaaSeaLevelYear;
  lastYear: NoaaSeaLevelYear;
  highest: NoaaSeaLevelYear;
  lowest: NoaaSeaLevelYear;
  /** Least-squares trend through the annual means, in millimetres per year. */
  trendMillimetresPerYear: number;
  /** Change from the first year to the last, in metres. */
  changeFirstToLastMeters: number;
}

/** The station and the window one request asks for. */
export interface NoaaSeaLevelQuery {
  /** Station id, e.g. "8518750" for The Battery. */
  stationId: string;
  /** First calendar year in the window. */
  startYear: number;
  /** Last calendar year in the window. */
  endYear: number;
}

/** Base URL for the NOAA CO-OPS data retrieval API. */
export const NOAA_COOPS_API_BASE = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';

/** CO-OPS product id for one row of monthly statistics per month. */
export const NOAA_SEA_LEVEL_PRODUCT = 'monthly_mean';

/**
 * Datum the values are read against.
 *
 * MSL is the station's mean sea level datum, the average of hourly heights
 * over the 1983-2001 National Tidal Datum Epoch. Reading against one fixed
 * epoch is what makes two years in the record comparable.
 */
export const NOAA_SEA_LEVEL_DATUM = 'MSL';

/** Units the adapter asks for: metres. */
export const NOAA_SEA_LEVEL_UNITS = 'metric';

/** Station id for The Battery, New York, the longest sea level record in the country. */
export const NOAA_BATTERY_STATION_ID = '8518750';

/** Name the agency publishes for that gauge. */
export const NOAA_BATTERY_STATION_NAME = 'The Battery';

/** First year the gauge published a monthly mean. */
export const NOAA_SEA_LEVEL_FIRST_YEAR = 1856;

/** Application id sent with each request, so the agency can see the caller. */
export const NOAA_SEA_LEVEL_APPLICATION_ID = 'nzlab-usa-sources';

/** Millimetres in a metre, for the trend's units. */
const MILLIMETRES_PER_METRE = 1000;

/** First day of January, at the start of the month the window opens on. */
const WINDOW_START_DAY = '0101';

/** Last day of December, at the end of the month the window closes on. */
const WINDOW_END_DAY = '1231';

/** Committed snapshot, so a build works when the agency host is unreachable. */
const NOAA_SEA_LEVEL_FIXTURE_FILENAME = 'noaa-sea-level-2026-09-27.json';

// The API sends every field as a string and leaves a blank string where it
// has no value, so each field is optional and read defensively. A JSON level
// error arrives in place of the data when the request is not understood.
const NOAA_MONTH_ROW_SCHEMA = z.object({
  year: z.string().optional(),
  month: z.string().optional(),
  MSL: z.string().optional(),
});

const NOAA_PAYLOAD_SCHEMA = z.object({
  metadata: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
  data: z.array(NOAA_MONTH_ROW_SCHEMA).optional(),
  error: z
    .object({
      message: z.string().optional(),
    })
    .optional(),
});

/** Reads a whole number the API sends as a string, or undefined. */
function readNoaaWholeNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/**
 * Builds the download URL for one gauge and window.
 *
 * One request covers the whole window, because the product returns one row
 * per month rather than one row per reading. The endpoint is keyless.
 *
 * @param query - the station and the first and last year to read
 * @returns the full request URL
 */
export function buildNoaaSeaLevelUrl(query: NoaaSeaLevelQuery): string {
  const params = new URLSearchParams({
    product: NOAA_SEA_LEVEL_PRODUCT,
    application: NOAA_SEA_LEVEL_APPLICATION_ID,
    begin_date: `${query.startYear}${WINDOW_START_DAY}`,
    end_date: `${query.endYear}${WINDOW_END_DAY}`,
    datum: NOAA_SEA_LEVEL_DATUM,
    station: query.stationId,
    time_zone: 'gmt',
    units: NOAA_SEA_LEVEL_UNITS,
    format: 'json',
  });
  return `${NOAA_COOPS_API_BASE}?${params.toString()}`;
}

/**
 * Parses one response into the months that carry a value.
 *
 * The gauge answers with a row for every month in the window. A month it
 * could not compute comes back with a blank value, which is how the early
 * gaps in the record arrive, so those rows are left out rather than counted
 * as zero. A row missing its year or month, or a non-blank value that is not
 * a number, is a changed shape and stops the parse.
 *
 * @param payload - the JSON body from the CO-OPS data retrieval API
 * @returns the station and the months that carry a value
 */
export function parseNoaaSeaLevelPayload(payload: unknown): NoaaSeaLevelPayload {
  const parsed = NOAA_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError('noaa', parsed.error.message);
  }
  if (parsed.data.error !== undefined) {
    throw new UsSourceApiError('noaa', parsed.data.error.message ?? 'The API rejected the request');
  }

  const stationId = parsed.data.metadata?.id;
  const stationName = parsed.data.metadata?.name;
  if (stationId === undefined || stationName === undefined) {
    throw new UsSourceParseError('noaa', 'The response carried no station metadata');
  }

  const months: NoaaSeaLevelMonth[] = [];
  for (const row of parsed.data.data ?? []) {
    const year = readNoaaWholeNumber(row.year);
    const month = readNoaaWholeNumber(row.month);
    if (year === undefined || month === undefined) {
      throw new UsSourceParseError(
        'noaa',
        `A monthly row has no year or month: ${JSON.stringify(row)}`
      );
    }
    if (row.MSL === undefined || row.MSL.trim() === '') {
      continue;
    }
    const meanSeaLevelMeters = Number(row.MSL);
    if (!Number.isFinite(meanSeaLevelMeters)) {
      throw new UsSourceParseError('noaa', `Unreadable mean sea level: ${row.MSL}`);
    }
    months.push({ year, month, meanSeaLevelMeters });
  }

  if (months.length === 0) {
    throw new UsSourceParseError('noaa', 'No monthly values in the response');
  }

  return { station: { id: stationId, name: stationName }, months };
}

/**
 * Fits a straight line through the annual means.
 *
 * The slope of that line is the average rise per year over the window. A
 * positive number means the record climbed; the size of it is how fast, in
 * millimetres per year.
 *
 * @param years - the annual means, in any order
 * @returns the fitted slope in millimetres per year
 */
export function noaaSeaLevelTrendMillimetresPerYear(years: NoaaSeaLevelYear[]): number {
  if (years.length < 2) {
    throw new UsSourceParseError('noaa', 'A trend needs at least two years');
  }

  let sumYears = 0;
  let sumLevels = 0;
  let sumProducts = 0;
  let sumSquares = 0;
  for (const year of years) {
    sumYears += year.year;
    sumLevels += year.meanSeaLevelMeters;
    sumProducts += year.year * year.meanSeaLevelMeters;
    sumSquares += year.year * year.year;
  }

  const count = years.length;
  const denominator = count * sumSquares - sumYears * sumYears;
  if (denominator === 0) {
    throw new UsSourceParseError('noaa', 'Every year in the window is the same year');
  }

  const slope = (count * sumProducts - sumYears * sumLevels) / denominator;
  return slope * MILLIMETRES_PER_METRE;
}

/**
 * Folds the parsed months into one series of calendar-year averages.
 *
 * A year's average is taken over the months the gauge published, so a year
 * with part of its months missing is still counted, and its monthCount says
 * how much of the year it covers.
 *
 * @param payload - the parsed response
 * @returns the annual means, oldest first, plus the highest, the lowest, and the trend
 */
export function buildNoaaSeaLevelSeries(payload: NoaaSeaLevelPayload): NoaaSeaLevelSeries {
  const monthsByYear = new Map<number, number[]>();
  for (const month of payload.months) {
    const values = monthsByYear.get(month.year);
    if (values === undefined) {
      monthsByYear.set(month.year, [month.meanSeaLevelMeters]);
    } else {
      values.push(month.meanSeaLevelMeters);
    }
  }

  const years: NoaaSeaLevelYear[] = [...monthsByYear.entries()]
    .sort(([left], [right]) => left - right)
    .map(([year, values]) => ({
      year,
      meanSeaLevelMeters: values.reduce((total, value) => total + value, 0) / values.length,
      monthCount: values.length,
    }));

  const first = years[0];
  const last = years[years.length - 1];
  if (first === undefined || last === undefined) {
    throw new UsSourceParseError('noaa', 'No years to summarise');
  }

  let highest = first;
  let lowest = first;
  for (const year of years) {
    if (year.meanSeaLevelMeters > highest.meanSeaLevelMeters) {
      highest = year;
    }
    if (year.meanSeaLevelMeters < lowest.meanSeaLevelMeters) {
      lowest = year;
    }
  }

  return {
    station: payload.station,
    years,
    yearCount: years.length,
    firstYear: first,
    lastYear: last,
    highest,
    lowest,
    trendMillimetresPerYear: noaaSeaLevelTrendMillimetresPerYear(years),
    changeFirstToLastMeters: last.meanSeaLevelMeters - first.meanSeaLevelMeters,
  };
}

/**
 * Reads a sea level record from NOAA CO-OPS.
 *
 * The window defaults to the whole record at The Battery, which the gauge
 * has been publishing since 1856.
 *
 * @param options - an optional station, window, and fetch stub
 * @returns the annual means, the headline years, and the trend
 */
export async function fetchNoaaSeaLevel(options?: {
  stationId?: string;
  startYear?: number;
  endYear?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<NoaaSeaLevelSeries> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const url = buildNoaaSeaLevelUrl({
    stationId: options?.stationId ?? NOAA_BATTERY_STATION_ID,
    startYear: options?.startYear ?? NOAA_SEA_LEVEL_FIRST_YEAR,
    endYear: options?.endYear ?? new Date().getFullYear(),
  });
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new UsSourceApiError('noaa', `HTTP ${response.status} reading the sea level record`);
  }
  return buildNoaaSeaLevelSeries(parseNoaaSeaLevelPayload(await response.json()));
}

/** NOAA CO-OPS monthly mean sea level, keyless. */
export const noaaSeaLevelAdapter: UsDataAdapter<NoaaSeaLevelSeries> = {
  id: 'noaa-sea-level',
  name: 'NOAA CO-OPS sea level',
  auth: 'none',
  description:
    'Monthly mean sea level at a NOAA tide gauge, folded into calendar-year averages with a fitted trend.',
  fetchLive: async (options) =>
    fetchNoaaSeaLevel(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  parse: (payload) => buildNoaaSeaLevelSeries(parseNoaaSeaLevelPayload(payload)),
  loadFixture: () =>
    buildNoaaSeaLevelSeries(
      parseNoaaSeaLevelPayload(readFixtureJson(NOAA_SEA_LEVEL_FIXTURE_FILENAME))
    ),
};
