import { describe, expect, it } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildOpenFdaFoodRecallCountUrl,
  buildOpenFdaFoodRecallSummary,
  buildOpenFdaFoodRecallTotalUrl,
  fetchOpenFdaFoodRecalls,
  openFdaFoodRecallsAdapter,
  openFdaReportDateLabel,
  OPENFDA_CLASS_ONE,
  OPENFDA_FOOD_ENFORCEMENT_BASE,
  OPENFDA_VOLUNTARY_TERM,
  parseOpenFdaFoodRecallSnapshot,
  parseOpenFdaRecallCounts,
  parseOpenFdaRecallDateCounts,
  parseOpenFdaRecallTotal,
} from './openFdaFoodRecalls.js';
import type { OpenFdaFoodRecallSnapshot } from './openFdaFoodRecalls.js';

/** A tiny snapshot with the same shape as the committed one. */
const SMALL_SNAPSHOT: OpenFdaFoodRecallSnapshot = {
  recallCount: 6,
  reportDates: [
    { date: '20240801', count: 2 },
    { date: '20240815', count: 1 },
    { date: '20250801', count: 3 },
  ],
  classOneDates: [
    { date: '20240801', count: 1 },
    { date: '20250801', count: 2 },
  ],
  classifications: [
    { name: 'Class II', count: 3 },
    { name: OPENFDA_CLASS_ONE, count: 3 },
  ],
  voluntary: [
    { name: OPENFDA_VOLUNTARY_TERM, count: 5 },
    { name: 'FDA Mandated', count: 1 },
  ],
};

/** What the fixture file looks like before it is parsed. */
const SMALL_FIXTURE_PAYLOAD = {
  recallCount: 6,
  reportDates: SMALL_SNAPSHOT.reportDates.map((entry) => ({
    time: entry.date,
    count: entry.count,
  })),
  classOneDates: SMALL_SNAPSHOT.classOneDates.map((entry) => ({
    time: entry.date,
    count: entry.count,
  })),
  classifications: SMALL_SNAPSHOT.classifications.map((entry) => ({
    term: entry.name,
    count: entry.count,
  })),
  voluntary: SMALL_SNAPSHOT.voluntary.map((entry) => ({ term: entry.name, count: entry.count })),
};

describe('buildOpenFdaFoodRecallTotalUrl', () => {
  it('asks for one record so the response carries the count', () => {
    expect(buildOpenFdaFoodRecallTotalUrl()).toBe(`${OPENFDA_FOOD_ENFORCEMENT_BASE}?limit=1`);
  });
});

describe('buildOpenFdaFoodRecallCountUrl', () => {
  it('counts the publication date by default', () => {
    const url = new URL(buildOpenFdaFoodRecallCountUrl());
    expect(url.origin + url.pathname).toBe(OPENFDA_FOOD_ENFORCEMENT_BASE);
    expect(url.searchParams.get('count')).toBe('report_date');
    expect(url.searchParams.get('search')).toBeNull();
  });

  it('takes a field and a search clause from the caller', () => {
    const url = new URL(
      buildOpenFdaFoodRecallCountUrl({
        field: 'classification.exact',
        search: `classification:"${OPENFDA_CLASS_ONE}"`,
      })
    );
    expect(url.searchParams.get('count')).toBe('classification.exact');
    expect(url.searchParams.get('search')).toBe('classification:"Class I"');
  });
});

describe('parseOpenFdaRecallTotal', () => {
  it('reads the count out of the metadata block', () => {
    expect(parseOpenFdaRecallTotal({ meta: { results: { total: 29463 } } })).toBe(29463);
  });

  it('reads the count from a response that also carries records', () => {
    expect(
      parseOpenFdaRecallTotal({
        meta: { results: { skip: 0, limit: 1, total: 12 } },
        results: [{}],
      })
    ).toBe(12);
  });

  it('refuses a body without the metadata block', () => {
    expect(() => parseOpenFdaRecallTotal({ results: [] })).toThrow(UsSourceParseError);
  });

  it('reports an error body as an API error', () => {
    expect(() =>
      parseOpenFdaRecallTotal({ error: { code: 'NOT_FOUND', message: 'No matches found!' } })
    ).toThrow(UsSourceApiError);
    expect(() =>
      parseOpenFdaRecallTotal({ error: { code: 'NOT_FOUND', message: 'No matches found!' } })
    ).toThrow(/No matches found!/);
  });

  it('reports an error body with no message', () => {
    expect(() => parseOpenFdaRecallTotal({ error: {} })).toThrow(UsSourceApiError);
  });
});

describe('parseOpenFdaRecallCounts', () => {
  it('reads value and count pairs', () => {
    const counts = parseOpenFdaRecallCounts({
      results: [
        { term: 'Class II', count: 14736 },
        { term: OPENFDA_CLASS_ONE, count: 12965 },
      ],
    });
    expect(counts).toEqual([
      { name: 'Class II', count: 14736 },
      { name: OPENFDA_CLASS_ONE, count: 12965 },
    ]);
  });

  it('refuses a body with no counted values', () => {
    expect(() => parseOpenFdaRecallCounts({ results: [] })).toThrow(UsSourceParseError);
  });

  it('refuses a count that is not a number', () => {
    expect(() =>
      parseOpenFdaRecallCounts({ results: [{ term: 'Class I', count: 'many' }] })
    ).toThrow(UsSourceParseError);
  });
});

describe('parseOpenFdaRecallDateCounts', () => {
  it('reads the agency date stamp', () => {
    expect(parseOpenFdaRecallDateCounts({ results: [{ time: '20260923', count: 49 }] })).toEqual([
      { date: '20260923', count: 49 },
    ]);
  });

  it('stops on a value that is not a date', () => {
    expect(() =>
      parseOpenFdaRecallDateCounts({ results: [{ time: 'last week', count: 3 }] })
    ).toThrow(/Unreadable publication date/);
  });

  it('refuses a date count with no rows', () => {
    expect(() => parseOpenFdaRecallDateCounts({ results: [] })).toThrow(UsSourceParseError);
  });
});

describe('openFdaReportDateLabel', () => {
  it('turns the agency date stamp into an ISO date', () => {
    expect(openFdaReportDateLabel('20120620')).toBe('2012-06-20');
    expect(openFdaReportDateLabel('20260923')).toBe('2026-09-23');
  });

  it('stops on a stamp it cannot read', () => {
    expect(() => openFdaReportDateLabel('2026-09-23')).toThrow(/Unreadable publication date/);
  });
});

describe('parseOpenFdaFoodRecallSnapshot', () => {
  it('reads the four responses out of the committed shape', () => {
    expect(parseOpenFdaFoodRecallSnapshot(SMALL_FIXTURE_PAYLOAD)).toEqual(SMALL_SNAPSHOT);
  });

  it('refuses a payload that is not a snapshot', () => {
    expect(() => parseOpenFdaFoodRecallSnapshot({ recallCount: 6 })).toThrow(UsSourceParseError);
  });
});

describe('buildOpenFdaFoodRecallSummary', () => {
  it('splits each year into Class I and everything else', () => {
    const summary = buildOpenFdaFoodRecallSummary(SMALL_SNAPSHOT);
    expect(summary.years).toEqual([
      { year: 2024, total: 3, classOne: 1, other: 2 },
      { year: 2025, total: 3, classOne: 2, other: 1 },
    ]);
    expect(summary.firstYear).toBe(2024);
    expect(summary.newestYear).toBe(2025);
    expect(summary.newestYearCount).toBe(3);
    expect(summary.busiestYear).toEqual({ year: 2024, total: 3, classOne: 1, other: 2 });
    expect(summary.recallCount).toBe(6);
    expect(summary.classOneCount).toBe(3);
    expect(summary.classOneSharePercent).toBe(50);
    expect(summary.reportDateCount).toBe(3);
    expect(summary.firstReportDate).toBe('2024-08-01');
    expect(summary.newestReportDate).toBe('2025-08-01');
    expect(summary.voluntaryCount).toBe(5);
    expect(summary.mandatedCount).toBe(1);
  });

  it('keeps the year order even when the dates arrive shuffled', () => {
    const summary = buildOpenFdaFoodRecallSummary({
      ...SMALL_SNAPSHOT,
      reportDates: [
        { date: '20250801', count: 3 },
        { date: '20240801', count: 2 },
        { date: '20240815', count: 1 },
      ],
    });
    expect(summary.years.map((year) => year.year)).toEqual([2024, 2025]);
  });

  it('leaves a year with no Class I recall at zero', () => {
    const summary = buildOpenFdaFoodRecallSummary({
      ...SMALL_SNAPSHOT,
      classOneDates: [{ date: '20240801', count: 1 }],
      classifications: [
        { name: 'Class II', count: 5 },
        { name: OPENFDA_CLASS_ONE, count: 1 },
      ],
    });
    expect(summary.years).toEqual([
      { year: 2024, total: 3, classOne: 1, other: 2 },
      { year: 2025, total: 3, classOne: 0, other: 3 },
    ]);
  });

  it('counts zero mandated recalls when the agency sends no such term', () => {
    const summary = buildOpenFdaFoodRecallSummary({
      ...SMALL_SNAPSHOT,
      voluntary: [{ name: OPENFDA_VOLUNTARY_TERM, count: 6 }],
    });
    expect(summary.mandatedCount).toBe(0);
  });

  it('stops when the dates cover fewer recalls than the endpoint reports', () => {
    expect(() => buildOpenFdaFoodRecallSummary({ ...SMALL_SNAPSHOT, recallCount: 7 })).toThrow(
      /cover 6 recalls and the endpoint reports 7/
    );
  });

  it('stops when the Class I dates disagree with the classification count', () => {
    expect(() =>
      buildOpenFdaFoodRecallSummary({
        ...SMALL_SNAPSHOT,
        classifications: [
          { name: 'Class II', count: 3 },
          { name: OPENFDA_CLASS_ONE, count: 2 },
        ],
      })
    ).toThrow(/The Class I dates cover 3 recalls/);
  });

  it('stops on a snapshot with no publication dates', () => {
    expect(() =>
      buildOpenFdaFoodRecallSummary({ ...SMALL_SNAPSHOT, reportDates: [], recallCount: 0 })
    ).toThrow(/No publication dates/);
  });
});

/** Answers each counted request with the matching part of the small snapshot. */
const STUB_FETCH = (async (input: string | URL) => {
  const url = new URL(String(input));
  const count = url.searchParams.get('count');
  if (count === 'report_date') {
    const rows =
      url.searchParams.get('search') === null
        ? SMALL_FIXTURE_PAYLOAD.reportDates
        : SMALL_FIXTURE_PAYLOAD.classOneDates;
    return new Response(JSON.stringify({ results: rows }), { status: 200 });
  }
  if (count === 'classification.exact') {
    return new Response(JSON.stringify({ results: SMALL_FIXTURE_PAYLOAD.classifications }), {
      status: 200,
    });
  }
  if (count === 'voluntary_mandated.exact') {
    return new Response(JSON.stringify({ results: SMALL_FIXTURE_PAYLOAD.voluntary }), {
      status: 200,
    });
  }
  return new Response(JSON.stringify({ meta: { results: { total: 6 } } }), { status: 200 });
}) as unknown as typeof globalThis.fetch;

describe('fetchOpenFdaFoodRecalls', () => {
  it('asks the endpoint five questions and folds them into one summary', async () => {
    const summary = await fetchOpenFdaFoodRecalls({ fetchImpl: STUB_FETCH });
    expect(summary.recallCount).toBe(6);
    expect(summary.classOneCount).toBe(3);
    expect(summary.years).toHaveLength(2);
  });

  it('asks for the Class I dates under a search clause', async () => {
    const seen: string[] = [];
    const recordingFetch = (async (input: string | URL) => {
      seen.push(String(input));
      return (STUB_FETCH as (url: string) => Promise<Response>)(String(input));
    }) as unknown as typeof globalThis.fetch;
    await fetchOpenFdaFoodRecalls({ fetchImpl: recordingFetch });
    expect(seen).toHaveLength(5);
    expect(seen.some((url) => url.includes('classification%3A%22Class+I%22'))).toBe(true);
    expect(seen.some((url) => url.includes('limit=1'))).toBe(true);
  });

  it('reports an HTTP failure as an API error', async () => {
    const failing = (async () =>
      new Response('nope', { status: 500 })) as unknown as typeof globalThis.fetch;
    await expect(fetchOpenFdaFoodRecalls({ fetchImpl: failing })).rejects.toThrow(UsSourceApiError);
  });
});

describe('openFdaFoodRecallsAdapter', () => {
  it('describes itself as keyless', () => {
    expect(openFdaFoodRecallsAdapter.id).toBe('openfda-food-recalls');
    expect(openFdaFoodRecallsAdapter.auth).toBe('none');
  });

  it('loads the committed snapshot', () => {
    const summary = openFdaFoodRecallsAdapter.loadFixture();
    expect(summary.recallCount).toBeGreaterThan(0);
    expect(summary.years.length).toBeGreaterThan(10);
    expect(summary.years[0]?.year).toBe(2012);
    expect(summary.classOneCount).toBeGreaterThan(0);
  });

  it('parses the snapshot shape through parse()', () => {
    expect(openFdaFoodRecallsAdapter.parse(SMALL_FIXTURE_PAYLOAD).recallCount).toBe(6);
  });

  it('fetches live through the same stub the fetch helper takes', async () => {
    const summary = await openFdaFoodRecallsAdapter.fetchLive({ fetchImpl: STUB_FETCH });
    expect(summary.recallCount).toBe(6);
    expect(summary.years[1]).toEqual({ year: 2025, total: 3, classOne: 2, other: 1 });
  });
});
