import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildNcbiPubmedSearchUrl,
  fetchNcbiPubmedSearch,
  NCBI_EUTILS_API_BASE,
  NCBI_PUBMED_DEFAULT_TERM,
  ncbiPubmedSearchAdapter,
  parseNcbiPubmedSearchPayload,
} from './ncbiPubmedSearch.js';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText('ncbi-pubmed-search-2026-10-05.json');

/** A tiny response with the same shape as the real one. */
const SMALL_PAYLOAD = JSON.stringify({
  header: { type: 'esearch', version: '0.3' },
  esearchresult: {
    count: '245942',
    retmax: '2',
    retstart: '0',
    idlist: ['42831281', '42831193'],
    translationset: [
      {
        from: 'asthma',
        to: '"asthma"[MeSH Terms] OR "asthma"[All Fields]',
      },
    ],
    querytranslation: '"asthma"[MeSH Terms] OR "asthma"[All Fields]',
  },
});

describe('buildNcbiPubmedSearchUrl', () => {
  it('asks the PubMed search endpoint for JSON with the default term', () => {
    const url = new URL(buildNcbiPubmedSearchUrl());
    expect(url.origin + url.pathname).toBe(`${NCBI_EUTILS_API_BASE}/esearch.fcgi`);
    expect(url.searchParams.get('db')).toBe('pubmed');
    expect(url.searchParams.get('term')).toBe(NCBI_PUBMED_DEFAULT_TERM);
    expect(url.searchParams.get('retmode')).toBe('json');
    expect(url.searchParams.get('retmax')).toBe('10');
  });

  it('takes a term and id cap from the caller', () => {
    const url = new URL(buildNcbiPubmedSearchUrl({ term: 'influenza', retmax: 25 }));
    expect(url.searchParams.get('term')).toBe('influenza');
    expect(url.searchParams.get('retmax')).toBe('25');
  });
});

describe('parseNcbiPubmedSearchPayload', () => {
  it('reads the count, the ids, and the translation', () => {
    const search = parseNcbiPubmedSearchPayload(JSON.parse(SMALL_PAYLOAD));
    expect(search.totalCount).toBe(245_942);
    expect(search.returnedCount).toBe(2);
    expect(search.pmids).toEqual(['42831281', '42831193']);
    expect(search.translationSet).toEqual([
      { from: 'asthma', to: '"asthma"[MeSH Terms] OR "asthma"[All Fields]' },
    ]);
  });

  it('reports an error key in the body as an API error', () => {
    expect(() =>
      parseNcbiPubmedSearchPayload({
        esearchresult: { error: 'Invalid db name', count: '0' },
      })
    ).toThrow(UsSourceApiError);
  });

  it('stops on a payload that is not the expected shape', () => {
    expect(() => parseNcbiPubmedSearchPayload('nope')).toThrow(UsSourceParseError);
    expect(() => parseNcbiPubmedSearchPayload({ header: {} })).toThrow(UsSourceParseError);
  });

  it('stops on an unreadable count', () => {
    expect(() =>
      parseNcbiPubmedSearchPayload({ esearchresult: { count: 'lots', idlist: [] } })
    ).toThrow(UsSourceParseError);
  });
});

describe('fetchNcbiPubmedSearch', () => {
  it('requests the search endpoint and folds the answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const search = await fetchNcbiPubmedSearch({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(search.returnedCount).toBe(2);
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(fetchNcbiPubmedSearch({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('ncbiPubmedSearchAdapter', () => {
  it('registers as a keyless source', () => {
    expect(ncbiPubmedSearchAdapter.id).toBe('ncbi-pubmed-search');
    expect(ncbiPubmedSearchAdapter.auth).toBe('none');
    expect(ncbiPubmedSearchAdapter.description).toContain('PubMed');
  });

  it('parses a payload through the adapter surface', () => {
    expect(ncbiPubmedSearchAdapter.parse(JSON.parse(SMALL_PAYLOAD)).totalCount).toBe(245_942);
  });

  it('reads the committed fixture', () => {
    expect(ncbiPubmedSearchAdapter.loadFixture().returnedCount).toBe(10);
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    expect((await ncbiPubmedSearchAdapter.fetchLive({ fetchImpl })).pmids[0]).toBe('42831281');
  });
});

// The search the endpoint answers with is pinned here, so a refreshed snapshot
// that moves it fails the suite rather than quietly changing the copy.
describe('the committed PubMed fixture', () => {
  const search = ncbiPubmedSearchAdapter.loadFixture();

  it('holds the asthma search NCBI answered on 2026-10-05', () => {
    expect(search.totalCount).toBe(245_942);
    expect(search.returnedCount).toBe(10);
    expect(search.pmids[0]).toBe('42831281');
  });

  it('carries the MeSH expansion NCBI applied to the term', () => {
    expect(search.queryTranslation).toContain('"asthma"[MeSH Terms]');
    expect(search.translationSet[0]?.from).toBe('asthma');
  });

  it('matches the raw fixture the registry test answers with', () => {
    const fromText = parseNcbiPubmedSearchPayload(JSON.parse(FIXTURE));
    expect(fromText.totalCount).toBe(245_942);
  });
});
