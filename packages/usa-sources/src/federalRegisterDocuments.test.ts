import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildFederalRegisterDocumentsUrl,
  FEDERAL_REGISTER_API_BASE,
  FEDERAL_REGISTER_DEFAULT_PAGE_SIZE,
  federalRegisterDocumentsAdapter,
  fetchFederalRegisterDocuments,
  parseFederalRegisterDocumentsPayload,
} from './federalRegisterDocuments.js';

const FIXTURE_NAME = 'federal-register-documents-2026-11-08.json';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText(FIXTURE_NAME);

/** A tiny response with the same envelope as the real one. */
const SMALL_PAYLOAD = JSON.stringify({
  description: 'All Documents',
  count: 10_000,
  total_pages: 50,
  next_page_url: 'https://www.federalregister.gov/api/v1/documents?page=2',
  results: [
    {
      title: 'A final rule',
      type: 'Rule',
      abstract: 'The agency adopts a rule.',
      document_number: '2026-10001',
      html_url: 'https://www.federalregister.gov/documents/2026/11/06/2026-10001/a-final-rule',
      pdf_url: 'https://www.govinfo.gov/content/pkg/FR-2026-11-06/pdf/2026-10001.pdf',
      publication_date: '2026-11-06',
      agencies: [{ name: 'Example Department' }, { name: 'Example Agency' }],
    },
    {
      title: 'A notice',
      type: 'Notice',
      abstract: null,
      document_number: '2026-10002',
      html_url: 'https://www.federalregister.gov/documents/2026/11/06/2026-10002/a-notice',
      pdf_url: 'https://www.govinfo.gov/content/pkg/FR-2026-11-06/pdf/2026-10002.pdf',
      publication_date: '2026-11-06',
      agencies: [],
    },
  ],
});

describe('buildFederalRegisterDocumentsUrl', () => {
  it('asks for the newest documents with the default page size', () => {
    const url = new URL(buildFederalRegisterDocumentsUrl());
    expect(url.origin + url.pathname).toBe(FEDERAL_REGISTER_API_BASE);
    expect(url.searchParams.get('per_page')).toBe(String(FEDERAL_REGISTER_DEFAULT_PAGE_SIZE));
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('order')).toBe('newest');
  });

  it('takes a page size, page, and order from the caller', () => {
    const url = new URL(
      buildFederalRegisterDocumentsUrl({ perPage: 25, page: 3, order: 'oldest' })
    );
    expect(url.searchParams.get('per_page')).toBe('25');
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('order')).toBe('oldest');
  });
});

describe('parseFederalRegisterDocumentsPayload', () => {
  it('reads the document fields and the page counts', () => {
    const page = parseFederalRegisterDocumentsPayload(JSON.parse(SMALL_PAYLOAD));

    expect(page.documentCount).toBe(2);
    expect(page.reportedCount).toBe(10_000);
    expect(page.totalPages).toBe(50);
    expect(page.nextPageUrl).toBe('https://www.federalregister.gov/api/v1/documents?page=2');
    expect(page.documents[0]).toEqual({
      documentNumber: '2026-10001',
      title: 'A final rule',
      type: 'Rule',
      publicationDate: '2026-11-06',
      abstract: 'The agency adopts a rule.',
      agencies: ['Example Department', 'Example Agency'],
      htmlUrl: 'https://www.federalregister.gov/documents/2026/11/06/2026-10001/a-final-rule',
      pdfUrl: 'https://www.govinfo.gov/content/pkg/FR-2026-11-06/pdf/2026-10001.pdf',
    });
  });

  it('keeps a missing abstract null and accepts a document with no agency', () => {
    const page = parseFederalRegisterDocumentsPayload(JSON.parse(SMALL_PAYLOAD));
    expect(page.documents[1]?.abstract).toBeNull();
    expect(page.documents[1]?.agencies).toEqual([]);
  });

  it('accepts an empty result page', () => {
    const page = parseFederalRegisterDocumentsPayload({
      count: 0,
      total_pages: 0,
      next_page_url: null,
      results: [],
    });
    expect(page.documentCount).toBe(0);
    expect(page.reportedCount).toBe(0);
    expect(page.nextPageUrl).toBeNull();
  });

  it('stops on a payload that is not the expected shape', () => {
    expect(() => parseFederalRegisterDocumentsPayload('nope')).toThrow(UsSourceParseError);
    expect(() => parseFederalRegisterDocumentsPayload({})).toThrow(UsSourceParseError);
    expect(() => parseFederalRegisterDocumentsPayload({ results: [] })).toThrow(UsSourceParseError);
  });

  it('stops on a document without a number, title, or publication date', () => {
    expect(() =>
      parseFederalRegisterDocumentsPayload({
        count: 1,
        total_pages: 1,
        results: [{ title: 'No number' }],
      })
    ).toThrow(UsSourceParseError);
  });

  it('stops on a publication date that is not YYYY-MM-DD', () => {
    expect(() =>
      parseFederalRegisterDocumentsPayload({
        count: 1,
        total_pages: 1,
        results: [
          {
            document_number: '2026-10001',
            title: 'A rule',
            publication_date: '06/11/2026',
          },
        ],
      })
    ).toThrow(UsSourceParseError);
  });
});

describe('fetchFederalRegisterDocuments', () => {
  it('requests the newest page and folds the answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const page = await fetchFederalRegisterDocuments({ perPage: 2, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetchImpl.mock.calls[0]?.[0])).searchParams.get('per_page')).toBe('2');
    expect(page.documentCount).toBe(2);
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(fetchFederalRegisterDocuments({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('federalRegisterDocumentsAdapter', () => {
  it('registers as a keyless source', () => {
    expect(federalRegisterDocumentsAdapter.id).toBe('federal-register-documents');
    expect(federalRegisterDocumentsAdapter.auth).toBe('none');
    expect(federalRegisterDocumentsAdapter.description).toContain('Federal Register');
  });

  it('parses a payload through the adapter surface', () => {
    expect(federalRegisterDocumentsAdapter.parse(JSON.parse(SMALL_PAYLOAD)).documentCount).toBe(2);
  });

  it('reads the committed fixture', () => {
    expect(federalRegisterDocumentsAdapter.loadFixture().documentCount).toBe(10);
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    expect(
      (await federalRegisterDocumentsAdapter.fetchLive({ fetchImpl })).documents[0]?.documentNumber
    ).toBe('2026-10001');
  });
});

// The page the endpoint answers with is pinned here, so a refreshed snapshot
// that moves it fails the suite rather than quietly changing the copy.
describe('the committed Federal Register fixture', () => {
  const page = federalRegisterDocumentsAdapter.loadFixture();

  it('holds ten newest documents and the service page counts', () => {
    expect(page.documentCount).toBe(10);
    expect(page.reportedCount).toBe(10_000);
    expect(page.totalPages).toBe(50);
    expect(page.documents[0]?.documentNumber).toBe('2026-22789');
    expect(page.documents[0]?.publicationDate).toBe('2026-11-06');
  });

  it('keeps the agencies and a null abstract from the live page', () => {
    expect(page.documents[0]?.title).toBe('The American Declaration of Freedom in Space');
    expect(page.documents[0]?.agencies).toEqual(['Executive Office of the President']);
    expect(page.documents[0]?.abstract).toBeNull();
  });

  it('matches the raw fixture the registry test answers with', () => {
    const fromText = parseFederalRegisterDocumentsPayload(JSON.parse(FIXTURE));
    expect(fromText.documentCount).toBe(10);
  });
});
