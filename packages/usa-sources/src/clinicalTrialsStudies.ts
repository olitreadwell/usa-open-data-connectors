import { z } from 'zod';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the ClinicalTrials.gov studies source. */
export const CLINICALTRIALS_STUDIES_SOURCE_ID = 'clinicaltrials-studies';

/** One registered clinical study, trimmed to the fields a story reads. */
export interface ClinicalTrialStudy {
  /** The registry's own study id, e.g. "NCT07065435". */
  nctId: string;
  /** Short title the sponsor registered. */
  briefTitle: string;
  /** Recruitment status, e.g. "RECRUITING" or "COMPLETED". */
  overallStatus: string;
  /** Study type, e.g. "INTERVENTIONAL" or "OBSERVATIONAL", or null when absent. */
  studyType: string | null;
  /** Trial phases, e.g. ["PHASE2"]. Empty for observational studies. */
  phases: string[];
  /** Conditions the study covers. */
  conditions: string[];
  /** Name of the lead sponsor, or null when the study names none. */
  leadSponsor: string | null;
  /** Number of participants the study plans or enrolled, or null when absent. */
  enrollmentCount: number | null;
  /** Whether the enrollment count is expected or actual, or null when absent. */
  enrollmentType: string | null;
  /**
   * Date the study started. ClinicalTrials.gov writes a day-precision date
   * when it has one and a month-precision date such as "2000-10" when it does
   * not, so the adapter keeps the string as the registry wrote it.
   */
  startDate: string | null;
  /** Date of the study's latest update post, or null when absent. */
  lastUpdatePostDate: string | null;
}

/** One recruitment status and how many studies in the page carry it. */
export interface ClinicalTrialStatusCount {
  status: string;
  studyCount: number;
}

/** One page of studies, folded for a story. */
export interface ClinicalTrialStudyPage {
  /** One entry per study in the page. */
  studies: ClinicalTrialStudy[];
  studyCount: number;
  /** Recruitment statuses in the page, most studies first, ties by status name. */
  statusCounts: ClinicalTrialStatusCount[];
  /** Token for the next page of the same query, or null on the last page. */
  nextPageToken: string | null;
}

/** Base URL for the ClinicalTrials.gov studies API. */
export const CLINICALTRIALS_STUDIES_API_BASE = 'https://clinicaltrials.gov/api/v2/studies';

/** Page size for one request. */
export const CLINICALTRIALS_STUDIES_PAGE_SIZE = 10;

/** Committed snapshot, so a build works when the ClinicalTrials host is unreachable. */
const CLINICALTRIALS_STUDIES_FIXTURE_FILENAME = 'clinicaltrials-studies-2026-10-05.json';

const CLINICALTRIALS_STUDY_SCHEMA = z.object({
  protocolSection: z
    .object({
      identificationModule: z
        .object({ nctId: z.string().optional(), briefTitle: z.string().optional() })
        .optional(),
      statusModule: z
        .object({
          overallStatus: z.string().optional(),
          startDateStruct: z.object({ date: z.string().optional() }).optional(),
          lastUpdatePostDateStruct: z.object({ date: z.string().optional() }).optional(),
        })
        .optional(),
      sponsorCollaboratorsModule: z
        .object({ leadSponsor: z.object({ name: z.string().optional() }).optional() })
        .optional(),
      conditionsModule: z.object({ conditions: z.array(z.string()).optional() }).optional(),
      designModule: z
        .object({
          studyType: z.string().optional(),
          phases: z.array(z.string()).optional(),
          enrollmentInfo: z
            .object({ count: z.number().optional(), type: z.string().optional() })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

const CLINICALTRIALS_PAYLOAD_SCHEMA = z.object({
  studies: z.array(CLINICALTRIALS_STUDY_SCHEMA).optional(),
  nextPageToken: z.string().optional(),
});

/**
 * Builds the request URL for one page of studies.
 *
 * The endpoint is keyless. The default page size is small on purpose: one
 * study carries a deep protocol record, so a caller reading many pages should
 * pass the page token from the previous response.
 *
 * @param options - an optional page size
 * @returns the full request URL
 */
export function buildClinicalTrialsStudiesUrl(options?: { pageSize?: number }): string {
  const params = new URLSearchParams({
    pageSize: String(options?.pageSize ?? CLINICALTRIALS_STUDIES_PAGE_SIZE),
  });
  return `${CLINICALTRIALS_STUDIES_API_BASE}?${params.toString()}`;
}

/** Counts studies per recruitment status, most studies first, ties by name. */
function countClinicalTrialStatuses(studies: ClinicalTrialStudy[]): ClinicalTrialStatusCount[] {
  const counts = new Map<string, number>();
  for (const study of studies) {
    counts.set(study.overallStatus, (counts.get(study.overallStatus) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([leftStatus, leftCount], [rightStatus, rightCount]) =>
      leftCount === rightCount ? leftStatus.localeCompare(rightStatus) : rightCount - leftCount
    )
    .map(([status, studyCount]) => ({ status, studyCount }));
}

/**
 * Parses one page of studies into the fields a story reads.
 *
 * A study without a registry id or a brief title is a changed shape and stops
 * the parse. Optional protocol blocks are read when present and left null
 * when the registry did not carry them.
 *
 * @param payload - the JSON body from the ClinicalTrials.gov studies API
 * @returns the studies in the page, the status counts, and the next page token
 */
export function parseClinicalTrialsStudiesPayload(payload: unknown): ClinicalTrialStudyPage {
  const parsed = CLINICALTRIALS_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(CLINICALTRIALS_STUDIES_SOURCE_ID, parsed.error.message);
  }

  const rows = parsed.data.studies ?? [];
  if (rows.length === 0) {
    throw new UsSourceParseError(
      CLINICALTRIALS_STUDIES_SOURCE_ID,
      'The response carried no studies'
    );
  }

  const studies: ClinicalTrialStudy[] = rows.map((row) => {
    const protocol = row.protocolSection;
    const nctId = protocol?.identificationModule?.nctId;
    const briefTitle = protocol?.identificationModule?.briefTitle;
    if (nctId === undefined || briefTitle === undefined) {
      throw new UsSourceParseError(
        CLINICALTRIALS_STUDIES_SOURCE_ID,
        'A study arrived without its registry id or brief title'
      );
    }
    const status = protocol?.statusModule;
    const design = protocol?.designModule;
    return {
      nctId,
      briefTitle,
      overallStatus: status?.overallStatus ?? '',
      studyType: design?.studyType ?? null,
      phases: design?.phases ?? [],
      conditions: protocol?.conditionsModule?.conditions ?? [],
      leadSponsor: protocol?.sponsorCollaboratorsModule?.leadSponsor?.name ?? null,
      enrollmentCount: design?.enrollmentInfo?.count ?? null,
      enrollmentType: design?.enrollmentInfo?.type ?? null,
      startDate: status?.startDateStruct?.date ?? null,
      lastUpdatePostDate: status?.lastUpdatePostDateStruct?.date ?? null,
    };
  });

  return {
    studies,
    studyCount: studies.length,
    statusCounts: countClinicalTrialStatuses(studies),
    nextPageToken: parsed.data.nextPageToken ?? null,
  };
}

/**
 * Reads one page of registered clinical studies.
 *
 * One keyless request covers the page. The response also carries a token for
 * the next page of the same query, which the adapter keeps on the page it
 * returns.
 *
 * @param options - an optional page size and fetch stub
 * @returns the studies in the page, the status counts, and the next page token
 */
export async function fetchClinicalTrialsStudies(options?: {
  pageSize?: number;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<ClinicalTrialStudyPage> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const url = buildClinicalTrialsStudiesUrl(
    options?.pageSize === undefined ? {} : { pageSize: options.pageSize }
  );
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new UsSourceApiError(
      CLINICALTRIALS_STUDIES_SOURCE_ID,
      `HTTP ${response.status} reading the studies`
    );
  }
  return parseClinicalTrialsStudiesPayload(await response.json());
}

/** ClinicalTrials.gov registered studies, one row per study, keyless. */
export const clinicalTrialsStudiesAdapter: UsDataAdapter<ClinicalTrialStudyPage> = {
  id: CLINICALTRIALS_STUDIES_SOURCE_ID,
  name: 'ClinicalTrials.gov studies',
  auth: 'none',
  description:
    'Registered clinical studies from ClinicalTrials.gov, one row per study, with the status, phase, lead sponsor, and enrollment.',
  fetchLive: async (options) =>
    fetchClinicalTrialsStudies(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => parseClinicalTrialsStudiesPayload(payload),
  loadFixture: () =>
    parseClinicalTrialsStudiesPayload(readFixtureJson(CLINICALTRIALS_STUDIES_FIXTURE_FILENAME)),
};
