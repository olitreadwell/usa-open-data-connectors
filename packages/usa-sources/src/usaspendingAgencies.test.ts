import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  fetchUsaSpendingAgencies,
  parseUsaSpendingAgenciesPayload,
  usaspendingAgenciesAdapter,
  USASPENDING_API_BASE,
  USASPENDING_TOP_TIER_AGENCIES_PATH,
} from './usaspendingAgencies.js';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText('usaspending-agencies-2026-10-05.json');

/** A tiny response with the same shape as the real one. */
const SMALL_PAYLOAD = JSON.stringify({
  results: [
    {
      agency_id: 1525,
      toptier_code: '247',
      abbreviation: 'AAHC',
      agency_name: '400 Years of African-American History Commission',
      congressional_justification_url: null,
      active_fy: '2026',
      active_fq: '4',
      outlay_amount: 0,
      obligated_amount: 0,
      budget_authority_amount: 0,
      current_total_budget_authority_amount: 15_495_311_418_794.12,
      percentage_of_total_budget_authority: 0,
      agency_slug: '400-years-of-african-american-history-commission',
    },
    {
      agency_id: 1146,
      toptier_code: '310',
      abbreviation: 'USAB',
      agency_name: 'Access Board',
      congressional_justification_url: 'https://www.access-board.gov/cj',
      active_fy: '2026',
      active_fq: '4',
      outlay_amount: 7_779_733.81,
      obligated_amount: 7_799_966.73,
      budget_authority_amount: 13_574_787.44,
      current_total_budget_authority_amount: 15_495_311_418_794.12,
      percentage_of_total_budget_authority: 8.76057735989434e-7,
      agency_slug: 'access-board',
    },
  ],
});

describe('parseUsaSpendingAgenciesPayload', () => {
  it('reads the agency fields out of the results list', () => {
    const directory = parseUsaSpendingAgenciesPayload(JSON.parse(SMALL_PAYLOAD));
    expect(directory.agencyCount).toBe(2);
    expect(directory.agencies[0]).toEqual({
      agencyId: 1525,
      toptierCode: '247',
      abbreviation: 'AAHC',
      agencyName: '400 Years of African-American History Commission',
      activeFiscalYear: '2026',
      activeFiscalQuarter: '4',
      outlayAmount: 0,
      obligatedAmount: 0,
      budgetAuthorityAmount: 0,
      currentTotalBudgetAuthorityAmount: 15_495_311_418_794.12,
      percentageOfTotalBudgetAuthority: 0,
      agencySlug: '400-years-of-african-american-history-commission',
      congressionalJustificationUrl: null,
    });
    expect(directory.agencies[1]?.congressionalJustificationUrl).toBe(
      'https://www.access-board.gov/cj'
    );
  });

  it('reads the fiscal period from the first row', () => {
    const directory = parseUsaSpendingAgenciesPayload(JSON.parse(SMALL_PAYLOAD));
    expect(directory.fiscalYear).toBe('2026');
    expect(directory.fiscalQuarter).toBe('4');
    expect(directory.currentTotalBudgetAuthorityAmount).toBeCloseTo(15_495_311_418_794.12, 2);
  });

  it('names the largest agency by obligation and by outlay', () => {
    const directory = parseUsaSpendingAgenciesPayload(JSON.parse(SMALL_PAYLOAD));
    expect(directory.largestByObligation.agencyName).toBe('Access Board');
    expect(directory.largestByOutlay.agencyName).toBe('Access Board');
  });

  it('stops on a payload that is not the expected shape', () => {
    expect(() => parseUsaSpendingAgenciesPayload({ results: 'nope' })).toThrow(UsSourceParseError);
    expect(() => parseUsaSpendingAgenciesPayload({ results: [] })).toThrow(UsSourceParseError);
  });

  it('stops on a row without an id or name', () => {
    expect(() => parseUsaSpendingAgenciesPayload({ results: [{ agency_id: 1 }] })).toThrow(
      UsSourceParseError
    );
  });
});

describe('fetchUsaSpendingAgencies', () => {
  it('requests the reference list and folds the answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const directory = await fetchUsaSpendingAgencies({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      `${USASPENDING_API_BASE}${USASPENDING_TOP_TIER_AGENCIES_PATH}`
    );
    expect(directory.agencyCount).toBe(2);
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(fetchUsaSpendingAgencies({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('usaspendingAgenciesAdapter', () => {
  it('registers as a keyless source', () => {
    expect(usaspendingAgenciesAdapter.id).toBe('usaspending-agencies');
    expect(usaspendingAgenciesAdapter.auth).toBe('none');
    expect(usaspendingAgenciesAdapter.description).toContain('USAspending');
  });

  it('parses a payload through the adapter surface', () => {
    expect(usaspendingAgenciesAdapter.parse(JSON.parse(SMALL_PAYLOAD)).agencyCount).toBe(2);
  });

  it('reads the committed fixture', () => {
    expect(usaspendingAgenciesAdapter.loadFixture().agencyCount).toBe(111);
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    expect((await usaspendingAgenciesAdapter.fetchLive({ fetchImpl })).fiscalYear).toBe('2026');
  });
});

// The list the endpoint answers with is pinned here, so a refreshed snapshot
// that moves it fails the suite rather than quietly changing the copy.
describe('the committed USAspending fixture', () => {
  const directory = usaspendingAgenciesAdapter.loadFixture();

  it('holds 111 top-tier agencies for fiscal 2026 quarter 4', () => {
    expect(directory.agencyCount).toBe(111);
    expect(directory.fiscalYear).toBe('2026');
    expect(directory.fiscalQuarter).toBe('4');
  });

  it('names Health and Human Services as the largest by obligation and outlay', () => {
    expect(directory.largestByObligation.agencyName).toBe(
      'Department of Health and Human Services'
    );
    expect(directory.largestByObligation.obligatedAmount).toBeCloseTo(2_674_621_212_855.86, 2);
    expect(directory.largestByOutlay.agencyName).toBe('Department of Health and Human Services');
  });

  it('matches the raw fixture the registry test answers with', () => {
    const fromText = parseUsaSpendingAgenciesPayload(JSON.parse(FIXTURE));
    expect(fromText.agencyCount).toBe(111);
  });
});
