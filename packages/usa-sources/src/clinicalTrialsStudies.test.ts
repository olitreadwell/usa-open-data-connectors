import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildClinicalTrialsStudiesUrl,
  CLINICALTRIALS_STUDIES_API_BASE,
  clinicalTrialsStudiesAdapter,
  fetchClinicalTrialsStudies,
  parseClinicalTrialsStudiesPayload,
} from './clinicalTrialsStudies.js';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText('clinicaltrials-studies-2026-10-05.json');

/** A tiny response with the same nested shape as the real one. */
const SMALL_PAYLOAD = JSON.stringify({
  studies: [
    {
      protocolSection: {
        identificationModule: { nctId: 'NCT07065435', briefTitle: 'A study of one drug' },
        statusModule: {
          overallStatus: 'RECRUITING',
          startDateStruct: { date: '2024-01-01', type: 'ACTUAL' },
          lastUpdatePostDateStruct: { date: '2025-07-15', type: 'ACTUAL' },
        },
        sponsorCollaboratorsModule: { leadSponsor: { name: 'A Hospital', class: 'OTHER' } },
        conditionsModule: { conditions: ['HER2 + Breast Cancer'] },
        designModule: {
          studyType: 'INTERVENTIONAL',
          phases: ['PHASE2'],
          enrollmentInfo: { count: 74, type: 'ESTIMATED' },
        },
      },
    },
    {
      protocolSection: {
        identificationModule: { nctId: 'NCT02194335', briefTitle: 'An older study' },
        statusModule: {
          overallStatus: 'COMPLETED',
          startDateStruct: { date: '2000-10' },
          lastUpdatePostDateStruct: { date: '2014-07-23', type: 'ACTUAL' },
        },
        designModule: {
          studyType: 'OBSERVATIONAL',
          enrollmentInfo: { count: 32, type: 'ACTUAL' },
        },
      },
    },
  ],
  nextPageToken: 'NEXT-TOKEN',
});

describe('buildClinicalTrialsStudiesUrl', () => {
  it('asks the studies API for one page', () => {
    const url = new URL(buildClinicalTrialsStudiesUrl());
    expect(url.origin + url.pathname).toBe(CLINICALTRIALS_STUDIES_API_BASE);
    expect(url.searchParams.get('pageSize')).toBe('10');
  });

  it('takes a page size from the caller', () => {
    expect(
      new URL(buildClinicalTrialsStudiesUrl({ pageSize: 25 })).searchParams.get('pageSize')
    ).toBe('25');
  });
});

describe('parseClinicalTrialsStudiesPayload', () => {
  it('reads the study fields out of the nested protocol', () => {
    const page = parseClinicalTrialsStudiesPayload(JSON.parse(SMALL_PAYLOAD));
    expect(page.studyCount).toBe(2);
    expect(page.studies[0]).toEqual({
      nctId: 'NCT07065435',
      briefTitle: 'A study of one drug',
      overallStatus: 'RECRUITING',
      studyType: 'INTERVENTIONAL',
      phases: ['PHASE2'],
      conditions: ['HER2 + Breast Cancer'],
      leadSponsor: 'A Hospital',
      enrollmentCount: 74,
      enrollmentType: 'ESTIMATED',
      startDate: '2024-01-01',
      lastUpdatePostDate: '2025-07-15',
    });
  });

  it('keeps a month-precision start date and leaves absent blocks null', () => {
    const page = parseClinicalTrialsStudiesPayload(JSON.parse(SMALL_PAYLOAD));
    expect(page.studies[1]?.startDate).toBe('2000-10');
    expect(page.studies[1]?.phases).toEqual([]);
    expect(page.studies[1]?.conditions).toEqual([]);
    expect(page.studies[1]?.leadSponsor).toBeNull();
  });

  it('keeps the next page token', () => {
    expect(parseClinicalTrialsStudiesPayload(JSON.parse(SMALL_PAYLOAD)).nextPageToken).toBe(
      'NEXT-TOKEN'
    );
    expect(
      parseClinicalTrialsStudiesPayload({
        studies: [
          {
            protocolSection: {
              identificationModule: { nctId: 'NCT1', briefTitle: 'One' },
              statusModule: { overallStatus: 'RECRUITING' },
            },
          },
        ],
      }).nextPageToken
    ).toBeNull();
  });

  it('counts recruitment statuses, most studies first', () => {
    const page = parseClinicalTrialsStudiesPayload(JSON.parse(SMALL_PAYLOAD));
    expect(page.statusCounts).toEqual([
      { status: 'COMPLETED', studyCount: 1 },
      { status: 'RECRUITING', studyCount: 1 },
    ]);
  });

  it('stops on a payload that is not the expected shape', () => {
    expect(() => parseClinicalTrialsStudiesPayload({ studies: 'nope' })).toThrow(
      UsSourceParseError
    );
    expect(() => parseClinicalTrialsStudiesPayload({ studies: [] })).toThrow(UsSourceParseError);
  });

  it('stops on a study without a registry id', () => {
    expect(() =>
      parseClinicalTrialsStudiesPayload({
        studies: [{ protocolSection: { identificationModule: { briefTitle: 'No id' } } }],
      })
    ).toThrow(UsSourceParseError);
  });
});

describe('fetchClinicalTrialsStudies', () => {
  it('requests the studies API and folds the answer into a page', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const page = await fetchClinicalTrialsStudies({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(page.studyCount).toBe(2);
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 502 }));
    await expect(fetchClinicalTrialsStudies({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('clinicalTrialsStudiesAdapter', () => {
  it('registers as a keyless source', () => {
    expect(clinicalTrialsStudiesAdapter.id).toBe('clinicaltrials-studies');
    expect(clinicalTrialsStudiesAdapter.auth).toBe('none');
    expect(clinicalTrialsStudiesAdapter.description).toContain('ClinicalTrials.gov');
  });

  it('parses a payload through the adapter surface', () => {
    expect(clinicalTrialsStudiesAdapter.parse(JSON.parse(SMALL_PAYLOAD)).studyCount).toBe(2);
  });

  it('reads the committed fixture', () => {
    expect(clinicalTrialsStudiesAdapter.loadFixture().studyCount).toBe(10);
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const page = await clinicalTrialsStudiesAdapter.fetchLive({ fetchImpl });
    expect(page.studies[0]?.nctId).toBe('NCT07065435');
  });
});

// The page the endpoint answers with is pinned here, so a refreshed snapshot
// that moves it fails the suite rather than quietly changing the copy.
describe('the committed ClinicalTrials fixture', () => {
  const page = clinicalTrialsStudiesAdapter.loadFixture();

  it('holds ten studies and the next page token', () => {
    expect(page.studyCount).toBe(10);
    expect(page.nextPageToken).toBe('ZVNj7o2Elu8o3lpwTcito62tmo6Qe5dvbPSm2fg');
    expect(page.studies[0]?.nctId).toBe('NCT07065435');
  });

  it('counts COMPLETED as the most common status in the page', () => {
    expect(page.statusCounts[0]).toEqual({ status: 'COMPLETED', studyCount: 5 });
  });

  it('keeps a month-precision start date from the older study', () => {
    const older = page.studies.find((study) => study.nctId === 'NCT02194335');
    expect(older?.startDate).toBe('2000-10');
  });

  it('matches the raw fixture the registry test answers with', () => {
    const fromText = parseClinicalTrialsStudiesPayload(JSON.parse(FIXTURE));
    expect(fromText.studyCount).toBe(10);
  });
});
