import { strFromU8, unzipSync } from 'fflate';

import { UsSourceParseError } from './errors.js';
import { readFixtureText } from './fixtures.js';
import { httpGet } from './http.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the College Scorecard institution-level download. */
export const COLLEGE_SCORECARD_INSTITUTION_SOURCE_ID = 'college-scorecard-institutions';

/** The dated, keyless institution-level archive published by College Scorecard. */
export const COLLEGE_SCORECARD_INSTITUTION_ARCHIVE_URL =
  'https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Institution_10152026.zip';

/** The data release the pinned archive represents, as YYYY-MM-DD. */
export const COLLEGE_SCORECARD_DATA_RELEASE_DATE = '2026-10-15';

/**
 * The archive is 24 MB, and the CSV inside it is 102 MB.
 *
 * The shared 30 second timeout is tuned for small JSON answers, so this
 * adapter allows two minutes for the download and inflation.
 */
export const COLLEGE_SCORECARD_FETCH_TIMEOUT_MS = 120_000;

/** Committed sample of real rows, so a build works when the archive is unreachable. */
const COLLEGE_SCORECARD_FIXTURE_FILENAME = 'college-scorecard-institutions-2026-10-15-sampled.csv';

/** The kind of institution the federal government recorded. */
export type CollegeScorecardControl =
  'public' | 'private-nonprofit' | 'private-for-profit' | 'unknown';

/** One institution and the outcome fields a story can use. */
export interface CollegeScorecardInstitution {
  /** IPEDS unit id, the federal identifier for the institution. */
  unitId: number;
  /** Department of Education OPEID, or an empty string when the file has none. */
  opeId: string;
  /** Institution name as it appears in the federal file. */
  name: string;
  /** City and state from the institution address. */
  city: string;
  /** Two-letter state abbreviation, or an empty string when the file has none. */
  stateAbbr: string;
  /** Public institution website, or null when the file has none. */
  institutionUrl: string | null;
  /** Public, private nonprofit, private for-profit, or unknown. */
  control: CollegeScorecardControl;
  /** Undergraduate enrollment, or null when suppressed. */
  undergraduateEnrollment: number | null;
  /** Admission rate as a fraction from 0 to 1, or null when unavailable. */
  admissionRate: number | null;
  /** In-state tuition and fees in dollars, or null when unavailable. */
  inStateTuition: number | null;
  /** Out-of-state tuition and fees in dollars, or null when unavailable. */
  outStateTuition: number | null;
  /** Median federal student debt at graduation in dollars, or null. */
  medianDebt: number | null;
  /** Six-year completion rate as a fraction, or null when unavailable. */
  completionRate: number | null;
  /** First-year retention rate as a fraction, or null when unavailable. */
  retentionRate: number | null;
  /**
   * Median earnings of graduates working and not enrolled ten years after
   * entry, in dollars, or null when unavailable.
   */
  medianEarnings10Years: number | null;
}

/** One state's institutions, folded into the numbers a chart needs. */
export interface CollegeScorecardStateSummary {
  /** Two-letter state abbreviation. */
  stateAbbr: string;
  /** Institutions in the state, whether or not they report outcomes. */
  institutionCount: number;
  /** Institutions with a reported ten-year median earnings figure. */
  earningsReportedCount: number;
  /** Median of the reported institution medians, in dollars, or null. */
  medianEarnings10Years: number | null;
  /** Median of the reported institution median debt figures, in dollars, or null. */
  medianDebt: number | null;
  /** Median of the reported institution completion rates, or null. */
  medianCompletionRate: number | null;
  /** Public institutions in the state. */
  publicInstitutionCount: number;
  /** Private nonprofit institutions in the state. */
  privateNonprofitInstitutionCount: number;
  /** Private for-profit institutions in the state. */
  privateForProfitInstitutionCount: number;
}

/** The institution file folded for a story. */
export interface CollegeScorecardSnapshot {
  /** The College Scorecard release the pinned archive represents. */
  dataReleaseDate: string;
  /** One row per institution in the file. */
  institutions: CollegeScorecardInstitution[];
  institutionCount: number;
  /** Number of states and territories with at least one institution. */
  stateCount: number;
  /** Institutions with a reported ten-year median earnings figure. */
  earningsReportedCount: number;
  /** States and territories, alphabetical by abbreviation. */
  stateSummaries: CollegeScorecardStateSummary[];
  /** Median of every reported institution median, in dollars, or null. */
  nationalMedianEarnings10Years: number | null;
  /** Median of every reported institution median debt, in dollars, or null. */
  nationalMedianDebt: number | null;
  /** Median of every reported institution completion rate, or null. */
  nationalMedianCompletionRate: number | null;
  /** State with the highest median of institution earnings, or null. */
  highestEarningState: CollegeScorecardStateSummary | null;
  /** State with the lowest median of institution earnings, or null. */
  lowestEarningState: CollegeScorecardStateSummary | null;
  /** Institution with the highest ten-year median earnings, or null. */
  highestEarningInstitution: CollegeScorecardInstitution | null;
}

/** Column names the adapter reads from the wide institution CSV. */
const REQUIRED_COLUMNS = [
  'UNITID',
  'OPEID',
  'INSTNM',
  'CITY',
  'STABBR',
  'INSTURL',
  'CONTROL',
  'UGDS',
  'ADM_RATE',
  'TUITIONFEE_IN',
  'TUITIONFEE_OUT',
  'DEBT_MDN',
  'C150_4',
  'RET_FT4',
  'MD_EARN_WNE_P10',
] as const;

/** Values the federal file uses for a number it did not publish. */
const MISSING_VALUES = new Set(['', 'NA', 'PS', 'PRIVACYSUPPRESSED', 'NULL']);

/** The control codes the federal file uses for public and private institutions. */
const CONTROL_LABELS: Record<string, CollegeScorecardControl> = {
  '1': 'public',
  '2': 'private-nonprofit',
  '3': 'private-for-profit',
};

/**
 * Splits one CSV line into fields, following the quoting rule the federal file
 * uses: a field wrapped in double quotes may contain commas, and two double
 * quotes inside it mean one literal double quote.
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (inQuotes) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else if (character !== undefined) {
        field += character;
      }
    } else if (character === '"') {
      inQuotes = true;
    } else if (character === ',') {
      fields.push(field);
      field = '';
    } else if (character !== undefined && character !== '\r') {
      field += character;
    }
  }

  if (inQuotes) {
    throw new UsSourceParseError(
      COLLEGE_SCORECARD_INSTITUTION_SOURCE_ID,
      'A quoted field in the institution file did not close'
    );
  }

  fields.push(field);
  return fields;
}

/** Reads a text field, turning the federal missing markers into an empty string. */
function readText(value: string | undefined): string {
  const text = value?.trim() ?? '';
  return MISSING_VALUES.has(text.toUpperCase()) ? '' : text;
}

/** Reads a numeric field, turning suppressed values into null. */
function readNumber(value: string | undefined, column: string): number | null {
  const text = readText(value);
  if (text === '') {
    return null;
  }
  const number = Number(text);
  if (!Number.isFinite(number)) {
    throw new UsSourceParseError(
      COLLEGE_SCORECARD_INSTITUTION_SOURCE_ID,
      `Unreadable ${column} value in the institution file: ${text}`
    );
  }
  return number;
}

/** Maps the federal control code to its plain-language label. */
function readControl(value: string | undefined): CollegeScorecardControl {
  return CONTROL_LABELS[readText(value)] ?? 'unknown';
}

/** Returns the median of the values, or null when there are none. */
function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }
  const left = sorted[middle - 1];
  const right = sorted[middle];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}

/** Builds one state's summary from the institutions in it. */
function buildStateSummary(
  stateAbbr: string,
  institutions: CollegeScorecardInstitution[]
): CollegeScorecardStateSummary {
  const earnings = institutions
    .map((institution) => institution.medianEarnings10Years)
    .filter((value): value is number => value !== null);
  const debt = institutions
    .map((institution) => institution.medianDebt)
    .filter((value): value is number => value !== null);
  const completion = institutions
    .map((institution) => institution.completionRate)
    .filter((value): value is number => value !== null);

  return {
    stateAbbr,
    institutionCount: institutions.length,
    earningsReportedCount: earnings.length,
    medianEarnings10Years: median(earnings),
    medianDebt: median(debt),
    medianCompletionRate: median(completion),
    publicInstitutionCount: institutions.filter((institution) => institution.control === 'public')
      .length,
    privateNonprofitInstitutionCount: institutions.filter(
      (institution) => institution.control === 'private-nonprofit'
    ).length,
    privateForProfitInstitutionCount: institutions.filter(
      (institution) => institution.control === 'private-for-profit'
    ).length,
  };
}

/** Picks the institution with the highest reported earnings, ties to the earlier row. */
function findHighestEarningInstitution(
  institutions: CollegeScorecardInstitution[]
): CollegeScorecardInstitution | null {
  let best: CollegeScorecardInstitution | null = null;
  for (const institution of institutions) {
    if (institution.medianEarnings10Years === null) {
      continue;
    }
    if (
      best === null ||
      (best.medianEarnings10Years !== null &&
        institution.medianEarnings10Years > best.medianEarnings10Years)
    ) {
      best = institution;
    }
  }
  return best;
}

/** Picks the state with the highest or lowest median earnings, ties alphabetically. */
function findStateByEarnings(
  summaries: CollegeScorecardStateSummary[],
  direction: 'highest' | 'lowest'
): CollegeScorecardStateSummary | null {
  const reported = summaries.filter(
    (summary): summary is CollegeScorecardStateSummary & { medianEarnings10Years: number } =>
      summary.medianEarnings10Years !== null
  );
  if (reported.length === 0) {
    return null;
  }
  return reported.reduce((best, summary) => {
    if (summary.medianEarnings10Years === best.medianEarnings10Years) {
      return summary.stateAbbr < best.stateAbbr ? summary : best;
    }
    const higher = summary.medianEarnings10Years > best.medianEarnings10Years;
    return (direction === 'highest' ? higher : !higher) ? summary : best;
  });
}

/**
 * Parses the institution-level CSV into one row per institution and its state
 * summaries.
 *
 * The federal file is very wide and uses "NA" and "PS" for figures it did not
 * publish. Those become null rather than zero, so a chart never turns a
 * suppressed value into an invented one.
 *
 * @param csv - the CSV text from the institution archive
 * @returns every institution, plus the state and national summaries
 */
export function parseCollegeScorecardCsv(csv: string): CollegeScorecardSnapshot {
  const lines = csv
    .replace(/^\ufeff/, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');
  const headerLine = lines[0];
  if (headerLine === undefined) {
    throw new UsSourceParseError(
      COLLEGE_SCORECARD_INSTITUTION_SOURCE_ID,
      'The institution file was empty'
    );
  }

  const header = splitCsvLine(headerLine);
  const columnIndexes = new Map<string, number>();
  for (const column of REQUIRED_COLUMNS) {
    const index = header.indexOf(column);
    if (index === -1) {
      throw new UsSourceParseError(
        COLLEGE_SCORECARD_INSTITUTION_SOURCE_ID,
        `The institution file is missing the ${column} column`
      );
    }
    columnIndexes.set(column, index);
  }

  const column = (row: string[], name: string): string | undefined => {
    const index = columnIndexes.get(name);
    return index === undefined ? undefined : row[index];
  };

  const institutions: CollegeScorecardInstitution[] = [];
  for (const line of lines.slice(1)) {
    const row = splitCsvLine(line);
    if (row.length !== header.length) {
      throw new UsSourceParseError(
        COLLEGE_SCORECARD_INSTITUTION_SOURCE_ID,
        `A row in the institution file had ${row.length} fields, expected ${header.length}`
      );
    }

    const unitId = readNumber(column(row, 'UNITID'), 'UNITID');
    const name = readText(column(row, 'INSTNM'));
    if (unitId === null || name === '') {
      throw new UsSourceParseError(
        COLLEGE_SCORECARD_INSTITUTION_SOURCE_ID,
        'An institution row arrived without its unit id or name'
      );
    }

    institutions.push({
      unitId,
      opeId: readText(column(row, 'OPEID')),
      name,
      city: readText(column(row, 'CITY')),
      stateAbbr: readText(column(row, 'STABBR')),
      institutionUrl: readText(column(row, 'INSTURL')) || null,
      control: readControl(column(row, 'CONTROL')),
      undergraduateEnrollment: readNumber(column(row, 'UGDS'), 'UGDS'),
      admissionRate: readNumber(column(row, 'ADM_RATE'), 'ADM_RATE'),
      inStateTuition: readNumber(column(row, 'TUITIONFEE_IN'), 'TUITIONFEE_IN'),
      outStateTuition: readNumber(column(row, 'TUITIONFEE_OUT'), 'TUITIONFEE_OUT'),
      medianDebt: readNumber(column(row, 'DEBT_MDN'), 'DEBT_MDN'),
      completionRate: readNumber(column(row, 'C150_4'), 'C150_4'),
      retentionRate: readNumber(column(row, 'RET_FT4'), 'RET_FT4'),
      medianEarnings10Years: readNumber(column(row, 'MD_EARN_WNE_P10'), 'MD_EARN_WNE_P10'),
    });
  }

  if (institutions.length === 0) {
    throw new UsSourceParseError(
      COLLEGE_SCORECARD_INSTITUTION_SOURCE_ID,
      'The institution file had a header but no rows'
    );
  }

  const byState = new Map<string, CollegeScorecardInstitution[]>();
  for (const institution of institutions) {
    if (institution.stateAbbr === '') {
      continue;
    }
    const rows = byState.get(institution.stateAbbr) ?? [];
    rows.push(institution);
    byState.set(institution.stateAbbr, rows);
  }
  const stateSummaries = [...byState.entries()]
    .map(([stateAbbr, rows]) => buildStateSummary(stateAbbr, rows))
    .sort((left, right) => left.stateAbbr.localeCompare(right.stateAbbr));

  const earnings = institutions
    .map((institution) => institution.medianEarnings10Years)
    .filter((value): value is number => value !== null);
  const debt = institutions
    .map((institution) => institution.medianDebt)
    .filter((value): value is number => value !== null);
  const completion = institutions
    .map((institution) => institution.completionRate)
    .filter((value): value is number => value !== null);

  return {
    dataReleaseDate: COLLEGE_SCORECARD_DATA_RELEASE_DATE,
    institutions,
    institutionCount: institutions.length,
    stateCount: stateSummaries.length,
    earningsReportedCount: earnings.length,
    stateSummaries,
    nationalMedianEarnings10Years: median(earnings),
    nationalMedianDebt: median(debt),
    nationalMedianCompletionRate: median(completion),
    highestEarningState: findStateByEarnings(stateSummaries, 'highest'),
    lowestEarningState: findStateByEarnings(stateSummaries, 'lowest'),
    highestEarningInstitution: findHighestEarningInstitution(institutions),
  };
}

/**
 * Reads the institution archive, which is a zip containing one wide CSV.
 *
 * The live download is a zip. A committed fixture and a hand-copied sample are
 * plain CSV, so the parser accepts both shapes.
 *
 * @param payload - the zip bytes, an ArrayBuffer, or CSV text
 * @returns every institution, plus the state and national summaries
 */
export function parseCollegeScorecardArchive(payload: unknown): CollegeScorecardSnapshot {
  if (typeof payload === 'string') {
    return parseCollegeScorecardCsv(payload);
  }

  let bytes: Uint8Array;
  if (payload instanceof ArrayBuffer) {
    bytes = new Uint8Array(payload);
  } else if (payload instanceof Uint8Array) {
    bytes = payload;
  } else {
    throw new UsSourceParseError(
      COLLEGE_SCORECARD_INSTITUTION_SOURCE_ID,
      'The institution archive must be zip bytes or CSV text'
    );
  }

  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return parseCollegeScorecardCsv(new TextDecoder().decode(bytes));
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch (error) {
    throw new UsSourceParseError(
      COLLEGE_SCORECARD_INSTITUTION_SOURCE_ID,
      'The institution archive was not a readable zip',
      { cause: error }
    );
  }

  const csvName = Object.keys(files).find(
    (name) => name.endsWith('.csv') && !name.startsWith('__MACOSX/')
  );
  const csvBytes = csvName === undefined ? undefined : files[csvName];
  if (csvBytes === undefined) {
    throw new UsSourceParseError(
      COLLEGE_SCORECARD_INSTITUTION_SOURCE_ID,
      'The institution archive contained no CSV'
    );
  }
  return parseCollegeScorecardCsv(strFromU8(csvBytes));
}

/**
 * Downloads and parses the keyless College Scorecard institution archive.
 *
 * @param options - an optional fetch stub
 * @returns every institution, plus the state and national summaries
 */
export async function fetchCollegeScorecardInstitutions(options?: {
  fetchImpl?: typeof globalThis.fetch;
}): Promise<CollegeScorecardSnapshot> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const response = await httpGet(
    COLLEGE_SCORECARD_INSTITUTION_SOURCE_ID,
    COLLEGE_SCORECARD_INSTITUTION_ARCHIVE_URL,
    { fetchImpl, timeoutMs: COLLEGE_SCORECARD_FETCH_TIMEOUT_MS }
  );
  return parseCollegeScorecardArchive(await response.arrayBuffer());
}

/** College Scorecard institution-level outcomes, keyless bulk download. */
export const collegeScorecardInstitutionsAdapter: UsDataAdapter<CollegeScorecardSnapshot> = {
  id: COLLEGE_SCORECARD_INSTITUTION_SOURCE_ID,
  name: 'College Scorecard institutions',
  auth: 'none',
  description:
    'Institution-level College Scorecard outcomes for US colleges: enrollment, cost, completion, debt, and earnings ten years after entry, from the Department of Education bulk download.',
  fetchLive: async (options) =>
    fetchCollegeScorecardInstitutions(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => parseCollegeScorecardArchive(payload),
  loadFixture: () => parseCollegeScorecardCsv(readFixtureText(COLLEGE_SCORECARD_FIXTURE_FILENAME)),
};
