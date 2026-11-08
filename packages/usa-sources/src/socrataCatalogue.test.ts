import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildSocrataCatalogueUrl,
  createSocrataCatalogueAdapter,
  fetchSocrataCatalogue,
  parseSocrataCataloguePayload,
} from './socrataCatalogue.js';

const SMALL_PAYLOAD = [
  {
    id: 'aaaa-1111',
    name: 'One dataset',
    assetType: 'dataset',
    category: 'Administration & Finance',
    viewType: 'tabular',
    createdAt: 100,
    viewLastModified: 200,
    viewCount: 5,
    downloadCount: 1,
    metadata: {
      custom_fields: {
        'Common Core': {
          License: 'http://www.usa.gov/publicdomain/label/1.0/',
          Publisher: 'State of Example',
        },
      },
    },
  },
  {
    id: 'bbbb-2222',
    name: 'One story',
    assetType: 'story',
    category: null,
    viewType: 'story',
    createdAt: 300,
    viewLastModified: 300,
    viewCount: 2,
    downloadCount: 0,
  },
];

describe('buildSocrataCatalogueUrl', () => {
  it('asks the catalogue for a short page', () => {
    const url = new URL(buildSocrataCatalogueUrl('https://example.gov/api/views.json'));
    expect(url.origin + url.pathname).toBe('https://example.gov/api/views.json');
    expect(url.searchParams.get('limit')).toBe('10');
  });

  it('takes an entry cap from the caller', () => {
    expect(
      new URL(
        buildSocrataCatalogueUrl('https://example.gov/api/views.json', { limit: 25 })
      ).searchParams.get('limit')
    ).toBe('25');
  });
});

describe('parseSocrataCataloguePayload', () => {
  it('reads the entry fields out of each row', () => {
    const catalogue = parseSocrataCataloguePayload('example-catalogue', SMALL_PAYLOAD);
    expect(catalogue.entryCount).toBe(2);
    expect(catalogue.entries[0]).toEqual({
      id: 'aaaa-1111',
      name: 'One dataset',
      assetType: 'dataset',
      category: 'Administration & Finance',
      viewType: 'tabular',
      createdAtEpochSeconds: 100,
      viewLastModifiedEpochSeconds: 200,
      viewCount: 5,
      downloadCount: 1,
      licenceUrl: 'http://www.usa.gov/publicdomain/label/1.0/',
      attribution: 'State of Example',
    });
  });

  it('counts datasets and names the newest entry', () => {
    const catalogue = parseSocrataCataloguePayload('example-catalogue', SMALL_PAYLOAD);
    expect(catalogue.datasetCount).toBe(1);
    expect(catalogue.newestEntry.id).toBe('bbbb-2222');
  });

  it('counts a missing category under Uncategorised', () => {
    const catalogue = parseSocrataCataloguePayload('example-catalogue', SMALL_PAYLOAD);
    expect(catalogue.categories).toEqual([
      { category: 'Administration & Finance', entryCount: 1 },
      { category: 'Uncategorised', entryCount: 1 },
    ]);
  });

  it('takes the source id and uncategorised label from the caller', () => {
    expect(() =>
      parseSocrataCataloguePayload('example-catalogue', 'nope', {
        uncategorisedLabel: 'No topic',
      })
    ).toThrow(UsSourceParseError);

    const catalogue = parseSocrataCataloguePayload(
      'example-catalogue',
      [{ ...SMALL_PAYLOAD[1], category: null }],
      { uncategorisedLabel: 'No topic' }
    );
    expect(catalogue.categories).toEqual([{ category: 'No topic', entryCount: 1 }]);
  });

  it('stops on a payload that is not the expected shape', () => {
    expect(() => parseSocrataCataloguePayload('example-catalogue', 'nope')).toThrow(
      UsSourceParseError
    );
    expect(() => parseSocrataCataloguePayload('example-catalogue', [])).toThrow(UsSourceParseError);
  });

  it('stops on an entry without an id or creation time', () => {
    expect(() => parseSocrataCataloguePayload('example-catalogue', [{ name: 'No id' }])).toThrow(
      UsSourceParseError
    );
  });
});

describe('fetchSocrataCatalogue', () => {
  it('requests the catalogue and folds the answer', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(SMALL_PAYLOAD), { status: 200 }));
    const catalogue = await fetchSocrataCatalogue(
      {
        sourceId: 'example-catalogue',
        apiBase: 'https://example.gov/api/views.json',
      },
      { fetchImpl }
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(catalogue.entryCount).toBe(2);
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(
      fetchSocrataCatalogue(
        {
          sourceId: 'example-catalogue',
          apiBase: 'https://example.gov/api/views.json',
        },
        { fetchImpl }
      )
    ).rejects.toThrow(UsSourceApiError);
  });
});

describe('createSocrataCatalogueAdapter', () => {
  it('builds an adapter whose parse surface uses the shared parser', () => {
    const adapter = createSocrataCatalogueAdapter({
      sourceId: 'example-catalogue',
      name: 'Example catalogue',
      description: 'An example Socrata catalogue.',
      apiBase: 'https://example.gov/api/views.json',
      fixtureFilename: 'example.json',
    });
    expect(adapter.id).toBe('example-catalogue');
    expect(adapter.auth).toBe('none');
    expect(adapter.parse(SMALL_PAYLOAD).entryCount).toBe(2);
  });
});
