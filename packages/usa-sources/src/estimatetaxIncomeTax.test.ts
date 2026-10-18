import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildEstimateTaxUrl,
  ESTIMATETAX_API_BASE,
  ESTIMATETAX_CALCULATE_PATH,
  ESTIMATETAX_DEFAULT_CITY,
  ESTIMATETAX_DEFAULT_INCOME,
  ESTIMATETAX_DEFAULT_STATE,
  estimatetaxIncomeTaxAdapter,
  fetchEstimateTaxCalculation,
  parseEstimateTaxCalculation,
} from './estimatetaxIncomeTax.js';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText('estimatetax-income-tax-2026-10-18.json');

/** A small response with the same shape as the live one. */
const SMALL_PAYLOAD = JSON.stringify({
  taxYear: 2026,
  input: {
    income: 85_000,
    filingStatus: 'single',
    state: 'NY',
    city: 'new-york-city',
    preTaxDeductions: 0,
    selfEmploymentIncome: 0,
  },
  federal: {
    adjustedGrossIncome: 85_000,
    deduction: 16_100,
    taxableIncome: 68_900,
    incomeTax: 9_870,
    socialSecurity: 5_270,
    medicare: 1_232.5,
    additionalMedicare: 0,
    selfEmploymentTax: 0,
    totalFica: 6_502.5,
    marginalRate: 0.22,
    brackets: [
      { rate: 0.1, taxableInBracket: 12_400, tax: 1_240, min: 0, max: 12_400 },
      { rate: 0.12, taxableInBracket: 38_000, tax: 4_560, min: 12_400, max: 50_400 },
      { rate: 0.22, taxableInBracket: 18_500, tax: 4_070, min: 50_400, max: 105_700 },
    ],
  },
  state: { code: 'NY', name: 'New York', tax: 3_993, system: 'graduated' },
  local: {
    jurisdiction: 'New York City',
    tax: 2_859.52,
    rate: 0.03713662337662338,
    base: 'city_taxable',
  },
  totals: {
    totalTax: 23_225.02,
    netIncome: 61_774.98,
    effectiveRate: 0.2732,
    effectiveIncomeTaxRate: 0.1631,
  },
  sources: {
    federal: {
      citation: 'IRS Rev. Proc. 2025-32, section 3.01, Tables 1-4',
      url: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf',
      verified: '2026-08-31',
    },
    state: {
      authority: 'New York State Department of Taxation and Finance',
      checked: '2026-09-24',
      url: 'https://www.tax.ny.gov/pdf/current_forms/it/it2105i.pdf',
    },
    local: {
      document: 'NYS Department of Taxation and Finance, Form IT-201-I (2025)',
      url: 'https://www.tax.ny.gov/pdf/current_forms/it/it201i.pdf',
      checked: '2026-09-02',
    },
  },
  disclaimer: 'Estimate for planning. Not tax advice.',
});

/** A mutable copy of the payload, used to break one field at a time. */
interface MutableEstimateTaxPayload {
  taxYear?: unknown;
  input: Record<string, unknown>;
  federal: Record<string, unknown>;
  state?: unknown;
  local?: unknown;
  sources: Record<string, unknown>;
}

describe('buildEstimateTaxUrl', () => {
  it('asks for the default New York City calculation', () => {
    const url = new URL(buildEstimateTaxUrl());
    expect(url.origin + url.pathname).toBe(`${ESTIMATETAX_API_BASE}${ESTIMATETAX_CALCULATE_PATH}`);
    expect(url.searchParams.get('income')).toBe(String(ESTIMATETAX_DEFAULT_INCOME));
    expect(url.searchParams.get('state')).toBe(ESTIMATETAX_DEFAULT_STATE);
    expect(url.searchParams.get('city')).toBe(ESTIMATETAX_DEFAULT_CITY);
    expect(url.searchParams.get('filingStatus')).toBe('single');
  });

  it('takes every query parameter from the caller', () => {
    const url = new URL(
      buildEstimateTaxUrl({
        income: 52_000,
        filingStatus: 'head_of_household',
        state: 'TX',
        preTaxDeductions: 4_000,
        selfEmploymentIncome: 12_000,
      })
    );
    expect(url.searchParams.get('income')).toBe('52000');
    expect(url.searchParams.get('filingStatus')).toBe('head_of_household');
    expect(url.searchParams.get('state')).toBe('TX');
    expect(url.searchParams.get('city')).toBeNull();
    expect(url.searchParams.get('preTaxDeductions')).toBe('4000');
    expect(url.searchParams.get('selfEmploymentIncome')).toBe('12000');
  });

  it('omits the state when the caller asks for federal tax only', () => {
    const url = new URL(buildEstimateTaxUrl({ income: 52_000, state: null, city: null }));
    expect(url.searchParams.get('state')).toBeNull();
    expect(url.searchParams.get('city')).toBeNull();
  });
});

describe('parseEstimateTaxCalculation', () => {
  it('reads the tax parts and the official source behind each one', () => {
    const calculation = parseEstimateTaxCalculation(JSON.parse(SMALL_PAYLOAD));
    expect(calculation.taxYear).toBe(2026);
    expect(calculation.input).toEqual({
      income: 85_000,
      filingStatus: 'single',
      state: 'NY',
      city: 'new-york-city',
      preTaxDeductions: 0,
      selfEmploymentIncome: 0,
    });
    expect(calculation.federal.incomeTax).toBe(9_870);
    expect(calculation.federal.totalFica).toBe(6_502.5);
    expect(calculation.federal.brackets).toEqual([
      { rate: 0.1, taxableIncome: 12_400, tax: 1_240 },
      { rate: 0.12, taxableIncome: 38_000, tax: 4_560 },
      { rate: 0.22, taxableIncome: 18_500, tax: 4_070 },
    ]);
    expect(calculation.state).toEqual({
      code: 'NY',
      name: 'New York',
      tax: 3_993,
      system: 'graduated',
    });
    expect(calculation.local?.jurisdiction).toBe('New York City');
    expect(calculation.totals.totalTax).toBe(23_225.02);
    expect(calculation.sources.federal.checkedDate).toBe('2026-08-31');
    expect(calculation.sources.state?.checkedDate).toBe('2026-09-24');
    expect(calculation.sources.local?.checkedDate).toBe('2026-09-02');
  });

  it('keeps a federal-only response without a state or local layer', () => {
    const payload = JSON.parse(SMALL_PAYLOAD) as MutableEstimateTaxPayload;
    payload.state = null;
    payload.local = null;
    payload.sources = {
      federal: {
        citation: 'IRS Rev. Proc. 2025-32',
        url: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf',
        verified: '2026-08-31',
      },
      state: null,
      local: null,
    };
    const calculation = parseEstimateTaxCalculation(payload);
    expect(calculation.state).toBeNull();
    expect(calculation.local).toBeNull();
    expect(calculation.sources.state).toBeNull();
    expect(calculation.sources.local).toBeNull();
  });

  it('stops on an unreadable tax year or missing brackets', () => {
    const payload = JSON.parse(SMALL_PAYLOAD) as MutableEstimateTaxPayload;
    payload.taxYear = '2026';
    expect(() => parseEstimateTaxCalculation(payload)).toThrow(UsSourceParseError);

    const noBrackets = JSON.parse(SMALL_PAYLOAD) as MutableEstimateTaxPayload;
    noBrackets.federal.brackets = [];
    expect(() => parseEstimateTaxCalculation(noBrackets)).toThrow(UsSourceParseError);
  });

  it('stops on a negative income or a missing source URL', () => {
    const payload = JSON.parse(SMALL_PAYLOAD) as MutableEstimateTaxPayload;
    payload.input.income = -1;
    expect(() => parseEstimateTaxCalculation(payload)).toThrow(UsSourceParseError);

    const noUrl = JSON.parse(SMALL_PAYLOAD) as MutableEstimateTaxPayload;
    noUrl.sources.federal = { citation: 'IRS Rev. Proc. 2025-32' };
    expect(() => parseEstimateTaxCalculation(noUrl)).toThrow(UsSourceParseError);
  });
});

describe('fetchEstimateTaxCalculation', () => {
  it('requests the configured calculation and parses the answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const calculation = await fetchEstimateTaxCalculation({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(calculation.totals.totalTax).toBe(23_225.02);
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 429 }));
    await expect(fetchEstimateTaxCalculation({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('estimatetaxIncomeTaxAdapter', () => {
  it('registers as a keyless source', () => {
    expect(estimatetaxIncomeTaxAdapter.id).toBe('estimatetax-income-tax');
    expect(estimatetaxIncomeTaxAdapter.auth).toBe('none');
    expect(estimatetaxIncomeTaxAdapter.description).toContain('income tax');
  });

  it('parses a payload through the adapter surface', () => {
    expect(
      estimatetaxIncomeTaxAdapter.parse(JSON.parse(SMALL_PAYLOAD)).federal.brackets
    ).toHaveLength(3);
  });

  it('reads the committed fixture', () => {
    expect(estimatetaxIncomeTaxAdapter.loadFixture().taxYear).toBe(2026);
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const calculation = await estimatetaxIncomeTaxAdapter.fetchLive({ fetchImpl });
    expect(calculation.local?.jurisdiction).toBe('New York City');
  });
});

describe('the committed EstimateTax fixture', () => {
  const calculation = estimatetaxIncomeTaxAdapter.loadFixture();

  it('is the $85,000 New York City calculation for the 2026 tax year', () => {
    expect(calculation.input.income).toBe(85_000);
    expect(calculation.input.state).toBe('NY');
    expect(calculation.input.city).toBe('new-york-city');
    expect(calculation.taxYear).toBe(2026);
  });

  it('splits the tax into federal income tax, payroll, state, and city', () => {
    expect(calculation.federal.incomeTax).toBeCloseTo(9_870, 2);
    expect(calculation.federal.totalFica).toBeCloseTo(6_502.5, 2);
    expect(calculation.state?.tax).toBeCloseTo(3_993, 2);
    expect(calculation.local?.tax).toBeCloseTo(2_859.52, 2);
    expect(calculation.totals.totalTax).toBeCloseTo(23_225.02, 2);
  });

  it('carries the source document for every layer that returned tax', () => {
    expect(calculation.sources.federal.url).toContain('irs.gov');
    expect(calculation.sources.state?.url).toContain('tax.ny.gov');
    expect(calculation.sources.local?.url).toContain('tax.ny.gov');
  });

  it('matches the raw fixture the registry test answers with', () => {
    const parsed = parseEstimateTaxCalculation(JSON.parse(FIXTURE));
    expect(parsed.totals.totalTax).toBeCloseTo(23_225.02, 2);
  });
});
