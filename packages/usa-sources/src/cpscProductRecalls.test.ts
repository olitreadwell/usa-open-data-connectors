import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildCpscProductRecallSeries,
  buildCpscRecallUrl,
  CPSC_RECALL_API_BASE,
  cpscProductRecallsAdapter,
  fetchCpscProductRecalls,
  parseCpscRecallPayload,
  parseCpscRecallSnapshot,
} from './cpscProductRecalls.js';
import type { CpscProductRecall } from './cpscProductRecalls.js';
import { UsSourceApiError, UsSourceParseError } from './errors.js';

const ROWS_FIXTURE_FILENAME = 'cpsc-recall-rows-2014-2026-sampled-2026-10-02.json';
const SNAPSHOT_FIXTURE_FILENAME = 'cpsc-product-recalls-2026-10-02.json';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

/** One recall row in the shape the service sends, with fields overridable. */
function recallRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    RecallID: 12345,
    RecallNumber: '26156',
    RecallDate: '2025-12-18T00:00:00',
    Title: 'A firm recalls a product',
    Products: [{ Name: 'A product' }],
    RemedyOptions: [{ Option: 'Refund' }],
    ManufacturerCountries: [{ Country: 'China' }],
    ...overrides,
  };
}

/** One parsed recall, so a test can build a window without the row shape. */
function recallOn(
  recallDate: string,
  recallNumber: string,
  overrides: Record<string, unknown> = {}
): CpscProductRecall {
  const year = Number(recallDate.slice(0, 4));
  const [recall] = parseCpscRecallPayload(
    [recallRow({ RecallNumber: recallNumber, RecallDate: recallDate, ...overrides })],
    year
  );
  if (recall === undefined) {
    throw new Error(`The test helper produced no recall for ${recallDate}`);
  }
  return recall;
}

/** The same recall repeated, for a year that needs a known count. */
function recallsRepeated(count: number, date: string, prefix: string): CpscProductRecall[] {
  return Array.from({ length: count }, (_, index) => recallOn(date, `${prefix}${index}`));
}

/** A response holding one recall dated inside 2025 and one dated outside it. */
const MIXED_PAYLOAD = [
  recallRow({}),
  recallRow({ RecallID: 12346, RecallNumber: '26150', RecallDate: '2024-11-01T00:00:00' }),
];

/** A two-year window of recalls, enough for a series. */
const WINDOW = { firstYear: 2024, newestYear: 2025 };

describe('buildCpscRecallUrl', () => {
  it('asks the recall service for one calendar year', () => {
    const url = buildCpscRecallUrl(2025);
    expect(url.startsWith(CPSC_RECALL_API_BASE)).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get('format')).toBe('json');
    expect(params.get('RecallDateStart')).toBe('2025-01-01');
    expect(params.get('RecallDateEnd')).toBe('2025-12-31');
  });
});

describe('parseCpscRecallPayload', () => {
  it('keeps the rows dated inside the year asked for', () => {
    const recalls = parseCpscRecallPayload(MIXED_PAYLOAD, 2025);
    expect(recalls).toHaveLength(1);
    expect(recalls[0]?.recallNumber).toBe('26156');
    expect(recalls[0]?.recallDate).toBe('2025-12-18');
    expect(recalls[0]?.remedyOptions).toEqual(['Refund']);
    expect(recalls[0]?.manufacturerCountries).toEqual(['China']);
  });

  it('reads a recall with no remedy or country list as empty', () => {
    const recalls = parseCpscRecallPayload(
      [recallRow({ RemedyOptions: null, ManufacturerCountries: [] })],
      2025
    );
    expect(recalls[0]?.remedyOptions).toEqual([]);
    expect(recalls[0]?.manufacturerCountries).toEqual([]);
  });

  it('turns the error row into an API error', () => {
    const payload = [
      recallRow({
        RecallID: 0,
        RecallNumber: null,
        RecallDate: null,
        Title: 'Error retrieving Recalls: The underlying provider failed on Open.',
      }),
    ];
    expect(() => parseCpscRecallPayload(payload, 2025)).toThrow(UsSourceApiError);
  });

  it('rejects a payload that is not a list of rows', () => {
    expect(() => parseCpscRecallPayload({ Recalls: [] }, 2025)).toThrow(UsSourceParseError);
  });

  it('rejects a row with no recall number', () => {
    expect(() => parseCpscRecallPayload([recallRow({ RecallNumber: null })], 2025)).toThrow(
      UsSourceParseError
    );
  });

  it('rejects a row with an unreadable date', () => {
    expect(() => parseCpscRecallPayload([recallRow({ RecallDate: 'last Tuesday' })], 2025)).toThrow(
      UsSourceParseError
    );
  });
});

describe('buildCpscProductRecallSeries', () => {
  it('counts recalls per year and keeps a zero row for a quiet year', () => {
    const series = buildCpscProductRecallSeries(
      [
        recallOn('2024-03-01T00:00:00', '1'),
        recallOn('2024-09-01T00:00:00', '2'),
        recallOn('2025-01-01T00:00:00', '3'),
      ],
      { firstYear: 2023, newestYear: 2025 }
    );
    expect(series.years).toEqual([
      { year: 2023, recallCount: 0 },
      { year: 2024, recallCount: 2 },
      { year: 2025, recallCount: 1 },
    ]);
    expect(series.totalRecalls).toBe(3);
    expect(series.newestRecallDate).toBe('2025-01-01');
  });

  it('picks the busiest and quietest years from the complete years only', () => {
    const series = buildCpscProductRecallSeries(
      [
        ...recallsRepeated(4, '2024-05-01T00:00:00', 'a'),
        ...recallsRepeated(2, '2023-05-01T00:00:00', 'b'),
        ...recallsRepeated(9, '2025-05-01T00:00:00', 'c'),
      ],
      { firstYear: 2023, newestYear: 2025 }
    );
    expect(series.completeYearCount).toBe(2);
    expect(series.busiestCompleteYear).toEqual({ year: 2024, recallCount: 4 });
    expect(series.quietestCompleteYear).toEqual({ year: 2023, recallCount: 2 });
  });

  it('tallies remedy options and countries, most recall counts first', () => {
    const series = buildCpscProductRecallSeries(
      [
        recallOn('2024-01-01T00:00:00', '1', {
          RemedyOptions: [{ Option: 'Refund' }, { Option: 'Replace' }],
          ManufacturerCountries: [{ Country: 'China' }, { Country: 'Vietnam' }],
        }),
        recallOn('2024-02-01T00:00:00', '2'),
      ],
      { firstYear: 2023, newestYear: 2024 }
    );
    expect(series.remedyOptions).toEqual([
      { option: 'Refund', recallCount: 2 },
      { option: 'Replace', recallCount: 1 },
    ]);
    expect(series.manufacturerCountries).toEqual([
      { country: 'China', recallCount: 2 },
      { country: 'Vietnam', recallCount: 1 },
    ]);
  });

  it('refuses a recall dated outside the window', () => {
    expect(() =>
      buildCpscProductRecallSeries([recallOn('2023-12-18T00:00:00', '1')], {
        firstYear: 2024,
        newestYear: 2026,
      })
    ).toThrow(UsSourceParseError);
  });

  it('refuses an empty set and a single-year window', () => {
    expect(() => buildCpscProductRecallSeries([], WINDOW)).toThrow(UsSourceParseError);
    expect(() =>
      buildCpscProductRecallSeries([recallOn('2025-12-18T00:00:00', '1')], {
        firstYear: 2025,
        newestYear: 2025,
      })
    ).toThrow(UsSourceParseError);
  });
});

describe('parseCpscRecallSnapshot', () => {
  const series = parseCpscRecallSnapshot(
    JSON.parse(readFixtureText(SNAPSHOT_FIXTURE_FILENAME)) as unknown
  );

  it('carries the window, the file total, and the newest date', () => {
    expect(series.firstYear).toBe(2014);
    expect(series.newestYear).toBe(2026);
    expect(series.totalRecalls).toBe(3986);
    expect(series.years).toHaveLength(13);
    expect(series.newestRecallDate).toBe('2026-09-24');
  });

  it('carries the 2025 and 2026 counts', () => {
    expect(series.years.find((year) => year.year === 2025)?.recallCount).toBe(420);
    expect(series.years.find((year) => year.year === 2026)?.recallCount).toBe(459);
  });

  it('names 2025 the busiest complete year and 2021 the quietest', () => {
    expect(series.busiestCompleteYear).toEqual({ year: 2025, recallCount: 420 });
    expect(series.quietestCompleteYear).toEqual({ year: 2021, recallCount: 219 });
  });

  it('names refund the most common remedy and China the most common country', () => {
    expect(series.remedyOptions[0]).toEqual({ option: 'Refund', recallCount: 1980 });
    expect(series.manufacturerCountries[0]).toEqual({ country: 'China', recallCount: 2312 });
  });

  it('refuses counts that do not add up to the file total', () => {
    const snapshot = JSON.parse(readFixtureText(SNAPSHOT_FIXTURE_FILENAME)) as {
      totalRecalls: number;
    };
    snapshot.totalRecalls = 1;
    expect(() => parseCpscRecallSnapshot(snapshot)).toThrow(UsSourceParseError);
  });
});

describe('fetchCpscProductRecalls', () => {
  const fixtureFetch = (async (input: string | URL) => {
    const year = new URL(String(input)).searchParams.get('RecallDateStart')?.slice(0, 4) ?? '';
    const rows = JSON.parse(readFixtureText(ROWS_FIXTURE_FILENAME)) as { RecallDate: string }[];
    return new Response(
      JSON.stringify(rows.filter((row) => row.RecallDate.startsWith(`${year}-`))),
      {
        status: 200,
      }
    );
  }) as unknown as typeof globalThis.fetch;

  it('asks once per year and folds the years together', async () => {
    const series = await fetchCpscProductRecalls({
      firstYear: 2014,
      newestYear: 2026,
      fetchImpl: fixtureFetch,
    });
    expect(series.years).toHaveLength(13);
    expect(series.years.every((year) => year.recallCount === 3)).toBe(true);
    expect(series.totalRecalls).toBe(39);
  });

  it('throws when a year answers with an HTTP error', async () => {
    const failingFetch = (async () =>
      new Response('nope', { status: 500 })) as unknown as typeof globalThis.fetch;
    await expect(
      fetchCpscProductRecalls({ firstYear: 2024, newestYear: 2025, fetchImpl: failingFetch })
    ).rejects.toThrow(UsSourceApiError);
  });
});

describe('cpscProductRecallsAdapter', () => {
  it('is keyless and loads its committed fixture', () => {
    expect(cpscProductRecallsAdapter.id).toBe('cpsc-product-recalls');
    expect(cpscProductRecallsAdapter.auth).toBe('none');
    expect(cpscProductRecallsAdapter.loadFixture().totalRecalls).toBe(3986);
  });

  it('parses a snapshot through the adapter parse', () => {
    const series = cpscProductRecallsAdapter.parse(
      JSON.parse(readFixtureText(SNAPSHOT_FIXTURE_FILENAME)) as unknown
    );
    expect(series.totalRecalls).toBe(3986);
  });
});

describe('the sampled rows fixture', () => {
  it('holds three real recalls for every year from 2014 to 2026', () => {
    const rows = JSON.parse(readFixtureText(ROWS_FIXTURE_FILENAME)) as { RecallDate: string }[];
    expect(rows).toHaveLength(39);
    for (let year = 2014; year <= 2026; year += 1) {
      expect(rows.filter((row) => row.RecallDate.startsWith(`${year}-`))).toHaveLength(3);
    }
  });
});
