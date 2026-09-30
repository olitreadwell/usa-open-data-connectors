import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildUsgsPeakStreamflowSeries,
  buildUsgsPeakStreamflowUrl,
  fetchUsgsPeakStreamflow,
  parseUsgsPeakStreamflowPayload,
  USGS_DISCHARGE_PARAMETER_CODE,
  USGS_MISSISSIPPI_ST_LOUIS_LOCATION_ID,
  USGS_PEAK_STREAMFLOW_COLLECTION,
  USGS_WATER_DATA_API_BASE,
  usgsPeakStreamflowAdapter,
} from './usgsPeakStreamflow.js';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText('usgs-peak-streamflow-2026-10-01.json');

/** One feature in the shape the agency sends. */
function feature(properties: Record<string, unknown>): Record<string, unknown> {
  return { type: 'Feature', properties };
}

/** A tiny response with the same shape as the real one. */
const SMALL_PAYLOAD = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    feature({
      monitoring_location_id: USGS_MISSISSIPPI_ST_LOUIS_LOCATION_ID,
      parameter_code: USGS_DISCHARGE_PARAMETER_CODE,
      value: '926000',
      time: '1892-05-19',
      water_year: 1892,
      year: 1892,
      qualifier: ['MAXDAILYMEAN'],
    }),
    feature({
      monitoring_location_id: USGS_MISSISSIPPI_ST_LOUIS_LOCATION_ID,
      parameter_code: USGS_DISCHARGE_PARAMETER_CODE,
      value: '',
      time: '1893-04-01',
      water_year: 1893,
      year: 1893,
      qualifier: null,
    }),
    feature({
      monitoring_location_id: USGS_MISSISSIPPI_ST_LOUIS_LOCATION_ID,
      parameter_code: USGS_DISCHARGE_PARAMETER_CODE,
      value: '1080000',
      time: '1993-08-01',
      water_year: 1993,
      year: 1993,
      qualifier: ['UNKNOWNREGULATION'],
    }),
  ],
});

describe('buildUsgsPeakStreamflowUrl', () => {
  it('asks the water data API for one gauge and the discharge parameter', () => {
    const url = buildUsgsPeakStreamflowUrl();
    expect(url.startsWith(USGS_WATER_DATA_API_BASE)).toBe(true);
    expect(url).toContain(`/collections/${USGS_PEAK_STREAMFLOW_COLLECTION}/items`);
    const params = new URL(url).searchParams;
    expect(params.get('monitoring_location_id')).toBe(USGS_MISSISSIPPI_ST_LOUIS_LOCATION_ID);
    expect(params.get('parameter_code')).toBe(USGS_DISCHARGE_PARAMETER_CODE);
    expect(params.get('limit')).toBe('500');
  });

  it('takes a gauge, a parameter, and a row cap from the caller', () => {
    const params = new URL(
      buildUsgsPeakStreamflowUrl({
        monitoringLocationId: 'USGS-09380000',
        parameterCode: '00065',
        rowLimit: 25,
      })
    ).searchParams;
    expect(params.get('monitoring_location_id')).toBe('USGS-09380000');
    expect(params.get('parameter_code')).toBe('00065');
    expect(params.get('limit')).toBe('25');
  });
});

describe('parseUsgsPeakStreamflowPayload', () => {
  it('reads the date, the water year, and the peak from each row', () => {
    const years = parseUsgsPeakStreamflowPayload(JSON.parse(SMALL_PAYLOAD));
    expect(years).toHaveLength(2);
    expect(years[0]).toEqual({
      waterYear: 1892,
      calendarYear: 1892,
      peakDate: '1892-05-19',
      peakDischargeCubicFeetPerSecond: 926000,
      qualifiers: ['MAXDAILYMEAN'],
    });
    expect(years[1]?.peakDischargeCubicFeetPerSecond).toBe(1080000);
  });

  it('drops a row the agency could not compute', () => {
    const years = parseUsgsPeakStreamflowPayload(JSON.parse(SMALL_PAYLOAD));
    expect(years.some((year) => year.waterYear === 1893)).toBe(false);
  });

  it('stops on a row for another gauge', () => {
    const payload = JSON.parse(SMALL_PAYLOAD) as { features: unknown[] };
    payload.features[0] = feature({
      monitoring_location_id: 'USGS-09380000',
      parameter_code: USGS_DISCHARGE_PARAMETER_CODE,
      value: '1000',
      time: '1993-08-01',
      water_year: 1993,
      year: 1993,
    });
    expect(() => parseUsgsPeakStreamflowPayload(payload)).toThrow(UsSourceParseError);
    expect(() => parseUsgsPeakStreamflowPayload(payload)).toThrow(/Unexpected gauge/);
  });

  it('stops on a row for another parameter', () => {
    const payload = JSON.parse(SMALL_PAYLOAD) as { features: unknown[] };
    payload.features[0] = feature({
      monitoring_location_id: USGS_MISSISSIPPI_ST_LOUIS_LOCATION_ID,
      parameter_code: '00065',
      value: '1000',
      time: '1993-08-01',
      water_year: 1993,
      year: 1993,
    });
    expect(() => parseUsgsPeakStreamflowPayload(payload)).toThrow(/Unexpected parameter/);
  });

  it('stops on a date it cannot read', () => {
    const payload = JSON.parse(SMALL_PAYLOAD) as { features: unknown[] };
    payload.features[0] = feature({
      value: '1000',
      time: 'August 1993',
      water_year: 1993,
    });
    expect(() => parseUsgsPeakStreamflowPayload(payload)).toThrow(/Unreadable peak date/);
  });

  it('stops on a row with no water year', () => {
    const payload = JSON.parse(SMALL_PAYLOAD) as { features: unknown[] };
    payload.features[0] = feature({ value: '1000', time: '1993-08-01' });
    expect(() => parseUsgsPeakStreamflowPayload(payload)).toThrow(/no water year/);
  });

  it('stops when the response carries no rows at all', () => {
    expect(() => parseUsgsPeakStreamflowPayload({ features: [] })).toThrow(/no rows/);
  });

  it('stops when the body is not a feature collection', () => {
    expect(() => parseUsgsPeakStreamflowPayload({ results: [] })).toThrow(UsSourceParseError);
  });
});

describe('buildUsgsPeakStreamflowSeries', () => {
  const years = parseUsgsPeakStreamflowPayload(JSON.parse(SMALL_PAYLOAD));

  it('sorts the record oldest first and names the ends', () => {
    const series = buildUsgsPeakStreamflowSeries(years);
    expect(series.yearCount).toBe(2);
    expect(series.firstYear.waterYear).toBe(1892);
    expect(series.lastYear.waterYear).toBe(1993);
    expect(series.highest.waterYear).toBe(1993);
    expect(series.lowest.waterYear).toBe(1892);
  });

  it('lists the years between the ends that carry no row', () => {
    const series = buildUsgsPeakStreamflowSeries(years);
    expect(series.missingWaterYears).toHaveLength(100);
    expect(series.missingWaterYears[0]).toBe(1893);
    expect(series.missingWaterYears[99]).toBe(1992);
  });

  it('reports the highest peak against the lowest', () => {
    const series = buildUsgsPeakStreamflowSeries(years);
    expect(series.highestToLowestRatio).toBe(1.2);
  });

  it('takes the middle row as the median, not the mean', () => {
    const series = buildUsgsPeakStreamflowSeries([
      {
        waterYear: 1,
        calendarYear: 1,
        peakDate: '2000-01-01',
        peakDischargeCubicFeetPerSecond: 10,
        qualifiers: [],
      },
      {
        waterYear: 2,
        calendarYear: 2,
        peakDate: '2001-01-01',
        peakDischargeCubicFeetPerSecond: 20,
        qualifiers: [],
      },
      {
        waterYear: 3,
        calendarYear: 3,
        peakDate: '2002-01-01',
        peakDischargeCubicFeetPerSecond: 3000,
        qualifiers: [],
      },
    ]);
    expect(series.median.peakDischargeCubicFeetPerSecond).toBe(20);
  });

  it('keeps the gauge the caller asked for', () => {
    const series = buildUsgsPeakStreamflowSeries(years, {
      monitoringLocationId: 'USGS-09380000',
    });
    expect(series.monitoringLocationId).toBe('USGS-09380000');
  });

  it('stops when there is nothing to summarise', () => {
    expect(() => buildUsgsPeakStreamflowSeries([])).toThrow(/No water years/);
  });
});

describe('fetchUsgsPeakStreamflow', () => {
  it('parses the response into a series', async () => {
    const fetchImpl = (async () =>
      new Response(FIXTURE, { status: 200 })) as unknown as typeof globalThis.fetch;
    const series = await fetchUsgsPeakStreamflow({ fetchImpl });
    expect(series.yearCount).toBe(165);
  });

  it('reports the HTTP status when the request fails', async () => {
    const fetchImpl = (async () =>
      new Response('nope', { status: 503 })) as unknown as typeof globalThis.fetch;
    await expect(fetchUsgsPeakStreamflow({ fetchImpl })).rejects.toThrow(UsSourceApiError);
    await expect(fetchUsgsPeakStreamflow({ fetchImpl })).rejects.toThrow(/HTTP 503/);
  });
});

describe('usgsPeakStreamflowAdapter', () => {
  it('describes itself as keyless', () => {
    expect(usgsPeakStreamflowAdapter.id).toBe('usgs-peak-streamflow');
    expect(usgsPeakStreamflowAdapter.auth).toBe('none');
  });

  it('parses a payload through the adapter', () => {
    const series = usgsPeakStreamflowAdapter.parse(JSON.parse(SMALL_PAYLOAD));
    expect(series.highest.waterYear).toBe(1993);
  });

  it('loads its committed fixture', () => {
    const series = usgsPeakStreamflowAdapter.loadFixture();
    expect(series.yearCount).toBe(165);
  });
});

describe('the committed peak-flow fixture', () => {
  const series = usgsPeakStreamflowAdapter.loadFixture();

  it('covers the Mississippi at St. Louis from 1844', () => {
    expect(series.monitoringLocationId).toBe(USGS_MISSISSIPPI_ST_LOUIS_LOCATION_ID);
    expect(series.firstYear.waterYear).toBe(1844);
    expect(series.lastYear.waterYear).toBe(2025);
    expect(series.yearCount).toBe(165);
  });

  it('carries the 1993 record peak', () => {
    expect(series.highest.waterYear).toBe(1993);
    expect(series.highest.peakDate).toBe('1993-08-01');
    expect(series.highest.peakDischargeCubicFeetPerSecond).toBe(1080000);
  });

  it('carries the 1934 low', () => {
    expect(series.lowest.waterYear).toBe(1934);
    expect(series.lowest.peakDischargeCubicFeetPerSecond).toBe(136000);
    expect(series.highestToLowestRatio).toBe(7.9);
  });

  it('carries the median peak', () => {
    expect(series.median.peakDischargeCubicFeetPerSecond).toBe(511000);
  });

  it('lists the seventeen water years between 1845 and 1861 with no row', () => {
    expect(series.missingWaterYears).toHaveLength(17);
    expect(series.missingWaterYears[0]).toBe(1845);
    expect(series.missingWaterYears[16]).toBe(1861);
  });
});
