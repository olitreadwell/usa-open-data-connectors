import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildSecEdgarSubmissionsUrl,
  fetchSecEdgarFilings,
  parseSecEdgarFilingsPayload,
  secEdgarFilingsAdapter,
  SEC_EDGAR_APPLE_CIK,
  SEC_EDGAR_SUBMISSIONS_API_BASE,
  SEC_EDGAR_USER_AGENT,
} from './secEdgarFilings.js';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText('sec-edgar-filings-2026-10-05.json');

/** A tiny response with the same parallel-array shape as the real one. */
const SMALL_PAYLOAD = JSON.stringify({
  cik: '0000320193',
  name: 'Apple Inc.',
  entityType: 'operating',
  sic: '3571',
  sicDescription: 'Electronic Computers',
  tickers: ['AAPL'],
  exchanges: ['Nasdaq'],
  fiscalYearEnd: '0926',
  filings: {
    recent: {
      accessionNumber: ['0001-26-000001', '0001-26-000002', '0001-26-000003'],
      filingDate: ['2026-10-02', '2026-09-30', '2026-09-29'],
      reportDate: ['', '2026-06-30', ''],
      form: ['4', '10-Q', '4'],
      size: [5000, 9000, 4500],
      isXBRL: [0, 1, 0],
      isInlineXBRL: [0, 1, 0],
      primaryDocument: ['doc1.xml', 'doc2.htm', 'doc3.xml'],
      primaryDocDescription: ['', 'Quarterly report', ''],
    },
  },
});

describe('buildSecEdgarSubmissionsUrl', () => {
  it('builds the padded submissions URL for the default issuer', () => {
    expect(buildSecEdgarSubmissionsUrl()).toBe(
      `${SEC_EDGAR_SUBMISSIONS_API_BASE}/CIK${SEC_EDGAR_APPLE_CIK}.json`
    );
  });

  it('pads a short Central Index Key to ten digits', () => {
    expect(buildSecEdgarSubmissionsUrl('320193')).toBe(
      `${SEC_EDGAR_SUBMISSIONS_API_BASE}/CIK0000320193.json`
    );
  });

  it('stops on a Central Index Key that is not digits', () => {
    expect(() => buildSecEdgarSubmissionsUrl('AAPL')).toThrow(UsSourceParseError);
  });
});

describe('parseSecEdgarFilingsPayload', () => {
  it('zips the parallel columns into one row per filing', () => {
    const filings = parseSecEdgarFilingsPayload(JSON.parse(SMALL_PAYLOAD));
    expect(filings.filingCount).toBe(3);
    expect(filings.filings[0]).toEqual({
      accessionNumber: '0001-26-000001',
      filingDate: '2026-10-02',
      reportDate: null,
      form: '4',
      primaryDocument: 'doc1.xml',
      primaryDocDescription: null,
      sizeBytes: 5000,
      isXbrl: false,
      isInlineXbrl: false,
    });
    expect(filings.filings[1]?.reportDate).toBe('2026-06-30');
    expect(filings.filings[1]?.isXbrl).toBe(true);
  });

  it('reads the issuer profile and the form counts', () => {
    const filings = parseSecEdgarFilingsPayload(JSON.parse(SMALL_PAYLOAD));
    expect(filings.name).toBe('Apple Inc.');
    expect(filings.tickers).toEqual(['AAPL']);
    expect(filings.newestFilingDate).toBe('2026-10-02');
    expect(filings.formCounts).toEqual([
      { form: '4', count: 2 },
      { form: '10-Q', count: 1 },
    ]);
  });

  it('stops when the columns do not line up', () => {
    const payload = JSON.parse(SMALL_PAYLOAD) as { filings: { recent: Record<string, unknown> } };
    payload.filings.recent.form = ['4'];
    expect(() => parseSecEdgarFilingsPayload(payload)).toThrow(UsSourceParseError);
  });

  it('stops on a payload that is not the expected shape', () => {
    expect(() => parseSecEdgarFilingsPayload({ filings: {} })).toThrow(UsSourceParseError);
    expect(() => parseSecEdgarFilingsPayload({ cik: 'x' })).toThrow(UsSourceParseError);
  });

  it('stops on an unreadable filing date', () => {
    const payload = JSON.parse(SMALL_PAYLOAD) as { filings: { recent: Record<string, unknown> } };
    payload.filings.recent.filingDate = ['02/10/2026', '2026-09-30', '2026-09-29'];
    expect(() => parseSecEdgarFilingsPayload(payload)).toThrow(UsSourceParseError);
  });
});

describe('fetchSecEdgarFilings', () => {
  it('sends the descriptive User-Agent header and parses the answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const filings = await fetchSecEdgarFilings({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      `${SEC_EDGAR_SUBMISSIONS_API_BASE}/CIK0000320193.json`
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toEqual({
      headers: { 'User-Agent': SEC_EDGAR_USER_AGENT },
    });
    expect(filings.filingCount).toBe(3);
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 403 }));
    await expect(fetchSecEdgarFilings({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('secEdgarFilingsAdapter', () => {
  it('registers as a keyless source', () => {
    expect(secEdgarFilingsAdapter.id).toBe('sec-edgar-filings');
    expect(secEdgarFilingsAdapter.auth).toBe('none');
    expect(secEdgarFilingsAdapter.description).toContain('SEC EDGAR');
  });

  it('parses a payload through the adapter surface', () => {
    expect(secEdgarFilingsAdapter.parse(JSON.parse(SMALL_PAYLOAD)).filingCount).toBe(3);
  });

  it('reads the committed fixture', () => {
    expect(secEdgarFilingsAdapter.loadFixture().filingCount).toBe(1001);
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const filings = await secEdgarFilingsAdapter.fetchLive({ fetchImpl });
    expect(filings.newestFilingDate).toBe('2026-10-02');
  });
});

// The issuer the committed fixture covers is pinned here, so a refreshed
// snapshot that moves it fails the suite rather than quietly changing the copy.
describe('the committed SEC fixture', () => {
  const filings = secEdgarFilingsAdapter.loadFixture();

  it("holds the issuer's recent filing history", () => {
    expect(filings.cik).toBe('0000320193');
    expect(filings.name).toBe('Apple Inc.');
    expect(filings.tickers).toEqual(['AAPL']);
    expect(filings.newestFilingDate).toBe('2026-10-02');
    expect(filings.filings[0]?.accessionNumber).toBe('0001958244-26-000636');
  });

  it('counts forms, with Form 4 the most common', () => {
    expect(filings.formCounts[0]).toEqual({ form: '4', count: 594 });
  });

  it('carries a readable date for every filing it holds', () => {
    for (const filing of filings.filings) {
      expect(filing.filingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('matches the raw fixture the registry test answers with', () => {
    const fromText = parseSecEdgarFilingsPayload(JSON.parse(FIXTURE));
    expect(fromText.filingCount).toBe(1001);
  });
});
