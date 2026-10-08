import { z } from 'zod';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { httpGet } from './http.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the FDIC bank directory source. */
export const FDIC_BANK_DIRECTORY_SOURCE_ID = 'fdic-bank-directory';

/** One bank in the FDIC's institution directory. */
export interface FdicBank {
  /** The FDIC's own certificate number for the bank. */
  id: string;
  /** The bank's legal name. */
  name: string;
  /** City of the bank's main office. */
  city: string;
  /** Two-letter state code of the main office. */
  stateAbbr: string;
}

/** One state and how many banks in the page sit there. */
export interface FdicBankStateCount {
  stateAbbr: string;
  bankCount: number;
}

/** One page of the bank directory, folded for a story. */
export interface FdicBankDirectory {
  /** One entry per bank in the page. */
  banks: FdicBank[];
  bankCount: number;
  /** How many banks the FDIC holds in total, not just in this page. */
  totalBanks: number;
  /** States the banks in the page sit in, most banks first. */
  states: FdicBankStateCount[];
}

/** Base URL for the FDIC institutions API. */
export const FDIC_BANK_API_BASE = 'https://banks.data.fdic.gov/api/institutions';

/** Row cap for one request. */
export const FDIC_BANK_ROW_LIMIT = 10;

/** Columns the adapter asks for. The directory carries many more. */
export const FDIC_BANK_FIELDS = 'NAME,CITY,STALP';

/** Committed snapshot, so a build works when the FDIC host is unreachable. */
const FDIC_BANK_FIXTURE_FILENAME = 'fdic-bank-directory-2026-10-05.json';

// The API wraps each institution in a result object with its own score, and
// answers a rejected request with an HTTP error and a body of {errors}.
const FDIC_BANK_ROW_SCHEMA = z.object({
  data: z.object({
    ID: z.string().optional(),
    NAME: z.string().optional(),
    CITY: z.string().optional(),
    STALP: z.string().optional(),
  }),
});

const FDIC_BANK_PAYLOAD_SCHEMA = z.object({
  meta: z.object({ total: z.number().optional() }).optional(),
  totals: z.object({ count: z.number().optional() }).optional(),
  data: z.array(FDIC_BANK_ROW_SCHEMA).optional(),
  errors: z.array(z.unknown()).optional(),
});

/**
 * Builds the request URL for one page of the bank directory.
 *
 * The endpoint is keyless. The `fields` parameter trims the response to the
 * columns a story reads, which keeps each row small. The service answers the
 * banks.data.fdic.gov host with a redirect to api.fdic.gov, which fetch
 * follows.
 *
 * @param options - an optional row cap and column list
 * @returns the full request URL
 */
export function buildFdicBankDirectoryUrl(options?: {
  rowLimit?: number;
  fields?: string;
}): string {
  const params = new URLSearchParams({
    limit: String(options?.rowLimit ?? FDIC_BANK_ROW_LIMIT),
    fields: options?.fields ?? FDIC_BANK_FIELDS,
  });
  return `${FDIC_BANK_API_BASE}?${params.toString()}`;
}

/** Counts banks per state in the order they were seen. */
function countFdicBankStates(banks: FdicBank[]): FdicBankStateCount[] {
  const counts = new Map<string, number>();
  for (const bank of banks) {
    counts.set(bank.stateAbbr, (counts.get(bank.stateAbbr) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([leftState, leftCount], [rightState, rightCount]) =>
      leftCount === rightCount ? leftState.localeCompare(rightState) : rightCount - leftCount
    )
    .map(([stateAbbr, bankCount]) => ({ stateAbbr, bankCount }));
}

/**
 * Parses one response into the banks in the page and the state counts.
 *
 * A row without an id, name, city, or state is a changed shape and stops the
 * parse. The API's own total is used for `totalBanks`, falling back to the
 * page size when the envelope omits it.
 *
 * @param payload - the JSON body from the FDIC institutions API
 * @returns the banks in the page, the total the FDIC reports, and state counts
 */
export function parseFdicBankDirectoryPayload(payload: unknown): FdicBankDirectory {
  const parsed = FDIC_BANK_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(FDIC_BANK_DIRECTORY_SOURCE_ID, parsed.error.message);
  }
  if (parsed.data.errors !== undefined && parsed.data.errors.length > 0) {
    throw new UsSourceApiError(FDIC_BANK_DIRECTORY_SOURCE_ID, 'The API rejected the request');
  }

  const rows = parsed.data.data ?? [];
  if (rows.length === 0) {
    throw new UsSourceParseError(FDIC_BANK_DIRECTORY_SOURCE_ID, 'The response carried no rows');
  }

  const banks: FdicBank[] = rows.map((row) => {
    const { ID, NAME, CITY, STALP } = row.data;
    if (ID === undefined || NAME === undefined || CITY === undefined || STALP === undefined) {
      throw new UsSourceParseError(
        FDIC_BANK_DIRECTORY_SOURCE_ID,
        'A bank row arrived without its id, name, city, or state'
      );
    }
    return { id: ID, name: NAME, city: CITY, stateAbbr: STALP };
  });

  const totalBanks = parsed.data.totals?.count ?? parsed.data.meta?.total ?? banks.length;

  return {
    banks,
    bankCount: banks.length,
    totalBanks,
    states: countFdicBankStates(banks),
  };
}

/**
 * Reads one page of the FDIC's bank directory.
 *
 * One keyless request covers the page. The service trims each row to the
 * columns asked for, so a story gets names, cities, and states without the
 * full institution record.
 *
 * @param options - an optional row cap and fetch stub
 * @returns the banks in the page, the FDIC total, and the state counts
 */
export async function fetchFdicBankDirectory(options?: {
  rowLimit?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<FdicBankDirectory> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const url = buildFdicBankDirectoryUrl(
    options?.rowLimit === undefined ? {} : { rowLimit: options.rowLimit }
  );
  const response = await httpGet(FDIC_BANK_DIRECTORY_SOURCE_ID, url, { fetchImpl });
  return parseFdicBankDirectoryPayload(await response.json());
}

/** FDIC bank directory, one row per insured institution, keyless. */
export const fdicBankDirectoryAdapter: UsDataAdapter<FdicBankDirectory> = {
  id: FDIC_BANK_DIRECTORY_SOURCE_ID,
  name: 'FDIC bank directory',
  auth: 'none',
  description:
    'Insured banks in the FDIC institution directory, one row per bank, with the city and state of its main office.',
  fetchLive: async (options) =>
    fetchFdicBankDirectory(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => parseFdicBankDirectoryPayload(payload),
  loadFixture: () => parseFdicBankDirectoryPayload(readFixtureJson(FDIC_BANK_FIXTURE_FILENAME)),
};
