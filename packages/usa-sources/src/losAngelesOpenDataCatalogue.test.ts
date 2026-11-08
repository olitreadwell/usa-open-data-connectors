import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  buildLosAngelesOpenDataCatalogueUrl,
  fetchLosAngelesOpenDataCatalogue,
  LOS_ANGELES_OPEN_DATA_API_BASE,
  LOS_ANGELES_OPEN_DATA_CATALOGUE_LIMIT,
  losAngelesOpenDataCatalogueAdapter,
  parseLosAngelesOpenDataCataloguePayload,
} from './losAngelesOpenDataCatalogue.js';

const FIXTURE = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'src/fixtures/los-angeles-open-data-catalogue-2026-11-08.json'),
    'utf8'
  )
) as unknown;

describe('Los Angeles catalogue adapter', () => {
  it('builds the live endpoint URL', () => {
    const url = new URL(buildLosAngelesOpenDataCatalogueUrl());
    expect(url.origin + url.pathname).toBe(LOS_ANGELES_OPEN_DATA_API_BASE);
    expect(url.searchParams.get('limit')).toBe(String(LOS_ANGELES_OPEN_DATA_CATALOGUE_LIMIT));
  });

  it('parses the committed live snapshot', () => {
    const catalogue = parseLosAngelesOpenDataCataloguePayload(FIXTURE);
    expect(catalogue.entryCount).toBe(10);
    expect(catalogue.datasetCount).toBe(6);
    expect(catalogue.newestEntry.id).toBe('dqq4-799r');
    expect(catalogue.categories[0]).toEqual({
      category: 'Community & Economic Development',
      entryCount: 3,
    });
  });

  it('exposes a keyless adapter with the live fixture', () => {
    expect(losAngelesOpenDataCatalogueAdapter.id).toBe('los-angeles-open-data-catalogue');
    expect(losAngelesOpenDataCatalogueAdapter.auth).toBe('none');
    expect(losAngelesOpenDataCatalogueAdapter.loadFixture().entryCount).toBe(10);
  });

  it('fetches through the injected fetch', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(FIXTURE), { status: 200 }));
    expect((await fetchLosAngelesOpenDataCatalogue({ fetchImpl })).newestEntry.id).toBe(
      'dqq4-799r'
    );
  });
});
