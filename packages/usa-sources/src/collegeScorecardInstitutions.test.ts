import { strToU8, zipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  COLLEGE_SCORECARD_INSTITUTION_ARCHIVE_URL,
  COLLEGE_SCORECARD_INSTITUTION_SOURCE_ID,
  collegeScorecardInstitutionsAdapter,
  fetchCollegeScorecardInstitutions,
  parseCollegeScorecardArchive,
  parseCollegeScorecardCsv,
} from './collegeScorecardInstitutions.js';

const HEADER = [
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
].join(',');

const SAMPLE_CSV = [
  HEADER,
  '1,001,"Alpha College","Austin, TX",TX,https://alpha.example,1,1000,0.5,10000,20000,15000,0.6,0.7,50000',
  '2,002,Beta University,Dallas,TX,https://beta.example,2,2000,0.4,30000,30000,20000,0.8,0.9,60000',
  '3,003,Gamma Institute,Los Angeles,CA,https://gamma.example,3,3000,NA,NA,NA,25000,NA,NA,70000',
  '4,004,Delta School,San Diego,CA,,2,400,NA,NA,NA,NA,NA,NA,80000',
].join('\n');

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

describe('parseCollegeScorecardCsv', () => {
  it('reads the institution fields and folds the state summaries', () => {
    const snapshot = parseCollegeScorecardCsv(SAMPLE_CSV);

    expect(snapshot.institutionCount).toBe(4);
    expect(snapshot.stateCount).toBe(2);
    expect(snapshot.institutions[0]).toEqual({
      unitId: 1,
      opeId: '001',
      name: 'Alpha College',
      city: 'Austin, TX',
      stateAbbr: 'TX',
      institutionUrl: 'https://alpha.example',
      control: 'public',
      undergraduateEnrollment: 1000,
      admissionRate: 0.5,
      inStateTuition: 10000,
      outStateTuition: 20000,
      medianDebt: 15000,
      completionRate: 0.6,
      retentionRate: 0.7,
      medianEarnings10Years: 50000,
    });
    expect(snapshot.institutions[2]).toMatchObject({
      control: 'private-for-profit',
      admissionRate: null,
      inStateTuition: null,
      medianDebt: 25000,
      completionRate: null,
      medianEarnings10Years: 70000,
      institutionUrl: 'https://gamma.example',
    });
    expect(snapshot.stateSummaries).toEqual([
      {
        stateAbbr: 'CA',
        institutionCount: 2,
        earningsReportedCount: 2,
        medianEarnings10Years: 75000,
        medianDebt: 25000,
        medianCompletionRate: null,
        publicInstitutionCount: 0,
        privateNonprofitInstitutionCount: 1,
        privateForProfitInstitutionCount: 1,
      },
      {
        stateAbbr: 'TX',
        institutionCount: 2,
        earningsReportedCount: 2,
        medianEarnings10Years: 55000,
        medianDebt: 17500,
        medianCompletionRate: 0.7,
        publicInstitutionCount: 1,
        privateNonprofitInstitutionCount: 1,
        privateForProfitInstitutionCount: 0,
      },
    ]);
    expect(snapshot.nationalMedianEarnings10Years).toBe(65000);
    expect(snapshot.highestEarningState?.stateAbbr).toBe('CA');
    expect(snapshot.lowestEarningState?.stateAbbr).toBe('TX');
    expect(snapshot.highestEarningInstitution?.unitId).toBe(4);
  });

  it('stops when a required column is missing', () => {
    const csv = 'UNITID,INSTNM,STABBR\n1,Alpha College,TX';
    expect(() => parseCollegeScorecardCsv(csv)).toThrow(UsSourceParseError);
  });

  it('stops when a data row has the wrong number of fields', () => {
    const csv = `${HEADER}\n1,001,Alpha College`;
    expect(() => parseCollegeScorecardCsv(csv)).toThrow(UsSourceParseError);
  });

  it('stops on an empty file', () => {
    expect(() => parseCollegeScorecardCsv('')).toThrow(UsSourceParseError);
  });

  it('reads an unknown control code as unknown', () => {
    const csv = `${HEADER}\n1,001,Alpha College,Austin,TX,,9,1000,NA,NA,NA,NA,NA,NA,NA`;
    expect(parseCollegeScorecardCsv(csv).institutions[0]?.control).toBe('unknown');
  });
});

describe('parseCollegeScorecardArchive', () => {
  it('reads the CSV from a zip archive', () => {
    const archive = zipSync({
      'Most-Recent-Cohorts-Institution.csv': strToU8(SAMPLE_CSV),
    });
    expect(parseCollegeScorecardArchive(archive).institutionCount).toBe(4);
  });

  it('accepts plain CSV text', () => {
    expect(parseCollegeScorecardArchive(SAMPLE_CSV).institutionCount).toBe(4);
  });

  it('stops when an archive has no CSV', () => {
    const archive = zipSync({ 'notes.txt': strToU8('nothing here') });
    expect(() => parseCollegeScorecardArchive(archive)).toThrow(UsSourceParseError);
  });

  it('stops on a payload that is neither text nor bytes', () => {
    expect(() => parseCollegeScorecardArchive({ rows: [] })).toThrow(UsSourceParseError);
  });
});

describe('fetchCollegeScorecardInstitutions', () => {
  it('downloads the archive and parses it', async () => {
    const archive = zipSync({
      'Most-Recent-Cohorts-Institution.csv': strToU8(SAMPLE_CSV),
    });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(archive, { status: 200 }));

    const snapshot = await fetchCollegeScorecardInstitutions({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      COLLEGE_SCORECARD_INSTITUTION_ARCHIVE_URL,
      expect.anything()
    );
    expect(snapshot.institutionCount).toBe(4);
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(fetchCollegeScorecardInstitutions({ fetchImpl })).rejects.toThrow(
      UsSourceApiError
    );
  });
});

describe('collegeScorecardInstitutionsAdapter', () => {
  it('registers as a keyless source', () => {
    expect(collegeScorecardInstitutionsAdapter.id).toBe(COLLEGE_SCORECARD_INSTITUTION_SOURCE_ID);
    expect(collegeScorecardInstitutionsAdapter.auth).toBe('none');
    expect(collegeScorecardInstitutionsAdapter.description).toContain('College Scorecard');
  });

  it('parses a zip through the adapter surface', () => {
    const archive = zipSync({
      'Most-Recent-Cohorts-Institution.csv': strToU8(SAMPLE_CSV),
    });
    expect(collegeScorecardInstitutionsAdapter.parse(archive).institutionCount).toBe(4);
  });

  it('reads the committed sampled fixture', () => {
    const fixture = readFixtureText('college-scorecard-institutions-2026-10-15-sampled.csv');
    const snapshot = collegeScorecardInstitutionsAdapter.loadFixture();
    expect(snapshot.institutionCount).toBe(6);
    expect(snapshot.stateCount).toBe(6);
    expect(snapshot.dataReleaseDate).toBe('2026-10-15');
    expect(fixture.length).toBeGreaterThan(0);
  });
});
