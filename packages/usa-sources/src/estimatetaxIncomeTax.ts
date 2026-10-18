import { z } from 'zod';

import { UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpGet } from './http.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the EstimateTax income tax source. */
export const ESTIMATETAX_INCOME_TAX_SOURCE_ID = 'estimatetax-income-tax';

/** Base URL for the EstimateTax API. */
export const ESTIMATETAX_API_BASE = 'https://estimatetax.net';

/** Path of the one calculation endpoint. */
export const ESTIMATETAX_CALCULATE_PATH = '/api/v1/calculate';

/** Default annual income in the worked example. */
export const ESTIMATETAX_DEFAULT_INCOME = 85_000;

/** Default state in the worked example. */
export const ESTIMATETAX_DEFAULT_STATE = 'NY';

/** Default local jurisdiction in the worked example. */
export const ESTIMATETAX_DEFAULT_CITY = 'new-york-city';

/** Filing statuses the API accepts. */
export const ESTIMATETAX_FILING_STATUSES = [
  'single',
  'married_jointly',
  'married_separately',
  'head_of_household',
] as const;

/** One filing status the API accepts. */
export type EstimateTaxFilingStatus = (typeof ESTIMATETAX_FILING_STATUSES)[number];

/** Inputs for one tax calculation. */
export interface EstimateTaxQuery {
  /** Gross annual employment income, in US dollars. */
  income: number;
  /** How the taxpayer files. Defaults to single. */
  filingStatus?: EstimateTaxFilingStatus;
  /** Two-letter state code, or null for federal tax only. */
  state?: string | null;
  /** Local jurisdiction slug, where the state levies a local income tax. */
  city?: string | null;
  /** Pre-tax deductions such as a 401(k) or health premiums. */
  preTaxDeductions?: number;
  /** Net self-employment income. */
  selfEmploymentIncome?: number;
}

/** The input block echoed back in a calculation. */
export interface EstimateTaxInput {
  income: number;
  filingStatus: EstimateTaxFilingStatus;
  state: string | null;
  city: string | null;
  preTaxDeductions: number;
  selfEmploymentIncome: number;
}

/** One federal bracket and how much tax the income paid in it. */
export interface EstimateTaxBracket {
  rate: number;
  taxableIncome: number;
  tax: number;
}

/** Federal income tax, payroll tax, and the brackets the income crossed. */
export interface EstimateTaxFederal {
  incomeTax: number;
  totalFica: number;
  marginalRate: number;
  brackets: EstimateTaxBracket[];
}

/** State income tax for the chosen jurisdiction. */
export interface EstimateTaxState {
  code: string;
  name: string;
  tax: number;
  system: string;
}

/** Local income tax for the chosen city, county, or school district. */
export interface EstimateTaxLocal {
  jurisdiction: string;
  tax: number;
  rate: number;
  base: string;
}

/** The total tax and the income left after it. */
export interface EstimateTaxTotals {
  totalTax: number;
  netIncome: number;
  effectiveRate: number;
  effectiveIncomeTaxRate: number;
}

/** The official document behind one layer of the calculation. */
export interface EstimateTaxSource {
  citation?: string;
  authority?: string;
  document?: string;
  url: string;
  /** The date the publisher checked the figure, under either API field name. */
  checkedDate?: string;
}

/** Every source a calculation cites. */
export interface EstimateTaxSources {
  federal: EstimateTaxSource;
  state: EstimateTaxSource | null;
  local: EstimateTaxSource | null;
}

/** One complete tax calculation. */
export interface EstimateTaxCalculation {
  taxYear: number;
  input: EstimateTaxInput;
  federal: EstimateTaxFederal;
  state: EstimateTaxState | null;
  local: EstimateTaxLocal | null;
  totals: EstimateTaxTotals;
  sources: EstimateTaxSources;
}

/** Committed snapshot, so a build works when EstimateTax is unreachable. */
const ESTIMATETAX_FIXTURE_FILENAME = 'estimatetax-income-tax-2026-10-18.json';

const ESTIMATETAX_SOURCE_SCHEMA = z.object({
  citation: z.string().optional(),
  authority: z.string().optional(),
  document: z.string().optional(),
  url: z.string().url(),
  verified: z.string().optional(),
  checked: z.string().optional(),
});

const ESTIMATETAX_INPUT_SCHEMA = z.object({
  income: z.number().nonnegative(),
  filingStatus: z.enum(ESTIMATETAX_FILING_STATUSES),
  state: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  preTaxDeductions: z.number().nonnegative().optional(),
  selfEmploymentIncome: z.number().nonnegative().optional(),
});

const ESTIMATETAX_BRACKET_SCHEMA = z.object({
  rate: z.number().nonnegative(),
  taxableInBracket: z.number().nonnegative(),
  tax: z.number().nonnegative(),
});

const ESTIMATETAX_FEDERAL_SCHEMA = z.object({
  incomeTax: z.number().nonnegative(),
  totalFica: z.number().nonnegative(),
  marginalRate: z.number().nonnegative(),
  brackets: z.array(ESTIMATETAX_BRACKET_SCHEMA).min(1),
});

const ESTIMATETAX_STATE_SCHEMA = z.object({
  code: z.string().min(2),
  name: z.string().min(1),
  tax: z.number().nonnegative(),
  system: z.string().min(1),
});

const ESTIMATETAX_LOCAL_SCHEMA = z.object({
  jurisdiction: z.string().min(1),
  tax: z.number().nonnegative(),
  rate: z.number().nonnegative(),
  base: z.string().min(1),
});

const ESTIMATETAX_TOTALS_SCHEMA = z.object({
  totalTax: z.number().nonnegative(),
  netIncome: z.number().nonnegative(),
  effectiveRate: z.number().nonnegative(),
  effectiveIncomeTaxRate: z.number().nonnegative(),
});

const ESTIMATETAX_PAYLOAD_SCHEMA = z.object({
  taxYear: z.number().int().positive(),
  input: ESTIMATETAX_INPUT_SCHEMA,
  federal: ESTIMATETAX_FEDERAL_SCHEMA,
  state: ESTIMATETAX_STATE_SCHEMA.nullable().optional(),
  local: ESTIMATETAX_LOCAL_SCHEMA.nullable().optional(),
  totals: ESTIMATETAX_TOTALS_SCHEMA,
  sources: z.object({
    federal: ESTIMATETAX_SOURCE_SCHEMA,
    state: ESTIMATETAX_SOURCE_SCHEMA.nullable().optional(),
    local: ESTIMATETAX_SOURCE_SCHEMA.nullable().optional(),
  }),
});

/** The query the adapter uses when the caller gives none. */
export const ESTIMATETAX_DEFAULT_QUERY: EstimateTaxQuery = {
  income: ESTIMATETAX_DEFAULT_INCOME,
  filingStatus: 'single',
  state: ESTIMATETAX_DEFAULT_STATE,
  city: ESTIMATETAX_DEFAULT_CITY,
};

/**
 * Builds the request URL for one tax calculation.
 *
 * The endpoint is keyless and limited to 60 requests a minute. The default
 * query is the $85,000 New York City case the committed fixture records.
 *
 * @param query - income and optional place, filing status, and deductions
 * @returns the full request URL
 */
export function buildEstimateTaxUrl(query: EstimateTaxQuery = ESTIMATETAX_DEFAULT_QUERY): string {
  const params = new URLSearchParams({ income: String(query.income) });
  if (query.filingStatus !== undefined) {
    params.set('filingStatus', query.filingStatus);
  }
  if (query.state !== undefined && query.state !== null) {
    params.set('state', query.state);
  }
  if (query.city !== undefined && query.city !== null) {
    params.set('city', query.city);
  }
  if (query.preTaxDeductions !== undefined) {
    params.set('preTaxDeductions', String(query.preTaxDeductions));
  }
  if (query.selfEmploymentIncome !== undefined) {
    params.set('selfEmploymentIncome', String(query.selfEmploymentIncome));
  }
  return `${ESTIMATETAX_API_BASE}${ESTIMATETAX_CALCULATE_PATH}?${params.toString()}`;
}

/** Turns the API's source block into the adapter's shape. */
function readEstimateTaxSource(
  source: z.infer<typeof ESTIMATETAX_SOURCE_SCHEMA>
): EstimateTaxSource {
  const checkedDate = source.checked ?? source.verified;
  return {
    url: source.url,
    ...(source.citation === undefined ? {} : { citation: source.citation }),
    ...(source.authority === undefined ? {} : { authority: source.authority }),
    ...(source.document === undefined ? {} : { document: source.document }),
    ...(checkedDate === undefined ? {} : { checkedDate }),
  };
}

/**
 * Parses one calculation into the tax parts and their cited sources.
 *
 * A state or local layer is null when the calculation does not include it.
 * The parser refuses a missing federal bracket list, a negative amount, or a
 * source block without the document URL, so a changed response cannot quietly
 * produce a figure with no provenance.
 *
 * @param payload - the JSON body from the calculation endpoint
 * @returns the calculation in the adapter's shape
 */
export function parseEstimateTaxCalculation(payload: unknown): EstimateTaxCalculation {
  const parsed = ESTIMATETAX_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(ESTIMATETAX_INCOME_TAX_SOURCE_ID, parsed.error.message);
  }
  const value = parsed.data;
  return {
    taxYear: value.taxYear,
    input: {
      income: value.input.income,
      filingStatus: value.input.filingStatus,
      state: value.input.state ?? null,
      city: value.input.city ?? null,
      preTaxDeductions: value.input.preTaxDeductions ?? 0,
      selfEmploymentIncome: value.input.selfEmploymentIncome ?? 0,
    },
    federal: {
      incomeTax: value.federal.incomeTax,
      totalFica: value.federal.totalFica,
      marginalRate: value.federal.marginalRate,
      brackets: value.federal.brackets.map((bracket) => ({
        rate: bracket.rate,
        taxableIncome: bracket.taxableInBracket,
        tax: bracket.tax,
      })),
    },
    state:
      value.state === null || value.state === undefined
        ? null
        : {
            code: value.state.code,
            name: value.state.name,
            tax: value.state.tax,
            system: value.state.system,
          },
    local:
      value.local === null || value.local === undefined
        ? null
        : {
            jurisdiction: value.local.jurisdiction,
            tax: value.local.tax,
            rate: value.local.rate,
            base: value.local.base,
          },
    totals: {
      totalTax: value.totals.totalTax,
      netIncome: value.totals.netIncome,
      effectiveRate: value.totals.effectiveRate,
      effectiveIncomeTaxRate: value.totals.effectiveIncomeTaxRate,
    },
    sources: {
      federal: readEstimateTaxSource(value.sources.federal),
      state:
        value.sources.state === null || value.sources.state === undefined
          ? null
          : readEstimateTaxSource(value.sources.state),
      local:
        value.sources.local === null || value.sources.local === undefined
          ? null
          : readEstimateTaxSource(value.sources.local),
    },
  };
}

/**
 * Reads one US income tax calculation.
 *
 * One keyless request answers the federal, state, and local layers together.
 * Every layer carries the official document its figures came from.
 *
 * @param options - the calculation query and an optional fetch stub
 * @returns the calculation in the adapter's shape
 */
export async function fetchEstimateTaxCalculation(options?: {
  query?: EstimateTaxQuery;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<EstimateTaxCalculation> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const url = buildEstimateTaxUrl(options?.query ?? ESTIMATETAX_DEFAULT_QUERY);
  const response = await httpGet(ESTIMATETAX_INCOME_TAX_SOURCE_ID, url, { fetchImpl });
  return parseEstimateTaxCalculation(await response.json());
}

/** EstimateTax US federal, state, and local income tax, keyless. */
export const estimatetaxIncomeTaxAdapter: UsDataAdapter<EstimateTaxCalculation> = {
  id: ESTIMATETAX_INCOME_TAX_SOURCE_ID,
  name: 'EstimateTax US income tax',
  auth: 'none',
  description:
    'US federal, state, and local income tax for one salary, with the official document behind every figure.',
  fetchLive: async (options) =>
    fetchEstimateTaxCalculation(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => parseEstimateTaxCalculation(payload),
  loadFixture: () => parseEstimateTaxCalculation(readFixtureJson(ESTIMATETAX_FIXTURE_FILENAME)),
};
