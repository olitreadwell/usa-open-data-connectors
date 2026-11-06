import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildNihReporterSearchBody,
  fetchNihReporterProjects,
  NIH_REPORTER_DEFAULT_FISCAL_YEAR,
  NIH_REPORTER_PAGE_SIZE,
  NIH_REPORTER_SEARCH_URL,
  nihReporterProjectsAdapter,
  parseNihReporterProjectsPayload,
} from './nihReporterProjects.js';

const FIXTURE_NAME = 'nih-reporter-projects-fy2025-2026-11-07.json';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText(FIXTURE_NAME);

/** A small response with the same shape as the live search response. */
const SMALL_PAYLOAD = {
  meta: { total: 73_213, offset: 0, limit: 2 },
  results: [
    {
      fiscal_year: 2025,
      project_num: '5R01AI000001-01',
      core_project_num: 'R01AI000001',
      project_title: 'A study of immune response',
      award_amount: 1_000,
      organization: {
        org_name: 'A UNIVERSITY',
        org_city: 'Boston',
        org_state: 'MA',
      },
      principal_investigators: [{ full_name: 'Jane   Doe ' }, { full_name: 'John  Smith' }],
      agency_ic_admin: {
        abbreviation: 'NIAID',
        name: 'National Institute of Allergy and Infectious Diseases',
      },
      project_start_date: '2024-01-01T00:00:00',
      project_end_date: '2027-12-31T00:00:00',
      project_detail_url: 'https://reporter.nih.gov/project-details/1',
    },
    {
      fiscal_year: 2025,
      project_num: '1ZIFBC000001-19',
      project_title: 'An intramural allocation',
      award_amount: null,
      organization: { org_name: 'NIH', org_city: null, org_state: null },
      principal_investigators: null,
    },
  ],
};

describe('buildNihReporterSearchBody', () => {
  it('asks for NIH projects in the default fiscal year, largest award first', () => {
    const body = buildNihReporterSearchBody();

    expect(body.criteria.fiscal_years).toEqual([NIH_REPORTER_DEFAULT_FISCAL_YEAR]);
    expect(body.criteria.agencies).toEqual(['NIH']);
    expect(body.include_fields).toContain('ProjectTitle');
    expect(body.include_fields).toContain('Organization');
    expect(body.include_fields).toContain('PrincipalInvestigators');
    expect(body.offset).toBe(0);
    expect(body.limit).toBe(NIH_REPORTER_PAGE_SIZE);
    expect(body.sort_field).toBe('award_amount');
    expect(body.sort_order).toBe('desc');
  });

  it('takes the fiscal year, page size, and offset from the caller', () => {
    const body = buildNihReporterSearchBody({ fiscalYear: 2024, limit: 25, offset: 50 });

    expect(body.criteria.fiscal_years).toEqual([2024]);
    expect(body.limit).toBe(25);
    expect(body.offset).toBe(50);
  });
});

describe('parseNihReporterProjectsPayload', () => {
  it('reads a page of projects into the fields a story uses', () => {
    const page = parseNihReporterProjectsPayload(SMALL_PAYLOAD);

    expect(page.projectCount).toBe(2);
    expect(page.totalCount).toBe(73_213);
    expect(page.offset).toBe(0);
    expect(page.limit).toBe(2);
    expect(page.pageAwardAmountUsd).toBe(1_000);
    expect(page.projects[0]).toEqual({
      projectNumber: '5R01AI000001-01',
      coreProjectNumber: 'R01AI000001',
      projectTitle: 'A study of immune response',
      fiscalYear: 2025,
      awardAmount: 1_000,
      organizationName: 'A UNIVERSITY',
      organizationCity: 'Boston',
      organizationState: 'MA',
      principalInvestigators: ['Jane Doe', 'John Smith'],
      administeringInstitute: 'NIAID',
      projectStartDate: '2024-01-01',
      projectEndDate: '2027-12-31',
      projectDetailUrl: 'https://reporter.nih.gov/project-details/1',
    });
  });

  it('leaves absent optional fields null and an absent award out of the total', () => {
    const project = parseNihReporterProjectsPayload(SMALL_PAYLOAD).projects[1];

    expect(project?.coreProjectNumber).toBeNull();
    expect(project?.awardAmount).toBeNull();
    expect(project?.organizationCity).toBeNull();
    expect(project?.organizationState).toBeNull();
    expect(project?.principalInvestigators).toEqual([]);
    expect(project?.administeringInstitute).toBeNull();
    expect(project?.projectStartDate).toBeNull();
    expect(project?.projectEndDate).toBeNull();
    expect(project?.projectDetailUrl).toBeNull();
  });

  it('accepts an empty result page', () => {
    const page = parseNihReporterProjectsPayload({
      meta: { total: 0, offset: 0, limit: 10 },
      results: [],
    });

    expect(page.projectCount).toBe(0);
    expect(page.totalCount).toBe(0);
    expect(page.pageAwardAmountUsd).toBe(0);
  });

  it('reports an API message in the body as an API error', () => {
    expect(() => parseNihReporterProjectsPayload({ message: 'Invalid criteria' })).toThrow(
      UsSourceApiError
    );
  });

  it('stops on a payload that is not the expected shape', () => {
    expect(() => parseNihReporterProjectsPayload('nope')).toThrow(UsSourceParseError);
    expect(() => parseNihReporterProjectsPayload({ results: [] })).toThrow(UsSourceParseError);
  });

  it('stops on a project without its number, title, or fiscal year', () => {
    expect(() =>
      parseNihReporterProjectsPayload({
        meta: { total: 1, offset: 0, limit: 10 },
        results: [{ fiscal_year: 2025, project_title: 'No number', organization: {} }],
      })
    ).toThrow(UsSourceParseError);
  });

  it('stops on a date it cannot read', () => {
    expect(() =>
      parseNihReporterProjectsPayload({
        meta: { total: 1, offset: 0, limit: 10 },
        results: [
          {
            fiscal_year: 2025,
            project_num: '1R01AI000001-01',
            project_title: 'A study',
            organization: { org_name: 'A UNIVERSITY' },
            project_start_date: 'sometime in 2024',
          },
        ],
      })
    ).toThrow(UsSourceParseError);
  });
});

describe('fetchNihReporterProjects', () => {
  it('posts the search body and folds the answer', async () => {
    let calls = 0;
    let requestedUrl = '';
    let requestInit: RequestInit | undefined;
    const fetchImpl: typeof globalThis.fetch = async (input, init) => {
      calls += 1;
      requestedUrl = input instanceof Request ? input.url : String(input);
      requestInit = init;
      return new Response(JSON.stringify(SMALL_PAYLOAD));
    };

    const page = await fetchNihReporterProjects({
      fiscalYear: 2024,
      limit: 2,
      fetchImpl,
    });

    expect(calls).toBe(1);
    expect(requestedUrl).toBe(NIH_REPORTER_SEARCH_URL);
    expect(requestInit?.method).toBe('POST');
    expect((requestInit?.headers as Record<string, string>)['content-type']).toBe(
      'application/json'
    );
    const body = requestInit?.body;
    if (typeof body !== 'string') {
      throw new Error(`Expected a string body, got ${typeof body}`);
    }
    expect(JSON.parse(body).criteria.fiscal_years).toEqual([2024]);
    expect(page.projectCount).toBe(2);
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = (async () =>
      new Response('nope', { status: 500 })) as unknown as typeof globalThis.fetch;

    await expect(fetchNihReporterProjects({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('nihReporterProjectsAdapter', () => {
  it('registers as a keyless source', () => {
    expect(nihReporterProjectsAdapter.id).toBe('nih-reporter-projects');
    expect(nihReporterProjectsAdapter.auth).toBe('none');
    expect(nihReporterProjectsAdapter.description).toContain('NIH RePORTER');
  });

  it('parses a payload through the adapter surface', () => {
    expect(nihReporterProjectsAdapter.parse(SMALL_PAYLOAD).projectCount).toBe(2);
  });

  it('reads the committed fixture', () => {
    expect(nihReporterProjectsAdapter.loadFixture().projectCount).toBe(10);
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(SMALL_PAYLOAD)));

    const page = await nihReporterProjectsAdapter.fetchLive({
      fetchImpl: fetchImpl as unknown as typeof globalThis.fetch,
    });

    expect(page.projects[0]?.projectNumber).toBe('5R01AI000001-01');
  });
});

// The page the endpoint answers with is pinned here, so a refreshed snapshot
// that moves it fails the suite rather than quietly changing the copy.
describe('the committed NIH RePORTER fixture', () => {
  const page = nihReporterProjectsAdapter.loadFixture();

  it('holds ten fiscal 2025 projects and the agency total', () => {
    expect(page.projectCount).toBe(10);
    expect(page.totalCount).toBe(73_213);
    expect(page.projects[0]?.projectNumber).toBe('1ZIHLM200888-17');
  });

  it('sums the awards on the page', () => {
    expect(page.pageAwardAmountUsd).toBe(1_052_227_291);
  });

  it('normalises investigator spacing and keeps an absent state null', () => {
    expect(page.projects[0]?.principalInvestigators).toEqual(['Dina Paltoo']);
    expect(page.projects[0]?.organizationState).toBeNull();
  });

  it('matches the raw fixture the registry test answers with', () => {
    const fromText = parseNihReporterProjectsPayload(JSON.parse(FIXTURE));
    expect(fromText.projectCount).toBe(10);
  });
});
