import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildNceiAnnualTemperatureSeries,
  buildNceiAnnualTemperatureUrl,
  fetchNceiAnnualTemperature,
  NCEI_ANNUAL_WINDOW_MONTHS,
  NCEI_CLIMATE_AT_A_GLANCE_BASE,
  NCEI_FIRST_RECORD_YEAR,
  nceiAnnualTemperatureAdapter,
  parseNceiAnnualTemperatureCsv,
} from './nceiAnnualTemperature.js';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText('ncei-annual-temperature-2026-09-26.csv');

/** A tiny download with the same shape as the real file. */
const SMALL_CSV = [
  '# "Contiguous U.S. January-December Average Temperature"',
  '# Units: Degrees Fahrenheit',
  'Date,Value',
  '189512,50.33',
  '189612,51.98',
  '',
].join('\n');

describe('buildNceiAnnualTemperatureUrl', () => {
  it('asks for the calendar year series for the window', () => {
    expect(buildNceiAnnualTemperatureUrl({ startYear: 1895, endYear: 2026 })).toBe(
      `${NCEI_CLIMATE_AT_A_GLANCE_BASE}/national/time-series/110/tavg/12/12/1895-2026.csv`
    );
  });

  it('keeps the window length and the window end on the same number', () => {
    const url = buildNceiAnnualTemperatureUrl({ startYear: 1990, endYear: 2000 });
    const window = url.split('/').slice(-3, -1);
    expect(window).toEqual([String(NCEI_ANNUAL_WINDOW_MONTHS), String(NCEI_ANNUAL_WINDOW_MONTHS)]);
  });
});

describe('parseNceiAnnualTemperatureCsv', () => {
  it('reads one row per year, oldest first', () => {
    const years = parseNceiAnnualTemperatureCsv(FIXTURE);
    expect(years).toHaveLength(131);
    expect(years[0]).toEqual({ year: 1895, valueFahrenheit: 50.33 });
    expect(years[years.length - 1]).toEqual({ year: 2025, valueFahrenheit: 54.62 });
    const order = years.map((row) => row.year);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
  });

  it('skips the comment lines and the header', () => {
    expect(parseNceiAnnualTemperatureCsv(SMALL_CSV)).toEqual([
      { year: 1895, valueFahrenheit: 50.33 },
      { year: 1896, valueFahrenheit: 51.98 },
    ]);
  });

  it('refuses a file that holds more than one row for a year', () => {
    const monthly = ['# comment', 'Date,Value', '189501,26.69', '189502,26.6', ''].join('\n');
    expect(() => parseNceiAnnualTemperatureCsv(monthly)).toThrow(UsSourceParseError);
  });

  it('refuses a row it cannot read', () => {
    const badRow = ['Date,Value', 'not a row', ''].join('\n');
    expect(() => parseNceiAnnualTemperatureCsv(badRow)).toThrow(UsSourceParseError);
  });

  it('refuses a value that is not a number', () => {
    expect(() => parseNceiAnnualTemperatureCsv('Date,Value\n189512,warm\n')).toThrow(
      UsSourceParseError
    );
  });

  it('refuses a file with no rows', () => {
    expect(() => parseNceiAnnualTemperatureCsv('# only a comment\n')).toThrow(UsSourceParseError);
  });
});

describe('buildNceiAnnualTemperatureSeries', () => {
  it('picks out the warmest and coldest years and the mean', () => {
    const series = buildNceiAnnualTemperatureSeries(parseNceiAnnualTemperatureCsv(FIXTURE));
    expect(series.yearCount).toBe(131);
    expect(series.firstYear).toBe(NCEI_FIRST_RECORD_YEAR);
    expect(series.lastYear).toBe(2025);
    expect(series.warmest).toEqual({ year: 2024, valueFahrenheit: 55.48 });
    expect(series.coldest).toEqual({ year: 1917, valueFahrenheit: 50.05 });
    expect(series.meanFahrenheit).toBeCloseTo(52.31, 2);
  });

  it('refuses an empty series', () => {
    expect(() => buildNceiAnnualTemperatureSeries([])).toThrow(UsSourceParseError);
  });
});

describe('fetchNceiAnnualTemperature', () => {
  it('reads the window it is asked for and returns the series', async () => {
    const requested: string[] = [];
    const fetchImpl = (async (input: string | URL) => {
      requested.push(String(input));
      return new Response(FIXTURE, { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const series = await fetchNceiAnnualTemperature({ startYear: 1895, endYear: 2026, fetchImpl });
    expect(requested[0]).toContain('/110/tavg/12/12/1895-2026.csv');
    expect(series.warmest.year).toBe(2024);
  });

  it('reports the status when the host refuses the request', async () => {
    const fetchImpl = (async () =>
      new Response('nope', { status: 500 })) as unknown as typeof globalThis.fetch;
    await expect(fetchNceiAnnualTemperature({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('nceiAnnualTemperatureAdapter', () => {
  it('is keyless and loads its committed snapshot', () => {
    expect(nceiAnnualTemperatureAdapter.id).toBe('ncei-annual-temperature');
    expect(nceiAnnualTemperatureAdapter.auth).toBe('none');
    const series = nceiAnnualTemperatureAdapter.loadFixture();
    expect(series.yearCount).toBe(131);
    expect(series.lastYear).toBe(2025);
  });

  it('parses CSV text and refuses anything else', () => {
    expect(nceiAnnualTemperatureAdapter.parse(SMALL_CSV).yearCount).toBe(2);
    expect(() => nceiAnnualTemperatureAdapter.parse({ status: 'ok' })).toThrow(UsSourceParseError);
  });
});
