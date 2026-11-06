import { z } from 'zod';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpPostJson } from './http.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the NIH RePORTER funded-projects source. */
export const NIH_REPORTER_SOURCE_ID = 'nih-reporter-projects';

/** Base URL for the NIH RePORTER v2 project search endpoint. */
export const NIH_REPORTER_SEARCH_URL = 'https://api.reporter.nih.gov/v2/projects/search';

/** Fiscal year the committed fixture covers. */
export const NIH_REPORTER_DEFAULT_FISCAL_YEAR = 2025;

/** Number of projects one request asks for. */
export const NIH_REPORTER_PAGE_SIZE = 10;

/** One funded NIH project, trimmed to the fields a story reads. */
export interface NihReporterProject {
  /** The agency's project number, e.g. "5R01AI000001-01". */
  projectNumber: string;
  /** Core project number shared by awards under the same project, or null. */
  coreProjectNumber: string | null;
  projectTitle: string;
  fiscalYear: number;
  /** Award amount in US dollars for the fiscal year, or null when absent. */
  awardAmount: number | null;
  organizationName: string;
  organizationCity: string | null;
  organizationState: string | null;
  /** Investigator names with repeated whitespace collapsed. */
  principalInvestigators: string[];
  /** NIH institute or centre that administers the project, or null. */
  administeringInstitute: string | null;
  /** Project start date as YYYY-MM-DD, or null when absent. */
  projectStartDate: string | null;
  /** Project end date as YYYY-MM-DD, or null when absent. */
  projectEndDate: string | null;
  /** Public RePORTER page for the project, or null when absent. */
  projectDetailUrl: string | null;
}

/** One page of NIH RePORTER projects, with the agency's total match count. */
export interface NihReporterProjectPage {
  projects: NihReporterProject[];
  projectCount: number;
  totalCount: number;
  offset: number;
  limit: number;
  /** Sum of the award amounts on this page, in US dollars. */
  pageAwardAmountUsd: number;
}

/** Caller-selected filters for one project search. */
export interface NihReporterProjectQuery {
  fiscalYear?: number;
  limit?: number;
  offset?: number;
}

/** JSON body sent to the NIH RePORTER v2 project search endpoint. */
export interface NihReporterSearchBody {
  criteria: {
    fiscal_years: number[];
    agencies: string[];
  };
  include_fields: string[];
  offset: number;
  limit: number;
  sort_field: string;
  sort_order: 'asc' | 'desc';
}

/** Committed snapshot, so a build works when the NIH host is unreachable. */
const NIH_REPORTER_FIXTURE_FILENAME = 'nih-reporter-projects-fy2025-2026-11-07.json';

/** Columns the adapter asks for. The full project record carries many more. */
const NIH_REPORTER_INCLUDE_FIELDS = [
  'ProjectNum',
  'CoreProjectNum',
  'ProjectTitle',
  'FiscalYear',
  'AwardAmount',
  'Organization',
  'PrincipalInvestigators',
  'ProjectStartDate',
  'ProjectEndDate',
  'AgencyIcAdmin',
  'ProjectDetailUrl',
];

const NIH_REPORTER_PROJECT_SCHEMA = z.object({
  fiscal_year: z.number(),
  project_num: z.string(),
  core_project_num: z.string().nullable().optional(),
  project_title: z.string(),
  award_amount: z.number().nullable().optional(),
  organization: z.object({
    org_name: z.string(),
    org_city: z.string().nullable().optional(),
    org_state: z.string().nullable().optional(),
  }),
  principal_investigators: z
    .array(z.object({ full_name: z.string().optional() }))
    .nullable()
    .optional(),
  agency_ic_admin: z
    .object({ abbreviation: z.string().optional(), name: z.string().optional() })
    .nullable()
    .optional(),
  project_start_date: z.string().nullable().optional(),
  project_end_date: z.string().nullable().optional(),
  project_detail_url: z.string().nullable().optional(),
});

const NIH_REPORTER_PAYLOAD_SCHEMA = z.object({
  meta: z
    .object({
      total: z.number(),
      offset: z.number(),
      limit: z.number(),
    })
    .optional(),
  results: z.array(NIH_REPORTER_PROJECT_SCHEMA).optional(),
  message: z.string().optional(),
});

/**
 * Builds the JSON body for one project search.
 *
 * The endpoint is keyless. The default page is fiscal 2025, the year the
 * fixture covers, ordered by the largest award first so repeated calls return
 * a stable, useful slice of the file.
 *
 * @param query - an optional fiscal year, page size, and offset
 * @returns the request body for the search endpoint
 */
export function buildNihReporterSearchBody(
  query: NihReporterProjectQuery = {}
): NihReporterSearchBody {
  return {
    criteria: {
      fiscal_years: [query.fiscalYear ?? NIH_REPORTER_DEFAULT_FISCAL_YEAR],
      agencies: ['NIH'],
    },
    include_fields: NIH_REPORTER_INCLUDE_FIELDS,
    offset: query.offset ?? 0,
    limit: query.limit ?? NIH_REPORTER_PAGE_SIZE,
    sort_field: 'award_amount',
    sort_order: 'desc',
  };
}

/** Converts an ISO timestamp or date to YYYY-MM-DD, or null when absent. */
function normalizeNihReporterDate(value: string | null | undefined, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (match === null) {
    throw new UsSourceParseError(NIH_REPORTER_SOURCE_ID, `Unreadable ${field}: ${value}`);
  }
  return match[1] ?? null;
}

/** Collapses the repeated spaces NIH writes inside investigator names. */
function normalizeInvestigatorName(name: string): string {
  return name.split(/\s+/).filter(Boolean).join(' ');
}

/**
 * Parses one NIH RePORTER project search response.
 *
 * A body carrying a top-level message is an API error, even when the host
 * answers HTTP 200. A project without its number, title, fiscal year, or
 * organization is a changed shape and stops the parse.
 *
 * @param payload - the JSON body from the NIH RePORTER search endpoint
 * @returns the projects on the page, the agency total, and the page award sum
 */
export function parseNihReporterProjectsPayload(payload: unknown): NihReporterProjectPage {
  const parsed = NIH_REPORTER_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(NIH_REPORTER_SOURCE_ID, parsed.error.message);
  }
  if (parsed.data.message !== undefined) {
    throw new UsSourceApiError(NIH_REPORTER_SOURCE_ID, parsed.data.message);
  }
  const meta = parsed.data.meta;
  const rows = parsed.data.results;
  if (meta === undefined || rows === undefined) {
    throw new UsSourceParseError(
      NIH_REPORTER_SOURCE_ID,
      'The response carried no meta block or results array'
    );
  }

  const projects: NihReporterProject[] = rows.map((row) => ({
    projectNumber: row.project_num,
    coreProjectNumber: row.core_project_num ?? null,
    projectTitle: row.project_title,
    fiscalYear: row.fiscal_year,
    awardAmount: row.award_amount ?? null,
    organizationName: row.organization.org_name,
    organizationCity: row.organization.org_city ?? null,
    organizationState: row.organization.org_state ?? null,
    principalInvestigators: (row.principal_investigators ?? []).flatMap((investigator) => {
      if (investigator.full_name === undefined) {
        return [];
      }
      const name = normalizeInvestigatorName(investigator.full_name);
      return name === '' ? [] : [name];
    }),
    administeringInstitute:
      row.agency_ic_admin?.abbreviation === undefined || row.agency_ic_admin.abbreviation === ''
        ? (row.agency_ic_admin?.name ?? null)
        : row.agency_ic_admin.abbreviation,
    projectStartDate: normalizeNihReporterDate(row.project_start_date, 'project start date'),
    projectEndDate: normalizeNihReporterDate(row.project_end_date, 'project end date'),
    projectDetailUrl: row.project_detail_url ?? null,
  }));

  return {
    projects,
    projectCount: projects.length,
    totalCount: meta.total,
    offset: meta.offset,
    limit: meta.limit,
    pageAwardAmountUsd: projects.reduce((total, project) => total + (project.awardAmount ?? 0), 0),
  };
}

/**
 * Reads one page of NIH-funded projects through the RePORTER search API.
 *
 * One keyless POST returns a page of projects, the total number of matches,
 * and the combined award value on that page.
 *
 * @param options - an optional fiscal year, page window, and fetch stub
 * @returns the projects on the page and the search totals
 */
export async function fetchNihReporterProjects(
  options: NihReporterProjectQuery & { fetchImpl?: typeof globalThis.fetch } = {}
): Promise<NihReporterProjectPage> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const body = buildNihReporterSearchBody({
    ...(options.fiscalYear === undefined ? {} : { fiscalYear: options.fiscalYear }),
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    ...(options.offset === undefined ? {} : { offset: options.offset }),
  });
  const response = await httpPostJson(NIH_REPORTER_SOURCE_ID, NIH_REPORTER_SEARCH_URL, body, {
    fetchImpl,
    headers: { accept: 'application/json' },
  });
  return parseNihReporterProjectsPayload(await response.json());
}

/** NIH RePORTER funded projects, one row per project, keyless. */
export const nihReporterProjectsAdapter: UsDataAdapter<NihReporterProjectPage> = {
  id: NIH_REPORTER_SOURCE_ID,
  name: 'NIH RePORTER funded projects',
  auth: 'none',
  description:
    'NIH RePORTER funded projects for one fiscal year, with the project title, award amount, organization, principal investigators, and administering institute.',
  fetchLive: async (options) =>
    fetchNihReporterProjects(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => parseNihReporterProjectsPayload(payload),
  loadFixture: () =>
    parseNihReporterProjectsPayload(readFixtureJson(NIH_REPORTER_FIXTURE_FILENAME)),
};
