import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  buildNewJerseyOpenDataCatalogueUrl,
  fetchNewJerseyOpenDataCatalogue,
  NEW_JERSEY_OPEN_DATA_API_BASE,
  NEW_JERSEY_OPEN_DATA_CATALOGUE_LIMIT,
  newJerseyOpenDataCatalogueAdapter,
  parseNewJerseyOpenDataCataloguePayload,
} from './newJerseyOpenDataCatalogue.js';

const FIXTURE = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'src/fixtures/new-jersey-open-data-catalogue-2026-11-08.json'),
    'utf8'
  )
) as unknown;

describe('New Jersey catalogue adapter', () => {
  it('builds the live endpoint URL', () => {
    const url = new URL(buildNewJerseyOpenDataCatalogueUrl());
    expect(url.origin + url.pathname).toBe(NEW_JERSEY_OPEN_DATA_API_BASE);
    expect(url.searchParams.get('limit')).toBe(String(NEW_JERSEY_OPEN_DATA_CATALOGUE_LIMIT));
  });

  it('parses the committed live snapshot', () => {
    const catalogue = parseNewJerseyOpenDataCataloguePayload(FIXTURE);
    expect(catalogue.entryCount).toBe(10);
    expect(catalogue.datasetCount).toBe(5);
    expect(catalogue.newestEntry.id).toBe('k7zf-axmq');
    expect(catalogue.categories[0]).toEqual({
      category: 'Government & Finance',
      entryCount: 8,
    });
    expect(catalogue.entries[0]?.attribution).toBe('NJ OIT Open Data Center');
  });

  it('exposes a keyless adapter with the live fixture', () => {
    expect(newJerseyOpenDataCatalogueAdapter.id).toBe('new-jersey-open-data-catalogue');
    expect(newJerseyOpenDataCatalogueAdapter.auth).toBe('none');
    expect(newJerseyOpenDataCatalogueAdapter.loadFixture().entryCount).toBe(10);
  });

  it('fetches through the injected fetch', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(FIXTURE), { status: 200 }));
    expect((await fetchNewJerseyOpenDataCatalogue({ fetchImpl })).newestEntry.id).toBe('k7zf-axmq');
  });
});
