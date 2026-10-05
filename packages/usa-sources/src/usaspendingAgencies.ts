import { z } from 'zod';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the USAspending top-tier agencies source. */
export const USASPENDING_AGENCIES_SOURCE_ID = 'usaspending-agencies';

/** One top-tier federal agency and its budget figures for the active quarter. */
export interface UsaSpendingAgency {
  /** USAspending's own id for the agency. */
  agencyId: number;
  /** The agency's top-tier code, e.g. "247". */
  toptierCode: string;
  /** Short abbreviation, e.g. "HHS". */
  abbreviation: string;
  /** Full agency name. */
  agencyName: string;
  /** Fiscal year the figures describe, e.g. "2026". */
  activeFiscalYear: string;
  /** Fiscal quarter the figures describe, e.g. "4". */
  activeFiscalQuarter: string;
  /** Money spent during the active quarter, in dollars. */
  outlayAmount: number;
  /** Money committed by contract or grant, in dollars. */
  obligatedAmount: number;
  /** Budget authority for the active fiscal year, in dollars. */
  budgetAuthorityAmount: number;
  /** Total budget authority across the whole government, in dollars. */
  currentTotalBudgetAuthorityAmount: number;
  /** This agency's share of the whole budget authority, as a fraction. */
  percentageOfTotalBudgetAuthority: number;
  /** URL slug the agency uses, e.g. "department-of-health-and-human-services". */
  agencySlug: string;
  /** URL of the agency's congressional budget justification, or null when none. */
  congressionalJustificationUrl: string | null;
}

/** The agency list folded for a story. */
export interface UsaSpendingAgencyDirectory {
  /** One entry per top-tier agency. */
  agencies: UsaSpendingAgency[];
  agencyCount: number;
  /** Fiscal year the figures describe. */
  fiscalYear: string;
  /** Fiscal quarter the figures describe. */
  fiscalQuarter: string;
  /** Total budget authority across the whole government, in dollars. */
  currentTotalBudgetAuthorityAmount: number;
  /** Agency with the largest obligated amount. Ties go to the earlier list entry. */
  largestByObligation: UsaSpendingAgency;
  /** Agency with the largest outlay amount. Ties go to the earlier list entry. */
  largestByOutlay: UsaSpendingAgency;
}

/** Base URL for the USAspending API. */
export const USASPENDING_API_BASE = 'https://api.usaspending.gov/api/v2';

/** Path of the top-tier agency reference list. */
export const USASPENDING_TOP_TIER_AGENCIES_PATH = '/references/toptier_agencies/';

/** Committed snapshot, so a build works when the USAspending host is unreachable. */
const USASPENDING_AGENCIES_FIXTURE_FILENAME = 'usaspending-agencies-2026-10-05.json';

// The list arrives as rows with typed numbers. A row the agency could not
// complete arrives with null in the optional fields.
const USASPENDING_AGENCY_SCHEMA = z.object({
  agency_id: z.number().optional(),
  toptier_code: z.string().optional(),
  abbreviation: z.string().optional(),
  agency_name: z.string().optional(),
  congressional_justification_url: z.string().nullable().optional(),
  active_fy: z.string().optional(),
  active_fq: z.string().optional(),
  outlay_amount: z.number().optional(),
  obligated_amount: z.number().optional(),
  budget_authority_amount: z.number().optional(),
  current_total_budget_authority_amount: z.number().optional(),
  percentage_of_total_budget_authority: z.number().optional(),
  agency_slug: z.string().optional(),
});

const USASPENDING_AGENCIES_SCHEMA = z.object({
  results: z.array(USASPENDING_AGENCY_SCHEMA).optional(),
});

/** Picks the agency with the largest value, ties to the earlier entry. */
function largestAgencyBy(
  agencies: UsaSpendingAgency[],
  field: 'obligatedAmount' | 'outlayAmount'
): UsaSpendingAgency {
  const first = agencies[0];
  if (first === undefined) {
    throw new UsSourceParseError(USASPENDING_AGENCIES_SOURCE_ID, 'No agencies to summarise');
  }
  return agencies.reduce((best, agency) => (agency[field] > best[field] ? agency : best), first);
}

/**
 * Parses one response into the top-tier agency list and the headline agencies.
 *
 * A row without an id or a name is a changed shape and stops the parse. The
 * first row's fiscal year and quarter describe the whole list, which is how
 * the API builds it.
 *
 * @param payload - the JSON body from the USAspending agencies endpoint
 * @returns the agencies, the fiscal period, and the largest by obligation and outlay
 */
export function parseUsaSpendingAgenciesPayload(payload: unknown): UsaSpendingAgencyDirectory {
  const parsed = USASPENDING_AGENCIES_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(USASPENDING_AGENCIES_SOURCE_ID, parsed.error.message);
  }

  const rows = parsed.data.results ?? [];
  if (rows.length === 0) {
    throw new UsSourceParseError(
      USASPENDING_AGENCIES_SOURCE_ID,
      'The response carried no agencies'
    );
  }

  const agencies: UsaSpendingAgency[] = rows.map((row) => {
    if (row.agency_id === undefined || row.agency_name === undefined) {
      throw new UsSourceParseError(
        USASPENDING_AGENCIES_SOURCE_ID,
        'An agency row arrived without its id or name'
      );
    }
    return {
      agencyId: row.agency_id,
      toptierCode: row.toptier_code ?? '',
      abbreviation: row.abbreviation ?? '',
      agencyName: row.agency_name,
      activeFiscalYear: row.active_fy ?? '',
      activeFiscalQuarter: row.active_fq ?? '',
      outlayAmount: row.outlay_amount ?? 0,
      obligatedAmount: row.obligated_amount ?? 0,
      budgetAuthorityAmount: row.budget_authority_amount ?? 0,
      currentTotalBudgetAuthorityAmount: row.current_total_budget_authority_amount ?? 0,
      percentageOfTotalBudgetAuthority: row.percentage_of_total_budget_authority ?? 0,
      agencySlug: row.agency_slug ?? '',
      congressionalJustificationUrl: row.congressional_justification_url ?? null,
    };
  });

  const first = agencies[0];
  if (first === undefined) {
    throw new UsSourceParseError(USASPENDING_AGENCIES_SOURCE_ID, 'No agencies to summarise');
  }

  return {
    agencies,
    agencyCount: agencies.length,
    fiscalYear: first.activeFiscalYear,
    fiscalQuarter: first.activeFiscalQuarter,
    currentTotalBudgetAuthorityAmount: first.currentTotalBudgetAuthorityAmount,
    largestByObligation: largestAgencyBy(agencies, 'obligatedAmount'),
    largestByOutlay: largestAgencyBy(agencies, 'outlayAmount'),
  };
}

/**
 * Reads the top-tier federal agency reference list from USAspending.
 *
 * One keyless request covers every top-tier agency and the budget figures for
 * the active fiscal quarter.
 *
 * @param options - an optional fetch stub
 * @returns the agencies, the fiscal period, and the largest by obligation and outlay
 */
export async function fetchUsaSpendingAgencies(options?: {
  fetchImpl?: typeof globalThis.fetch;
}): Promise<UsaSpendingAgencyDirectory> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const url = `${USASPENDING_API_BASE}${USASPENDING_TOP_TIER_AGENCIES_PATH}`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new UsSourceApiError(
      USASPENDING_AGENCIES_SOURCE_ID,
      `HTTP ${response.status} reading the top-tier agencies`
    );
  }
  return parseUsaSpendingAgenciesPayload(await response.json());
}

/** USAspending top-tier federal agencies, one row per agency, keyless. */
export const usaspendingAgenciesAdapter: UsDataAdapter<UsaSpendingAgencyDirectory> = {
  id: USASPENDING_AGENCIES_SOURCE_ID,
  name: 'USAspending agencies',
  auth: 'none',
  description:
    'Top-tier federal agencies from USAspending, one row per agency, with the budget authority, obligations, and outlays for the active fiscal quarter.',
  fetchLive: async (options) =>
    fetchUsaSpendingAgencies(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => parseUsaSpendingAgenciesPayload(payload),
  loadFixture: () =>
    parseUsaSpendingAgenciesPayload(readFixtureJson(USASPENDING_AGENCIES_FIXTURE_FILENAME)),
};
