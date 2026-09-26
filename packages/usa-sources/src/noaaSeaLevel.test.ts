import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildNoaaSeaLevelSeries,
  buildNoaaSeaLevelUrl,
  fetchNoaaSeaLevel,
  noaaSeaLevelAdapter,
  noaaSeaLevelTrendMillimetresPerYear,
  NOAA_BATTERY_STATION_ID,
  NOAA_COOPS_API_BASE,
  NOAA_SEA_LEVEL_DATUM,
  NOAA_SEA_LEVEL_PRODUCT,
  parseNoaaSeaLevelPayload,
} from './noaaSeaLevel.js';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText('noaa-sea-level-2026-09-27.json');

/** A tiny response with the same shape as the real one. */
const SMALL_PAYLOAD = JSON.stringify({
  metadata: { id: '9999999', name: 'Test Gauge', lat: '40', lon: '-74' },
  data: [
    { year: '1900', month: '1', MSL: '0.100' },
    { year: '1900', month: '2', MSL: '0.300' },
    { year: '1900', month: '3', MSL: '' },
    { year: '1901', month: '1', MSL: '-0.100' },
  ],
});

describe('buildNoaaSeaLevelUrl', () => {
  it('asks for the monthly means for the station and window', () => {
    const url = buildNoaaSeaLevelUrl({
      stationId: NOAA_BATTERY_STATION_ID,
      startYear: 1856,
      endYear: 2025,
    });
    expect(url.startsWith(NOAA_COOPS_API_BASE)).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get('product')).toBe(NOAA_SEA_LEVEL_PRODUCT);
    expect(params.get('datum')).toBe(NOAA_SEA_LEVEL_DATUM);
    expect(params.get('station')).toBe(NOAA_BATTERY_STATION_ID);
    expect(params.get('units')).toBe('metric');
    expect(params.get('format')).toBe('json');
    expect(params.get('begin_date')).toBe('18560101');
    expect(params.get('end_date')).toBe('20251231');
  });

  it('opens the window on 1 January and closes it on 31 December', () => {
    const params = new URL(
      buildNoaaSeaLevelUrl({ stationId: '8518750', startYear: 1990, endYear: 2000 })
    ).searchParams;
    expect(params.get('begin_date')?.slice(4)).toBe('0101');
    expect(params.get('end_date')?.slice(4)).toBe('1231');
  });
});

describe('parseNoaaSeaLevelPayload', () => {
  it('reads the fixture into monthly rows with the station', () => {
    const payload = parseNoaaSeaLevelPayload(JSON.parse(FIXTURE));
    expect(payload.station).toEqual({ id: '8518750', name: 'The Battery' });
    expect(payload.months.length).toBeGreaterThan(1800);
    expect(payload.months[0]).toEqual({ year: 1856, month: 1, meanSeaLevelMeters: -0.34 });
  });

  it('leaves out a month the gauge published with no value', () => {
    const payload = parseNoaaSeaLevelPayload(JSON.parse(SMALL_PAYLOAD));
    expect(payload.months).toEqual([
      { year: 1900, month: 1, meanSeaLevelMeters: 0.1 },
      { year: 1900, month: 2, meanSeaLevelMeters: 0.3 },
      { year: 1901, month: 1, meanSeaLevelMeters: -0.1 },
    ]);
  });

  it('reports the message when the API answers with an error', () => {
    const payload = { error: { message: ' The station is not a valid station.' } };
    expect(() => parseNoaaSeaLevelPayload(payload)).toThrow(UsSourceApiError);
    expect(() => parseNoaaSeaLevelPayload(payload)).toThrow(/not a valid station/);
  });

  it('refuses a response with no station metadata', () => {
    expect(() =>
      parseNoaaSeaLevelPayload({ data: [{ year: '1900', month: '1', MSL: '0.1' }] })
    ).toThrow(UsSourceParseError);
  });

  it('refuses a row with no year or month', () => {
    expect(() =>
      parseNoaaSeaLevelPayload({ metadata: { id: '1', name: 'Gauge' }, data: [{ MSL: '0.1' }] })
    ).toThrow(UsSourceParseError);
  });

  it('refuses a value that is not a number', () => {
    expect(() =>
      parseNoaaSeaLevelPayload({
        metadata: { id: '1', name: 'Gauge' },
        data: [{ year: '1900', month: '1', MSL: 'n/a' }],
      })
    ).toThrow(UsSourceParseError);
  });

  it('refuses a response with no monthly values at all', () => {
    expect(() =>
      parseNoaaSeaLevelPayload({ metadata: { id: '1', name: 'Gauge' }, data: [] })
    ).toThrow(UsSourceParseError);
  });

  it('refuses a payload that is not the expected shape', () => {
    expect(() => parseNoaaSeaLevelPayload('nope')).toThrow(UsSourceParseError);
    expect(() => parseNoaaSeaLevelPayload(null)).toThrow(UsSourceParseError);
  });
});

describe('noaaSeaLevelTrendMillimetresPerYear', () => {
  it('fits a straight line through two points', () => {
    const years = [
      { year: 1900, meanSeaLevelMeters: -0.1, monthCount: 12 },
      { year: 2000, meanSeaLevelMeters: 0.2, monthCount: 12 },
    ];
    expect(noaaSeaLevelTrendMillimetresPerYear(years)).toBeCloseTo(3, 6);
  });

  it('refuses a window with fewer than two years', () => {
    expect(() =>
      noaaSeaLevelTrendMillimetresPerYear([{ year: 1900, meanSeaLevelMeters: 0, monthCount: 12 }])
    ).toThrow(UsSourceParseError);
  });

  it('refuses a window where every year is the same year', () => {
    const years = [
      { year: 1900, meanSeaLevelMeters: 0, monthCount: 12 },
      { year: 1900, meanSeaLevelMeters: 0.1, monthCount: 12 },
    ];
    expect(() => noaaSeaLevelTrendMillimetresPerYear(years)).toThrow(UsSourceParseError);
  });
});

describe('buildNoaaSeaLevelSeries', () => {
  const series = buildNoaaSeaLevelSeries(parseNoaaSeaLevelPayload(JSON.parse(FIXTURE)));

  it('averages the months into one entry per year', () => {
    const payload = parseNoaaSeaLevelPayload(JSON.parse(SMALL_PAYLOAD));
    expect(buildNoaaSeaLevelSeries(payload).years).toEqual([
      { year: 1900, meanSeaLevelMeters: 0.2, monthCount: 2 },
      { year: 1901, meanSeaLevelMeters: -0.1, monthCount: 1 },
    ]);
  });

  it('reads the fixture into 155 years, oldest first', () => {
    expect(series.yearCount).toBe(155);
    expect(series.firstYear.year).toBe(1856);
    expect(series.lastYear.year).toBe(2025);
    const order = series.years.map((year) => year.year);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
  });

  it('keeps a year whose months are incomplete', () => {
    const partial = series.years.find((year) => year.year === 1920);
    expect(partial?.monthCount).toBe(7);
  });

  it('finds the highest and the lowest year in the record', () => {
    expect(series.highest.year).toBe(2024);
    expect(series.highest.meanSeaLevelMeters).toBeCloseTo(0.199, 3);
    expect(series.lowest.year).toBe(1874);
    expect(series.lowest.meanSeaLevelMeters).toBeCloseTo(-0.387, 3);
  });

  it('fits a trend close to three millimetres a year', () => {
    expect(series.trendMillimetresPerYear).toBeGreaterThan(2.9);
    expect(series.trendMillimetresPerYear).toBeLessThan(3.0);
  });

  it('reports the change from the first year to the last', () => {
    expect(series.changeFirstToLastMeters).toBeCloseTo(0.481, 3);
  });

  it('refuses a payload with no years', () => {
    expect(() =>
      buildNoaaSeaLevelSeries({ station: { id: '1', name: 'Gauge' }, months: [] })
    ).toThrow(UsSourceParseError);
  });
});

describe('fetchNoaaSeaLevel', () => {
  it('reads the window it is asked for and returns the series', async () => {
    const requested: string[] = [];
    const fetchImpl = (async (input: string | URL) => {
      requested.push(String(input));
      return new Response(FIXTURE, { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const series = await fetchNoaaSeaLevel({ startYear: 1856, endYear: 2025, fetchImpl });
    expect(requested[0]).toContain('begin_date=18560101');
    expect(requested[0]).toContain('station=8518750');
    expect(series.highest.year).toBe(2024);
  });

  it('reports the status when the host refuses the request', async () => {
    const fetchImpl = (async () =>
      new Response('nope', { status: 500 })) as unknown as typeof globalThis.fetch;
    await expect(fetchNoaaSeaLevel({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('noaaSeaLevelAdapter', () => {
  it('is keyless and loads its committed snapshot', () => {
    expect(noaaSeaLevelAdapter.id).toBe('noaa-sea-level');
    expect(noaaSeaLevelAdapter.auth).toBe('none');
    const series = noaaSeaLevelAdapter.loadFixture();
    expect(series.yearCount).toBe(155);
    expect(series.station.name).toBe('The Battery');
  });

  it('parses a payload and refuses anything else', () => {
    expect(noaaSeaLevelAdapter.parse(JSON.parse(SMALL_PAYLOAD)).yearCount).toBe(2);
    expect(() => noaaSeaLevelAdapter.parse({ status: 'ok' })).toThrow(UsSourceParseError);
  });
});
