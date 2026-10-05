import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildTreasuryDebtToPennyPage,
  buildTreasuryDebtToPennyUrl,
  fetchTreasuryDebtToPenny,
  parseTreasuryDebtToPennyPayload,
  treasuryDebtToPennyAdapter,
  TREASURY_DEBT_TO_PENNY_API_BASE,
  TREASURY_DEBT_TO_PENNY_PATH,
} from './treasuryDebtToPenny.js';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText('treasury-debt-to-penny-2026-10-05.json');

/** A tiny response with the same shape as the real one. */
const SMALL_PAYLOAD = JSON.stringify({
  data: [
    {
      record_date: '2001-01-02',
      debt_held_public_amt: '3000000000000.00',
      intragov_hold_amt: '2000000000000.00',
      tot_pub_debt_out_amt: '5000000000000.00',
    },
    {
      record_date: '2001-01-03',
      debt_held_public_amt: 'null',
      intragov_hold_amt: 'null',
      tot_pub_debt_out_amt: '5100000000000.00',
    },
    {
      record_date: '2001-01-04',
      tot_pub_debt_out_amt: 'null',
    },
  ],
});

describe('buildTreasuryDebtToPennyUrl', () => {
  it('asks the fiscal data API for one short page of the debt file', () => {
    const url = buildTreasuryDebtToPennyUrl();
    expect(url.startsWith(TREASURY_DEBT_TO_PENNY_API_BASE)).toBe(true);
    expect(url).toContain(TREASURY_DEBT_TO_PENNY_PATH);
    expect(new URL(url).searchParams.get('page[size]')).toBe('10');
  });

  it('takes a row cap from the caller', () => {
    expect(
      new URL(buildTreasuryDebtToPennyUrl({ rowLimit: 50 })).searchParams.get('page[size]')
    ).toBe('50');
  });
});

describe('parseTreasuryDebtToPennyPayload', () => {
  it('reads the date and the dollar amounts from each row', () => {
    const days = parseTreasuryDebtToPennyPayload(JSON.parse(SMALL_PAYLOAD));
    expect(days).toHaveLength(2);
    expect(days[0]).toEqual({
      recordDate: '2001-01-02',
      totalPublicDebtOutstandingUsd: 5_000_000_000_000,
      debtHeldByPublicUsd: 3_000_000_000_000,
      intragovernmentalHoldingsUsd: 2_000_000_000_000,
    });
  });

  it('reads the agency text "null" as a missing amount', () => {
    const days = parseTreasuryDebtToPennyPayload(JSON.parse(SMALL_PAYLOAD));
    expect(days[1]?.debtHeldByPublicUsd).toBeNull();
    expect(days[1]?.intragovernmentalHoldingsUsd).toBeNull();
  });

  it('drops a row the agency published without a total', () => {
    const days = parseTreasuryDebtToPennyPayload(JSON.parse(SMALL_PAYLOAD));
    expect(days.map((day) => day.recordDate)).not.toContain('2001-01-04');
  });

  it('reports an API error in the body as an API error', () => {
    expect(() =>
      parseTreasuryDebtToPennyPayload({
        error: 'Invalid Query Param',
        message: "Invalid query parameter: Field 'bogus' does not exist.",
      })
    ).toThrow(UsSourceApiError);
  });

  it('stops on a payload that is not the expected shape', () => {
    expect(() => parseTreasuryDebtToPennyPayload({ data: 'nope' })).toThrow(UsSourceParseError);
    expect(() => parseTreasuryDebtToPennyPayload({ data: [] })).toThrow(UsSourceParseError);
  });

  it('stops on an unreadable date or amount', () => {
    expect(() =>
      parseTreasuryDebtToPennyPayload({
        data: [{ record_date: '02/01/2001', tot_pub_debt_out_amt: '5' }],
      })
    ).toThrow(UsSourceParseError);
    expect(() =>
      parseTreasuryDebtToPennyPayload({
        data: [{ record_date: '2001-01-02', tot_pub_debt_out_amt: 'lots' }],
      })
    ).toThrow(UsSourceParseError);
  });

  it('stops on a row with no date at all', () => {
    expect(() =>
      parseTreasuryDebtToPennyPayload({ data: [{ tot_pub_debt_out_amt: '5' }] })
    ).toThrow(UsSourceParseError);
  });
});

describe('buildTreasuryDebtToPennyPage', () => {
  it('names the first, last, highest, and lowest days', () => {
    const days = parseTreasuryDebtToPennyPayload(JSON.parse(SMALL_PAYLOAD));
    const page = buildTreasuryDebtToPennyPage([...days].reverse());
    expect(page.dayCount).toBe(2);
    expect(page.firstDay.recordDate).toBe('2001-01-02');
    expect(page.lastDay.recordDate).toBe('2001-01-03');
    expect(page.highestTotalDebt.recordDate).toBe('2001-01-03');
    expect(page.lowestTotalDebt.recordDate).toBe('2001-01-02');
  });

  it('sorts the days oldest first', () => {
    const page = buildTreasuryDebtToPennyPage(
      parseTreasuryDebtToPennyPayload(JSON.parse(SMALL_PAYLOAD)).reverse()
    );
    expect(page.days.map((day) => day.recordDate)).toEqual(['2001-01-02', '2001-01-03']);
  });

  it('stops when there is nothing to summarise', () => {
    expect(() => buildTreasuryDebtToPennyPage([])).toThrow(UsSourceParseError);
  });
});

describe('fetchTreasuryDebtToPenny', () => {
  it('requests the fiscal data API and folds the answer into a page', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const page = await fetchTreasuryDebtToPenny({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(page.dayCount).toBe(2);
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 503 }));
    await expect(fetchTreasuryDebtToPenny({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('treasuryDebtToPennyAdapter', () => {
  it('registers as a keyless source', () => {
    expect(treasuryDebtToPennyAdapter.id).toBe('treasury-debt-to-penny');
    expect(treasuryDebtToPennyAdapter.auth).toBe('none');
    expect(treasuryDebtToPennyAdapter.description).toContain('public debt');
  });

  it('parses a payload through the adapter surface', () => {
    const page = treasuryDebtToPennyAdapter.parse(JSON.parse(SMALL_PAYLOAD));
    expect(page.dayCount).toBe(2);
  });

  it('reads the committed fixture', () => {
    const page = treasuryDebtToPennyAdapter.loadFixture();
    expect(page.dayCount).toBe(10);
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const page = await treasuryDebtToPennyAdapter.fetchLive({ fetchImpl });
    expect(page.lastDay.recordDate).toBe('2001-01-03');
  });
});

// The page the endpoint answers with is pinned here: a refreshed snapshot
// that moves these days fails the suite instead of quietly changing the copy.
describe('the committed Treasury debt fixture', () => {
  const page = treasuryDebtToPennyAdapter.loadFixture();

  it('holds the first ten daily rows from April 1993', () => {
    expect(page.dayCount).toBe(10);
    expect(page.firstDay.recordDate).toBe('1993-04-01');
    expect(page.lastDay.recordDate).toBe('1993-04-14');
  });

  it('opens and closes at the page extremes', () => {
    expect(page.lowestTotalDebt.recordDate).toBe('1993-04-01');
    expect(page.lowestTotalDebt.totalPublicDebtOutstandingUsd).toBeCloseTo(4_225_873_987_843.44, 2);
    expect(page.highestTotalDebt.recordDate).toBe('1993-04-07');
    expect(page.highestTotalDebt.totalPublicDebtOutstandingUsd).toBeCloseTo(
      4_246_168_040_810.56,
      2
    );
  });

  it('carries a readable total for every day it holds', () => {
    for (const day of page.days) {
      expect(day.totalPublicDebtOutstandingUsd).toBeGreaterThan(0);
    }
  });

  it('matches the raw fixture the registry test answers with', () => {
    const fromText = parseTreasuryDebtToPennyPayload(JSON.parse(FIXTURE));
    expect(fromText).toHaveLength(10);
  });
});
