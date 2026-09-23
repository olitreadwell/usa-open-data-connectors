import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  BLS_MAX_YEARS_PER_REQUEST,
  buildBlsSeries,
  fetchBlsSeries,
  parseBlsObservations,
  US_UNEMPLOYMENT_SERIES_ID,
} from './blsSeries.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const FIXTURE = readFixtureJson('bls-unemployment-rate.json');

describe('parseBlsObservations', () => {
  it('parses the fixture into monthly observations', () => {
    const observations = parseBlsObservations(FIXTURE);
    expect(observations.length).toBe(247);
    expect(observations[0]).toMatchObject({
      seriesId: US_UNEMPLOYMENT_SERIES_ID,
      year: 2006,
      period: 'M01',
      value: 4.7,
    });
  });

  it('drops the annual average period so a year holds one value per month', () => {
    const observations = parseBlsObservations({
      status: 'REQUEST_SUCCEEDED',
      Results: {
        series: [
          {
            seriesID: 'X',
            data: [
              { year: '2024', period: 'M13', periodName: 'Annual', value: '4.0' },
              { year: '2024', period: 'M01', periodName: 'January', value: '3.7' },
            ],
          },
        ],
      },
    });
    expect(observations).toHaveLength(1);
    expect(observations[0]?.period).toBe('M01');
  });

  it('drops a month the agency marked as unavailable', () => {
    const observations = parseBlsObservations({
      status: 'REQUEST_SUCCEEDED',
      Results: {
        series: [
          {
            seriesID: 'X',
            data: [{ year: '2025', period: 'M10', periodName: 'October', value: '-' }],
          },
        ],
      },
    });
    expect(observations).toHaveLength(0);
  });

  it('raises an API error when the agency reports a failed request', () => {
    expect(() =>
      parseBlsObservations({
        status: 'REQUEST_NOT_PROCESSED',
        message: ['bad series'],
        Results: { series: [] },
      })
    ).toThrow(UsSourceApiError);
  });

  it('raises a parse error on a payload with no Results', () => {
    expect(() => parseBlsObservations({ status: 'REQUEST_SUCCEEDED' })).toThrow(UsSourceParseError);
  });
});

describe('buildBlsSeries', () => {
  it('orders the fixture oldest first and finds the ends', () => {
    const series = buildBlsSeries(parseBlsObservations(FIXTURE), US_UNEMPLOYMENT_SERIES_ID);
    expect(series.points).toHaveLength(247);
    expect(series.first.year).toBe(2006);
    expect(series.first.period).toBe('M01');
    expect(series.latest.year).toBe(2026);
    expect(series.latest.period).toBe('M08');
  });

  it('finds the pandemic peak and the tightest month', () => {
    const series = buildBlsSeries(parseBlsObservations(FIXTURE), US_UNEMPLOYMENT_SERIES_ID);
    expect(series.peak).toMatchObject({ year: 2020, period: 'M04', value: 14.8 });
    expect(series.lowest).toMatchObject({ year: 2023, period: 'M04', value: 3.4 });
    expect(series.changeFromPeak).toBeCloseTo(-10.7, 5);
  });

  it('keeps only the named series', () => {
    const observations = parseBlsObservations({
      status: 'REQUEST_SUCCEEDED',
      Results: {
        series: [
          {
            seriesID: 'A',
            data: [{ year: '2024', period: 'M01', periodName: 'January', value: '1' }],
          },
          {
            seriesID: 'B',
            data: [{ year: '2024', period: 'M01', periodName: 'January', value: '2' }],
          },
        ],
      },
    });
    expect(buildBlsSeries(observations, 'A').points).toHaveLength(1);
    expect(buildBlsSeries(observations, 'A').latest.value).toBe(1);
  });

  it('throws when the series is absent', () => {
    expect(() => buildBlsSeries([], 'NOPE')).toThrow(/No observations/);
  });
});

describe('fetchBlsSeries', () => {
  it('splits a range longer than the API limit into windows', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      seen.push(String(url));
      return new Response(JSON.stringify(FIXTURE), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    await fetchBlsSeries(US_UNEMPLOYMENT_SERIES_ID, { startYear: 2006, endYear: 2025, fetchImpl });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toContain('startyear=2006');
    expect(seen[0]).toContain(`endyear=${2006 + BLS_MAX_YEARS_PER_REQUEST - 1}`);
    expect(seen[1]).toContain('startyear=2016');
    expect(seen[1]).toContain('endyear=2025');
  });

  it('makes a single call for a range inside the limit', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      seen.push(String(url));
      return new Response(JSON.stringify(FIXTURE), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    await fetchBlsSeries(US_UNEMPLOYMENT_SERIES_ID, { startYear: 2020, endYear: 2024, fetchImpl });
    expect(seen).toHaveLength(1);
  });

  it('raises an API error on a non-200 reply', async () => {
    const fetchImpl = (async () =>
      new Response('nope', { status: 503 })) as unknown as typeof globalThis.fetch;
    await expect(
      fetchBlsSeries(US_UNEMPLOYMENT_SERIES_ID, { startYear: 2020, endYear: 2024, fetchImpl })
    ).rejects.toThrow(/HTTP 503/);
  });
});
