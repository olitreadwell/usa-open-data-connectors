import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildTreasuryAvgInterestRateSeries,
  buildTreasuryAvgInterestRateUrl,
  fetchTreasuryAvgInterestRates,
  parseTreasuryAvgInterestRatePayload,
  treasuryAvgInterestRateAdapter,
  TREASURY_AVG_INTEREST_RATE_PATH,
  TREASURY_AVG_INTEREST_RATE_SECURITY_DESCRIPTION,
  TREASURY_AVG_INTEREST_RATE_SECURITY_TYPE,
  TREASURY_FISCAL_DATA_API_BASE,
} from './treasuryAvgInterestRate.js';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText('treasury-avg-interest-rate-2026-09-28.json');

/** A tiny response with the same shape as the real one. */
const SMALL_PAYLOAD = JSON.stringify({
  data: [
    {
      record_date: '2001-01-31',
      security_type_desc: 'Interest-bearing Debt',
      security_desc: 'Total Interest-bearing Debt',
      avg_interest_rate_amt: '6.594',
    },
    {
      record_date: '2001-02-28',
      security_type_desc: 'Interest-bearing Debt',
      security_desc: 'Total Interest-bearing Debt',
      avg_interest_rate_amt: '',
    },
    {
      record_date: '2001-03-31',
      security_type_desc: 'Interest-bearing Debt',
      security_desc: 'Total Interest-bearing Debt',
      avg_interest_rate_amt: '6.470',
    },
  ],
});

describe('buildTreasuryAvgInterestRateUrl', () => {
  it('asks the fiscal data API for the portfolio total, oldest first', () => {
    const url = buildTreasuryAvgInterestRateUrl();
    expect(url.startsWith(TREASURY_FISCAL_DATA_API_BASE)).toBe(true);
    expect(url).toContain(TREASURY_AVG_INTEREST_RATE_PATH);
    const params = new URL(url).searchParams;
    expect(params.get('filter')).toBe(
      `security_type_desc:eq:${TREASURY_AVG_INTEREST_RATE_SECURITY_TYPE}`
    );
    expect(params.get('sort')).toBe('record_date');
    expect(params.get('fields')).toContain('avg_interest_rate_amt');
    expect(params.get('page[size]')).toBe('10000');
  });

  it('takes a security type and a row cap from the caller', () => {
    const params = new URL(
      buildTreasuryAvgInterestRateUrl({ securityType: 'Marketable', rowLimit: 50 })
    ).searchParams;
    expect(params.get('filter')).toBe('security_type_desc:eq:Marketable');
    expect(params.get('page[size]')).toBe('50');
  });
});

describe('parseTreasuryAvgInterestRatePayload', () => {
  it('reads the date parts and the rate from each row', () => {
    const months = parseTreasuryAvgInterestRatePayload(JSON.parse(SMALL_PAYLOAD));
    expect(months).toHaveLength(2);
    expect(months[0]).toEqual({
      recordDate: '2001-01-31',
      year: 2001,
      month: 1,
      averageInterestRatePercent: 6.594,
    });
    expect(months[1]?.month).toBe(3);
  });

  it('drops a row the agency published without a rate', () => {
    const months = parseTreasuryAvgInterestRatePayload(JSON.parse(SMALL_PAYLOAD));
    expect(months.map((month) => month.recordDate)).not.toContain('2001-02-28');
  });

  it('reports an API error in the body as an API error', () => {
    expect(() =>
      parseTreasuryAvgInterestRatePayload({
        error: 'Invalid Query Param',
        message: "Invalid query parameter: Field 'bogus' does not exist.",
      })
    ).toThrow(UsSourceApiError);
  });

  it('stops on a payload that is not the expected shape', () => {
    expect(() => parseTreasuryAvgInterestRatePayload({ data: 'nope' })).toThrow(UsSourceParseError);
    expect(() => parseTreasuryAvgInterestRatePayload({ data: [] })).toThrow(UsSourceParseError);
  });

  it('stops when the response carries another security', () => {
    expect(() =>
      parseTreasuryAvgInterestRatePayload({
        data: [
          {
            record_date: '2026-08-31',
            security_type_desc: TREASURY_AVG_INTEREST_RATE_SECURITY_TYPE,
            security_desc: 'Treasury Bills',
            avg_interest_rate_amt: '3.788',
          },
        ],
      })
    ).toThrow(UsSourceParseError);
    expect(() =>
      parseTreasuryAvgInterestRatePayload({
        data: [
          {
            record_date: '2026-08-31',
            security_type_desc: 'Marketable',
            security_desc: TREASURY_AVG_INTEREST_RATE_SECURITY_DESCRIPTION,
            avg_interest_rate_amt: '3.788',
          },
        ],
      })
    ).toThrow(UsSourceParseError);
  });

  it('stops on an unreadable date or rate', () => {
    expect(() =>
      parseTreasuryAvgInterestRatePayload({
        data: [{ record_date: '31/08/2026', avg_interest_rate_amt: '3.788' }],
      })
    ).toThrow(UsSourceParseError);
    expect(() =>
      parseTreasuryAvgInterestRatePayload({
        data: [{ record_date: '2026-08-31', avg_interest_rate_amt: 'high' }],
      })
    ).toThrow(UsSourceParseError);
  });

  it('stops on a row with no date at all', () => {
    expect(() =>
      parseTreasuryAvgInterestRatePayload({
        data: [{ avg_interest_rate_amt: '3.788' }],
      })
    ).toThrow(UsSourceParseError);
  });
});

describe('buildTreasuryAvgInterestRateSeries', () => {
  it('names the first, last, highest, and lowest months', () => {
    const months = parseTreasuryAvgInterestRatePayload(JSON.parse(SMALL_PAYLOAD));
    const series = buildTreasuryAvgInterestRateSeries([...months].reverse());
    expect(series.monthCount).toBe(2);
    expect(series.firstMonth.recordDate).toBe('2001-01-31');
    expect(series.lastMonth.recordDate).toBe('2001-03-31');
    expect(series.highest.recordDate).toBe('2001-01-31');
    expect(series.lowest.recordDate).toBe('2001-03-31');
    // The lowest month in this sample is also the newest, so the gap since
    // the low is zero and the run has fallen overall.
    expect(series.changeSinceLowPercentPoints).toBeCloseTo(0, 3);
    expect(series.changeFirstToLastPercentPoints).toBeCloseTo(-0.124, 3);
  });

  it('sorts the months oldest first', () => {
    const series = buildTreasuryAvgInterestRateSeries(
      parseTreasuryAvgInterestRatePayload(JSON.parse(SMALL_PAYLOAD)).reverse()
    );
    expect(series.months.map((month) => month.recordDate)).toEqual(['2001-01-31', '2001-03-31']);
  });

  it('stops when there is nothing to summarise', () => {
    expect(() => buildTreasuryAvgInterestRateSeries([])).toThrow(UsSourceParseError);
  });
});

describe('fetchTreasuryAvgInterestRates', () => {
  it('requests the fiscal data API and folds the answer into a series', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const series = await fetchTreasuryAvgInterestRates({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(series.monthCount).toBe(2);
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 503 }));
    await expect(fetchTreasuryAvgInterestRates({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('treasuryAvgInterestRateAdapter', () => {
  it('registers as a keyless source', () => {
    expect(treasuryAvgInterestRateAdapter.id).toBe('treasury-avg-interest-rate');
    expect(treasuryAvgInterestRateAdapter.auth).toBe('none');
    expect(treasuryAvgInterestRateAdapter.description).toContain('Average interest rate');
  });

  it('parses a payload through the adapter surface', () => {
    const series = treasuryAvgInterestRateAdapter.parse(JSON.parse(SMALL_PAYLOAD));
    expect(series.monthCount).toBe(2);
  });

  it('reads the committed fixture', () => {
    const series = treasuryAvgInterestRateAdapter.loadFixture();
    expect(series.monthCount).toBe(308);
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const series = await treasuryAvgInterestRateAdapter.fetchLive({ fetchImpl });
    expect(series.lastMonth.month).toBe(3);
  });
});

// The numbers the site's copy quotes come from this file, so the fixture is
// pinned here: a refreshed snapshot that moves them fails the suite instead
// of quietly making the prose wrong.
describe('the committed treasury fixture', () => {
  const series = treasuryAvgInterestRateAdapter.loadFixture();

  it('holds one monthly rate per month since January 2001', () => {
    expect(series.monthCount).toBe(308);
    expect(series.firstMonth.recordDate).toBe('2001-01-31');
    expect(series.lastMonth.recordDate).toBe('2026-08-31');
  });

  it('opens at the highest rate in the run', () => {
    expect(series.highest.recordDate).toBe('2001-01-31');
    expect(series.highest.averageInterestRatePercent).toBeCloseTo(6.594, 3);
  });

  it('bottoms out in January 2022', () => {
    expect(series.lowest.recordDate).toBe('2022-01-31');
    expect(series.lowest.averageInterestRatePercent).toBeCloseTo(1.556, 3);
  });

  it('ends at 3.49 percent, 1.93 points above the low', () => {
    expect(series.lastMonth.averageInterestRatePercent).toBeCloseTo(3.49, 3);
    expect(series.changeSinceLowPercentPoints).toBeCloseTo(1.934, 3);
  });

  it('still sits below where the run opens', () => {
    expect(series.changeFirstToLastPercentPoints).toBeCloseTo(-3.104, 3);
  });

  it('carries a readable rate for every month it holds', () => {
    for (const month of series.months) {
      expect(month.averageInterestRatePercent).toBeGreaterThan(0);
      expect(Number.isFinite(month.averageInterestRatePercent)).toBe(true);
    }
  });

  it('matches the raw fixture the registry test answers with', () => {
    const fromText = parseTreasuryAvgInterestRatePayload(JSON.parse(FIXTURE));
    expect(fromText).toHaveLength(308);
  });
});
