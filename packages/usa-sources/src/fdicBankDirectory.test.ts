import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildFdicBankDirectoryUrl,
  FDIC_BANK_API_BASE,
  FDIC_BANK_FIELDS,
  fdicBankDirectoryAdapter,
  fetchFdicBankDirectory,
  parseFdicBankDirectoryPayload,
} from './fdicBankDirectory.js';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText('fdic-bank-directory-2026-10-05.json');

/** A tiny response with the same envelope as the real one. */
const SMALL_PAYLOAD = JSON.stringify({
  meta: { total: 27_835 },
  totals: { count: 27_835 },
  data: [
    { data: { ID: '10', NAME: 'Northeast Bank of Sanford', CITY: 'Sanford', STALP: 'ME' } },
    { data: { ID: '100', NAME: 'Bank of Bentonville', CITY: 'Bentonville', STALP: 'AR' } },
    { data: { ID: '10002', NAME: 'Progressive Bank', CITY: 'Wheeling', STALP: 'WV' } },
  ],
});

describe('buildFdicBankDirectoryUrl', () => {
  it('asks the FDIC for a short page of the chosen columns', () => {
    const url = new URL(buildFdicBankDirectoryUrl());
    expect(url.origin + url.pathname).toBe(FDIC_BANK_API_BASE);
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('fields')).toBe(FDIC_BANK_FIELDS);
  });

  it('takes a row cap and column list from the caller', () => {
    const url = new URL(buildFdicBankDirectoryUrl({ rowLimit: 25, fields: 'NAME,STALP' }));
    expect(url.searchParams.get('limit')).toBe('25');
    expect(url.searchParams.get('fields')).toBe('NAME,STALP');
  });
});

describe('parseFdicBankDirectoryPayload', () => {
  it('reads the bank fields out of the wrapper', () => {
    const directory = parseFdicBankDirectoryPayload(JSON.parse(SMALL_PAYLOAD));
    expect(directory.bankCount).toBe(3);
    expect(directory.banks[0]).toEqual({
      id: '10',
      name: 'Northeast Bank of Sanford',
      city: 'Sanford',
      stateAbbr: 'ME',
    });
  });

  it('keeps the FDIC total, not just the page size', () => {
    expect(parseFdicBankDirectoryPayload(JSON.parse(SMALL_PAYLOAD)).totalBanks).toBe(27_835);
  });

  it('counts the states in the page, most banks first', () => {
    const directory = parseFdicBankDirectoryPayload(JSON.parse(SMALL_PAYLOAD));
    expect(directory.states).toEqual([
      { stateAbbr: 'AR', bankCount: 1 },
      { stateAbbr: 'ME', bankCount: 1 },
      { stateAbbr: 'WV', bankCount: 1 },
    ]);
  });

  it('reports a rejected request in the body as an API error', () => {
    expect(() => parseFdicBankDirectoryPayload({ data: [], errors: [{ status: 400 }] })).toThrow(
      UsSourceApiError
    );
  });

  it('stops on a payload that is not the expected shape', () => {
    expect(() => parseFdicBankDirectoryPayload({ data: 'nope' })).toThrow(UsSourceParseError);
    expect(() => parseFdicBankDirectoryPayload({ data: [] })).toThrow(UsSourceParseError);
  });

  it('stops on a row without the fields the adapter asked for', () => {
    expect(() =>
      parseFdicBankDirectoryPayload({ data: [{ data: { ID: '10', NAME: 'A Bank' } }] })
    ).toThrow(UsSourceParseError);
  });
});

describe('fetchFdicBankDirectory', () => {
  it('requests the FDIC API and folds the answer into a directory', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const directory = await fetchFdicBankDirectory({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(directory.bankCount).toBe(3);
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(fetchFdicBankDirectory({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('fdicBankDirectoryAdapter', () => {
  it('registers as a keyless source', () => {
    expect(fdicBankDirectoryAdapter.id).toBe('fdic-bank-directory');
    expect(fdicBankDirectoryAdapter.auth).toBe('none');
    expect(fdicBankDirectoryAdapter.description).toContain('FDIC');
  });

  it('parses a payload through the adapter surface', () => {
    expect(fdicBankDirectoryAdapter.parse(JSON.parse(SMALL_PAYLOAD)).bankCount).toBe(3);
  });

  it('reads the committed fixture', () => {
    expect(fdicBankDirectoryAdapter.loadFixture().bankCount).toBe(10);
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const directory = await fdicBankDirectoryAdapter.fetchLive({ fetchImpl });
    expect(directory.banks[0]?.stateAbbr).toBe('ME');
  });
});

// The page the endpoint answers with is pinned here, so a refreshed snapshot
// that moves it fails the suite rather than quietly changing the copy.
describe('the committed FDIC fixture', () => {
  const directory = fdicBankDirectoryAdapter.loadFixture();

  it('holds ten banks and the FDIC total', () => {
    expect(directory.bankCount).toBe(10);
    expect(directory.totalBanks).toBe(27_835);
    expect(directory.banks[0]).toEqual({
      id: '10',
      name: 'Northeast Bank of Sanford',
      city: 'Sanford',
      stateAbbr: 'ME',
    });
  });

  it('counts Wisconsin as the most common state in the page', () => {
    expect(directory.states[0]).toEqual({ stateAbbr: 'WI', bankCount: 6 });
  });

  it('matches the raw fixture the registry test answers with', () => {
    const fromText = parseFdicBankDirectoryPayload(JSON.parse(FIXTURE));
    expect(fromText.bankCount).toBe(10);
  });
});
