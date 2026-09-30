import { z } from 'zod';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** One disaster declaration in the OpenFEMA file. */
export interface FemaDeclaration {
  /** The agency's own identifier for the declaration, e.g. 5672. */
  disasterNumber: number;
  /** The date the declaration was signed, e.g. "2026-09-15T00:00:00.000Z". */
  declarationDate: string;
  /** Calendar year the declaration is dated to. */
  year: number;
  /**
   * The program the declaration was made under: Major Disaster, Emergency,
   * Fire Management, or Fire Suppression.
   */
  declarationType: string;
  /** The hazard behind the declaration, e.g. "Fire" or "Severe Storm". */
  incidentType: string;
  /** Two-letter state or territory code the declaration names. */
  stateCode: string;
  /** State or territory name that goes with the code. */
  stateName: string;
}

/** One calendar year of declarations, with the fire share split out. */
export interface FemaDeclarationYear {
  year: number;
  total: number;
  fire: number;
}

/** One value of a counted field, with how many declarations carry it. */
export interface FemaDeclarationCount {
  name: string;
  count: number;
}

/** The whole declaration file, folded into the shape a story reads. */
export interface FemaDeclarationCatalogue {
  /** Every declaration in the file, oldest first. */
  declarations: FemaDeclaration[];
  declarationCount: number;
  firstYear: number;
  newestYear: number;
  /** One entry per calendar year in the file, oldest first. */
  years: FemaDeclarationYear[];
  busiestYear: FemaDeclarationYear;
  /** Declarations whose incident type is fire. */
  fireCount: number;
  firstFireYear: number;
  /** Incident types, most declarations first. */
  incidentTypes: FemaDeclarationCount[];
  /** Declaration programs, most declarations first. */
  declarationTypes: FemaDeclarationCount[];
  /** States and territories, most declarations first. */
  topStates: FemaDeclarationCount[];
}

/** Base URL for the OpenFEMA API. */
export const FEMA_OPEN_DATA_API_BASE = 'https://www.fema.gov/api/open/v1';

/** Dataset path for the web disaster declarations file. */
export const FEMA_DECLARATION_PATH = '/FemaWebDisasterDeclarations';

/**
 * Row cap for one request.
 *
 * The file carries a little over five thousand declarations from 1953 on,
 * so one request covers it and the adapter never pages. A file that outgrows
 * the cap is caught by the parser rather than silently truncated.
 */
export const FEMA_DECLARATION_ROW_LIMIT = 10_000;

/**
 * Incident type the file uses for wildfire declarations.
 *
 * Fires arrive under several declaration programs (Fire Management, Fire
 * Suppression, and occasionally Major Disaster), so the incident type is what
 * the adapter counts rather than the program.
 */
export const FEMA_FIRE_INCIDENT_TYPE = 'Fire';

/** Columns the adapter asks for. The dataset carries about twenty more. */
const FEMA_DECLARATION_COLUMNS =
  'disasterNumber,declarationDate,declarationType,incidentType,stateCode,stateName';

/** Committed snapshot, so a build works when the FEMA host is unreachable. */
const FEMA_DECLARATION_FIXTURE_FILENAME = 'fema-disaster-declarations-2026-09-29.json';

/** Shape of the agency's declaration date, e.g. "2026-09-15T00:00:00.000Z". */
const ISO_DATE_PATTERN = /^(\d{4})-\d{2}-\d{2}/;

// Every field arrives as a string, and a row the agency could not complete
// arrives with the field missing. A rejected request answers with HTTP 400
// and a body of {error: [{code, type, message}]} instead of the data.
const FEMA_ROW_SCHEMA = z.object({
  disasterNumber: z.number().optional(),
  declarationDate: z.string().optional(),
  declarationType: z.string().optional(),
  incidentType: z.string().optional(),
  stateCode: z.string().optional(),
  stateName: z.string().optional(),
});

const FEMA_ERROR_SCHEMA = z.object({
  name: z.string().optional(),
  code: z.string().optional(),
  type: z.string().optional(),
  message: z.string().optional(),
});

const FEMA_PAYLOAD_SCHEMA = z.object({
  metadata: z.object({ count: z.number().optional() }).optional(),
  FemaWebDisasterDeclarations: z.array(FEMA_ROW_SCHEMA).optional(),
  error: z.array(FEMA_ERROR_SCHEMA).optional(),
});

/**
 * Builds the request URL for the whole declaration file.
 *
 * The endpoint is keyless. The row cap is high enough that one request
 * covers the file, and the inline count lets the parser tell a complete
 * response from a truncated one.
 *
 * @param options - an optional row cap
 * @returns the full request URL
 */
export function buildFemaDeclarationUrl(options?: { rowLimit?: number }): string {
  const params = new URLSearchParams({
    $select: FEMA_DECLARATION_COLUMNS,
    $orderby: 'disasterNumber',
    $inlinecount: 'allpages',
    $top: String(options?.rowLimit ?? FEMA_DECLARATION_ROW_LIMIT),
  });
  return `${FEMA_OPEN_DATA_API_BASE}${FEMA_DECLARATION_PATH}?${params.toString()}`;
}

/**
 * Parses one response into the declarations it carries.
 *
 * A row without the fields the story reads stops the parse, so a changed
 * response shape cannot quietly produce a half-empty file. A response whose
 * row count falls short of the agency's own count means the file has outgrown
 * the request and is also refused, rather than truncated.
 *
 * @param payload - the JSON body from the OpenFEMA API
 * @returns the declarations, in the order the agency sent them
 */
export function parseFemaDeclarationPayload(payload: unknown): FemaDeclaration[] {
  const parsed = FEMA_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError('fema', parsed.error.message);
  }

  const firstError = parsed.data.error?.[0];
  if (firstError !== undefined) {
    throw new UsSourceApiError(
      'fema',
      `${firstError.type ?? 'error'}: ${firstError.message ?? firstError.code ?? 'rejected'}`
    );
  }

  const rows = parsed.data.FemaWebDisasterDeclarations ?? [];
  if (rows.length === 0) {
    throw new UsSourceParseError('fema', 'The response carried no declarations');
  }

  const reportedCount = parsed.data.metadata?.count;
  if (reportedCount !== undefined && reportedCount > rows.length) {
    throw new UsSourceParseError(
      'fema',
      `The file holds ${String(reportedCount)} declarations and the request returned ${String(rows.length)}`
    );
  }

  const declarations: FemaDeclaration[] = [];
  for (const row of rows) {
    const { disasterNumber, declarationDate, declarationType, incidentType } = row;
    if (
      disasterNumber === undefined ||
      declarationDate === undefined ||
      declarationType === undefined ||
      incidentType === undefined ||
      row.stateCode === undefined ||
      row.stateName === undefined
    ) {
      throw new UsSourceParseError(
        'fema',
        `A declaration row is missing a field: ${JSON.stringify(row)}`
      );
    }
    const match = ISO_DATE_PATTERN.exec(declarationDate);
    if (match === null) {
      throw new UsSourceParseError('fema', `Unreadable declaration date: ${declarationDate}`);
    }
    declarations.push({
      disasterNumber,
      declarationDate,
      year: Number(match[1]),
      declarationType,
      incidentType,
      stateCode: row.stateCode,
      stateName: row.stateName,
    });
  }

  return declarations;
}

/** Counts how often each value of a field appears, most first then by name. */
function countBy(
  declarations: FemaDeclaration[],
  pick: (declaration: FemaDeclaration) => string
): FemaDeclarationCount[] {
  const counts = new Map<string, number>();
  for (const declaration of declarations) {
    const key = pick(declaration);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

/**
 * Folds the parsed file into the per-year and per-value counts a story reads.
 *
 * The years run from the oldest declaration in the file to the newest, and
 * the newest one is a partial year whenever the current year is still open.
 *
 * @param declarations - the parsed declarations, in any order
 * @returns the per-year counts, the busiest year, and the value counts
 */
export function buildFemaDeclarationCatalogue(
  declarations: FemaDeclaration[]
): FemaDeclarationCatalogue {
  if (declarations.length === 0) {
    throw new UsSourceParseError('fema', 'No declarations to summarise');
  }

  const sorted = [...declarations].sort((left, right) => left.year - right.year);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) {
    throw new UsSourceParseError('fema', 'No declarations to summarise');
  }

  const yearTotals = new Map<number, FemaDeclarationYear>();
  for (const declaration of sorted) {
    const entry = yearTotals.get(declaration.year) ?? {
      year: declaration.year,
      total: 0,
      fire: 0,
    };
    entry.total += 1;
    if (declaration.incidentType === FEMA_FIRE_INCIDENT_TYPE) {
      entry.fire += 1;
    }
    yearTotals.set(declaration.year, entry);
  }

  const years = [...yearTotals.values()].sort((left, right) => left.year - right.year);
  const busiestYear = years.reduce((busiest, year) =>
    year.total > busiest.total ? year : busiest
  );
  const fireDeclarations = sorted.filter(
    (declaration) => declaration.incidentType === FEMA_FIRE_INCIDENT_TYPE
  );

  return {
    declarations: sorted,
    declarationCount: sorted.length,
    firstYear: first.year,
    newestYear: last.year,
    years,
    busiestYear,
    fireCount: fireDeclarations.length,
    firstFireYear: fireDeclarations[0]?.year ?? first.year,
    incidentTypes: countBy(sorted, (declaration) => declaration.incidentType),
    declarationTypes: countBy(sorted, (declaration) => declaration.declarationType),
    topStates: countBy(sorted, (declaration) => declaration.stateCode),
  };
}

/**
 * Reads the OpenFEMA disaster declaration file.
 *
 * One keyless request covers the whole file, from the 1953 declarations to
 * the newest one the agency has published.
 *
 * @param options - an optional row cap and fetch stub
 * @returns the declarations and the counts the story reads
 */
export async function fetchFemaDeclarations(options?: {
  rowLimit?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<FemaDeclarationCatalogue> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const url = buildFemaDeclarationUrl(
    options?.rowLimit === undefined ? {} : { rowLimit: options.rowLimit }
  );
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new UsSourceApiError('fema', `HTTP ${response.status} reading the declaration file`);
  }
  return buildFemaDeclarationCatalogue(parseFemaDeclarationPayload(await response.json()));
}

/** FEMA disaster declarations, keyless. */
export const femaDisasterDeclarationsAdapter: UsDataAdapter<FemaDeclarationCatalogue> = {
  id: 'fema-disaster-declarations',
  name: 'FEMA disaster declarations',
  auth: 'none',
  description:
    'Every disaster declaration FEMA has published, one row per declaration, from 1953 to the newest declaration.',
  fetchLive: async (options) =>
    fetchFemaDeclarations(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  parse: (payload) => buildFemaDeclarationCatalogue(parseFemaDeclarationPayload(payload)),
  loadFixture: () =>
    buildFemaDeclarationCatalogue(
      parseFemaDeclarationPayload(readFixtureJson(FEMA_DECLARATION_FIXTURE_FILENAME))
    ),
};
