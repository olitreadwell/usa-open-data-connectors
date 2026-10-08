import { z } from 'zod';

import { UsSourceParseError } from './errors.js';
import { httpGet } from './http.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** One water year's peak flow at a river gauge. */
export interface UsgsPeakStreamflowYear {
  /** Water year the agency files the peak under. A water year starts in October. */
  waterYear: number;
  /** Calendar year the peak fell in, which can differ from the water year. */
  calendarYear: number;
  /** Date of the peak day, e.g. "1993-08-01". */
  peakDate: string;
  /** Peak discharge that day, in cubic feet per second. */
  peakDischargeCubicFeetPerSecond: number;
  /**
   * The agency's own qualifiers for the record, e.g. "REGULATED" when a dam
   * controls the river or "MAXDAILYMEAN" when the peak is a daily mean rather
   * than an instantaneous reading. Empty when the agency sent none.
   */
  qualifiers: string[];
}

/** One gauge's peak-flow record, folded down to the points a story leans on. */
export interface UsgsPeakStreamflowSeries {
  /** The agency's own id for the gauge, e.g. "USGS-07010000". */
  monitoringLocationId: string;
  /** One entry per water year that carries a peak, oldest first. */
  years: UsgsPeakStreamflowYear[];
  yearCount: number;
  firstYear: UsgsPeakStreamflowYear;
  lastYear: UsgsPeakStreamflowYear;
  highest: UsgsPeakStreamflowYear;
  lowest: UsgsPeakStreamflowYear;
  /** The middle peak, by value, across the record. */
  median: UsgsPeakStreamflowYear;
  /** Water years between the first and the last that carry no peak row. */
  missingWaterYears: number[];
  /** Highest peak divided by the lowest, rounded to one decimal. */
  highestToLowestRatio: number;
}

/** Base URL for the USGS Water Data OGC API. */
export const USGS_WATER_DATA_API_BASE = 'https://api.waterdata.usgs.gov/ogcapi/v0';

/** Collection holding the annual peak-flow record for every gauge. */
export const USGS_PEAK_STREAMFLOW_COLLECTION = 'peaks';

/** USGS parameter code for discharge, in cubic feet per second. */
export const USGS_DISCHARGE_PARAMETER_CODE = '00060';

/** The gauge the adapter reads by default: the Mississippi River at St. Louis. */
export const USGS_MISSISSIPPI_ST_LOUIS_LOCATION_ID = 'USGS-07010000';

/** Name the agency gives that gauge. */
export const USGS_MISSISSIPPI_ST_LOUIS_LOCATION_NAME = 'Mississippi River at St. Louis, MO';

/** First water year on the default gauge's record. */
export const USGS_PEAK_STREAMFLOW_FIRST_WATER_YEAR = 1844;

/**
 * Row cap for one request.
 *
 * The default gauge's record is 165 rows and the API answers a whole
 * collection in one page at this cap, so the adapter never pages. A record
 * longer than the cap would be a change worth making here rather than a
 * silent truncation.
 */
export const USGS_PEAK_STREAMFLOW_ROW_LIMIT = 500;

/** Committed snapshot, so a build works when the USGS host is unreachable. */
const USGS_PEAK_STREAMFLOW_FIXTURE_FILENAME = 'usgs-peak-streamflow-2026-10-01.json';

/** Shape of the agency's peak date, e.g. "1993-08-01". */
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Every property arrives as a string except the date parts and the water
// year. The API answers an OGC API feature collection, so the numbers sit
// under `properties` rather than at the top of each row.
const USGS_PEAK_ROW_SCHEMA = z.object({
  monitoring_location_id: z.string().optional(),
  parameter_code: z.string().optional(),
  unit_of_measure: z.string().optional(),
  value: z.string().optional(),
  time: z.string().nullable().optional(),
  water_year: z.number().nullable().optional(),
  year: z.number().nullable().optional(),
  qualifier: z.array(z.string()).nullable().optional(),
});

const USGS_PEAK_PAYLOAD_SCHEMA = z.object({
  type: z.string().optional(),
  features: z.array(z.object({ properties: USGS_PEAK_ROW_SCHEMA })).optional(),
});

/**
 * Builds the request URL for one gauge's annual peak-flow record.
 *
 * The filter pins the response to the discharge parameter, so the rows for
 * every other parameter a gauge reports never reach the parser. The endpoint
 * is keyless.
 *
 * @param options - an optional gauge id, parameter code, and row cap
 * @returns the full request URL
 */
export function buildUsgsPeakStreamflowUrl(options?: {
  monitoringLocationId?: string;
  parameterCode?: string;
  rowLimit?: number;
}): string {
  const params = new URLSearchParams({
    monitoring_location_id: options?.monitoringLocationId ?? USGS_MISSISSIPPI_ST_LOUIS_LOCATION_ID,
    parameter_code: options?.parameterCode ?? USGS_DISCHARGE_PARAMETER_CODE,
    limit: String(options?.rowLimit ?? USGS_PEAK_STREAMFLOW_ROW_LIMIT),
  });
  return `${USGS_WATER_DATA_API_BASE}/collections/${USGS_PEAK_STREAMFLOW_COLLECTION}/items?${params.toString()}`;
}

/**
 * Parses one response into the water years that carry a peak.
 *
 * A row for another gauge or another parameter is a changed filter and stops
 * the parse, so a response that ignored the filter cannot quietly widen the
 * series. A row without a value is dropped, which is how a year the agency
 * could not compute would arrive. A row without a readable date or water year
 * is a changed shape and also stops the parse.
 *
 * @param payload - the JSON body from the Water Data API
 * @returns the water years that carry a peak, in the order the agency sent them
 */
export function parseUsgsPeakStreamflowPayload(payload: unknown): UsgsPeakStreamflowYear[] {
  const parsed = USGS_PEAK_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError('usgs-peak-streamflow', parsed.error.message);
  }

  const features = parsed.data.features ?? [];
  if (features.length === 0) {
    throw new UsSourceParseError('usgs-peak-streamflow', 'The response carried no rows');
  }

  const years: UsgsPeakStreamflowYear[] = [];
  for (const feature of features) {
    const row = feature.properties;
    if (
      row.monitoring_location_id !== undefined &&
      row.monitoring_location_id !== USGS_MISSISSIPPI_ST_LOUIS_LOCATION_ID
    ) {
      throw new UsSourceParseError(
        'usgs-peak-streamflow',
        `Unexpected gauge in the response: ${row.monitoring_location_id}`
      );
    }
    if (row.parameter_code !== undefined && row.parameter_code !== USGS_DISCHARGE_PARAMETER_CODE) {
      throw new UsSourceParseError(
        'usgs-peak-streamflow',
        `Unexpected parameter in the response: ${row.parameter_code}`
      );
    }
    if (row.value === undefined || row.value.trim() === '') {
      continue;
    }
    const peakDischargeCubicFeetPerSecond = Number(row.value);
    if (!Number.isFinite(peakDischargeCubicFeetPerSecond)) {
      throw new UsSourceParseError(
        'usgs-peak-streamflow',
        `Unreadable peak discharge: ${row.value}`
      );
    }
    if (row.time === undefined || row.time === null) {
      throw new UsSourceParseError('usgs-peak-streamflow', 'A row carries no peak date');
    }
    const match = ISO_DATE_PATTERN.exec(row.time);
    if (match === null) {
      throw new UsSourceParseError('usgs-peak-streamflow', `Unreadable peak date: ${row.time}`);
    }
    if (row.water_year === undefined || row.water_year === null) {
      throw new UsSourceParseError('usgs-peak-streamflow', `Row ${row.time} carries no water year`);
    }
    years.push({
      waterYear: row.water_year,
      calendarYear: Number(match[1]),
      peakDate: row.time,
      peakDischargeCubicFeetPerSecond,
      qualifiers: row.qualifier ?? [],
    });
  }

  if (years.length === 0) {
    throw new UsSourceParseError('usgs-peak-streamflow', 'No peak values in the response');
  }

  return years;
}

/**
 * Folds the parsed rows into one record with the headline years named.
 *
 * The rows are sorted oldest first, so a caller reading index 0 gets the
 * start of the record. A water year with no row at all is listed in
 * `missingWaterYears` rather than drawn as a zero, because a year the agency
 * never filed is not a year the river ran dry.
 *
 * @param rows - the parsed water years, in any order
 * @param options - the gauge the rows belong to
 * @returns the sorted record, the highest, lowest, and middle years, and the gap list
 */
export function buildUsgsPeakStreamflowSeries(
  rows: UsgsPeakStreamflowYear[],
  options?: { monitoringLocationId?: string }
): UsgsPeakStreamflowSeries {
  const years = [...rows].sort((left, right) => left.waterYear - right.waterYear);
  const first = years[0];
  const last = years[years.length - 1];
  if (first === undefined || last === undefined) {
    throw new UsSourceParseError('usgs-peak-streamflow', 'No water years to summarise');
  }

  let highest = first;
  let lowest = first;
  for (const year of years) {
    if (year.peakDischargeCubicFeetPerSecond > highest.peakDischargeCubicFeetPerSecond) {
      highest = year;
    }
    if (year.peakDischargeCubicFeetPerSecond < lowest.peakDischargeCubicFeetPerSecond) {
      lowest = year;
    }
  }

  const byValue = [...years].sort(
    (left, right) => left.peakDischargeCubicFeetPerSecond - right.peakDischargeCubicFeetPerSecond
  );
  const median = byValue[Math.floor(byValue.length / 2)];
  if (median === undefined) {
    throw new UsSourceParseError('usgs-peak-streamflow', 'No water years to summarise');
  }

  const filed = new Set(years.map((year) => year.waterYear));
  const missingWaterYears: number[] = [];
  for (let waterYear = first.waterYear; waterYear <= last.waterYear; waterYear += 1) {
    if (!filed.has(waterYear)) {
      missingWaterYears.push(waterYear);
    }
  }

  return {
    monitoringLocationId: options?.monitoringLocationId ?? USGS_MISSISSIPPI_ST_LOUIS_LOCATION_ID,
    years,
    yearCount: years.length,
    firstYear: first,
    lastYear: last,
    highest,
    lowest,
    median,
    missingWaterYears,
    highestToLowestRatio:
      Math.round(
        (highest.peakDischargeCubicFeetPerSecond / lowest.peakDischargeCubicFeetPerSecond) * 10
      ) / 10,
  };
}

/**
 * Reads the annual peak-flow record for one gauge.
 *
 * One keyless request covers the whole record. The default gauge, the
 * Mississippi River at St. Louis, answers 165 water years from 1844.
 *
 * @param options - an optional gauge id and fetch stub
 * @returns the record with the highest, lowest, and middle years named
 */
export async function fetchUsgsPeakStreamflow(options?: {
  monitoringLocationId?: string;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<UsgsPeakStreamflowSeries> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const url = buildUsgsPeakStreamflowUrl(
    options?.monitoringLocationId === undefined
      ? {}
      : { monitoringLocationId: options.monitoringLocationId }
  );
  const response = await httpGet('usgs-peak-streamflow', url, { fetchImpl });
  return buildUsgsPeakStreamflowSeries(
    parseUsgsPeakStreamflowPayload(await response.json()),
    options?.monitoringLocationId === undefined
      ? {}
      : { monitoringLocationId: options.monitoringLocationId }
  );
}

/** USGS annual peak streamflow at a gauge, keyless. */
export const usgsPeakStreamflowAdapter: UsDataAdapter<UsgsPeakStreamflowSeries> = {
  id: 'usgs-peak-streamflow',
  name: 'USGS annual peak streamflow',
  auth: 'none',
  description:
    'The annual peak-flow record at a USGS stream gauge, one row per water year, through the USGS Water Data OGC API.',
  fetchLive: async (options) =>
    fetchUsgsPeakStreamflow(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => buildUsgsPeakStreamflowSeries(parseUsgsPeakStreamflowPayload(payload)),
  loadFixture: () =>
    buildUsgsPeakStreamflowSeries(
      parseUsgsPeakStreamflowPayload(readFixtureJson(USGS_PEAK_STREAMFLOW_FIXTURE_FILENAME))
    ),
};
