import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildFemaDeclarationCatalogue,
  buildFemaDeclarationUrl,
  femaDisasterDeclarationsAdapter,
  fetchFemaDeclarations,
  FEMA_DECLARATION_PATH,
  FEMA_DECLARATION_ROW_LIMIT,
  FEMA_FIRE_INCIDENT_TYPE,
  FEMA_OPEN_DATA_API_BASE,
  parseFemaDeclarationPayload,
} from './femaDisasterDeclarations.js';

/** A tiny response with the same shape as the real one. */
const SMALL_PAYLOAD = {
  metadata: { count: 3 },
  FemaWebDisasterDeclarations: [
    {
      disasterNumber: 1,
      declarationDate: '1953-05-02T00:00:00.000Z',
      declarationType: 'Major Disaster',
      incidentType: 'Tornado',
      stateCode: 'GA',
      stateName: 'Georgia',
    },
    {
      disasterNumber: 2,
      declarationDate: '2002-06-30T00:00:00.000Z',
      declarationType: 'Fire Management',
      incidentType: FEMA_FIRE_INCIDENT_TYPE,
      stateCode: 'CA',
      stateName: 'California',
    },
    {
      disasterNumber: 3,
      declarationDate: '2020-03-13T00:00:00.000Z',
      declarationType: 'Emergency',
      incidentType: 'Biological',
      stateCode: 'CA',
      stateName: 'California',
    },
  ],
};

describe('buildFemaDeclarationUrl', () => {
  it('asks the OpenFEMA API for the whole declaration file', () => {
    const url = buildFemaDeclarationUrl();
    expect(url.startsWith(FEMA_OPEN_DATA_API_BASE)).toBe(true);
    expect(url).toContain(FEMA_DECLARATION_PATH);
    const params = new URL(url).searchParams;
    expect(params.get('$select')).toContain('declarationDate');
    expect(params.get('$select')).toContain('incidentType');
    expect(params.get('$orderby')).toBe('disasterNumber');
    expect(params.get('$inlinecount')).toBe('allpages');
    expect(params.get('$top')).toBe(String(FEMA_DECLARATION_ROW_LIMIT));
  });

  it('takes a row cap from the caller', () => {
    const params = new URL(buildFemaDeclarationUrl({ rowLimit: 50 })).searchParams;
    expect(params.get('$top')).toBe('50');
  });
});

describe('parseFemaDeclarationPayload', () => {
  it('reads the date year and the counted fields from each row', () => {
    const declarations = parseFemaDeclarationPayload(SMALL_PAYLOAD);
    expect(declarations).toHaveLength(3);
    expect(declarations[0]).toEqual({
      disasterNumber: 1,
      declarationDate: '1953-05-02T00:00:00.000Z',
      year: 1953,
      declarationType: 'Major Disaster',
      incidentType: 'Tornado',
      stateCode: 'GA',
      stateName: 'Georgia',
    });
    expect(declarations[2]?.year).toBe(2020);
  });

  it('reports an error in the body as an API error', () => {
    expect(() =>
      parseFemaDeclarationPayload({
        error: [
          {
            name: 'OData Query Parser Error',
            code: 'OF_OQP_003',
            type: '$select criteria error',
            message: 'Criteria includes field "bogus" not found in the data model.',
          },
        ],
      })
    ).toThrow(UsSourceApiError);
  });

  it('falls back to the code when an error carries no message', () => {
    expect(() => parseFemaDeclarationPayload({ error: [{ code: 'OF_OQP_001' }] })).toThrow(
      UsSourceApiError
    );
  });

  it('stops on a payload that is not the expected shape', () => {
    expect(() => parseFemaDeclarationPayload({ FemaWebDisasterDeclarations: 'nope' })).toThrow(
      UsSourceParseError
    );
    expect(() => parseFemaDeclarationPayload({ FemaWebDisasterDeclarations: [] })).toThrow(
      UsSourceParseError
    );
  });

  it('refuses a response that carries fewer rows than the agency counted', () => {
    expect(() =>
      parseFemaDeclarationPayload({
        metadata: { count: 9000 },
        FemaWebDisasterDeclarations: SMALL_PAYLOAD.FemaWebDisasterDeclarations,
      })
    ).toThrow(/holds 9000 declarations/);
  });

  it('stops on a row that is missing a field', () => {
    expect(() =>
      parseFemaDeclarationPayload({
        FemaWebDisasterDeclarations: [
          {
            disasterNumber: 1,
            declarationDate: '1953-05-02T00:00:00.000Z',
            declarationType: 'Major Disaster',
            incidentType: 'Tornado',
            stateCode: 'GA',
          },
        ],
      })
    ).toThrow(UsSourceParseError);
  });

  it('stops on a date it cannot read', () => {
    expect(() =>
      parseFemaDeclarationPayload({
        FemaWebDisasterDeclarations: [
          {
            disasterNumber: 1,
            declarationDate: 'sometime in 1953',
            declarationType: 'Major Disaster',
            incidentType: 'Tornado',
            stateCode: 'GA',
            stateName: 'Georgia',
          },
        ],
      })
    ).toThrow(UsSourceParseError);
  });
});

describe('buildFemaDeclarationCatalogue', () => {
  it('counts the file by year, by incident type, and by state', () => {
    const catalogue = buildFemaDeclarationCatalogue(parseFemaDeclarationPayload(SMALL_PAYLOAD));
    expect(catalogue.declarationCount).toBe(3);
    expect(catalogue.firstYear).toBe(1953);
    expect(catalogue.newestYear).toBe(2020);
    expect(catalogue.years).toEqual([
      { year: 1953, total: 1, fire: 0 },
      { year: 2002, total: 1, fire: 1 },
      { year: 2020, total: 1, fire: 0 },
    ]);
    expect(catalogue.fireCount).toBe(1);
    expect(catalogue.firstFireYear).toBe(2002);
    expect(catalogue.incidentTypes).toEqual([
      { name: 'Biological', count: 1 },
      { name: FEMA_FIRE_INCIDENT_TYPE, count: 1 },
      { name: 'Tornado', count: 1 },
    ]);
    expect(catalogue.topStates[0]).toEqual({ name: 'CA', count: 2 });
  });

  it('names the busiest year', () => {
    const catalogue = buildFemaDeclarationCatalogue(
      parseFemaDeclarationPayload({
        FemaWebDisasterDeclarations: [
          { ...SMALL_PAYLOAD.FemaWebDisasterDeclarations[0], disasterNumber: 1 },
          {
            ...SMALL_PAYLOAD.FemaWebDisasterDeclarations[2],
            disasterNumber: 2,
            declarationDate: '2020-01-01T00:00:00.000Z',
          },
          {
            ...SMALL_PAYLOAD.FemaWebDisasterDeclarations[2],
            disasterNumber: 3,
            incidentType: 'Flood',
            declarationDate: '2020-02-01T00:00:00.000Z',
          },
        ],
      })
    );
    expect(catalogue.busiestYear).toEqual({ year: 2020, total: 2, fire: 0 });
  });

  it('puts the incident types in count order, then name order', () => {
    const catalogue = buildFemaDeclarationCatalogue(parseFemaDeclarationPayload(SMALL_PAYLOAD));
    expect(catalogue.incidentTypes.map((entry) => entry.name)).toEqual([
      'Biological',
      FEMA_FIRE_INCIDENT_TYPE,
      'Tornado',
    ]);
    expect(catalogue.declarationTypes.map((entry) => entry.name)).toEqual([
      'Emergency',
      'Fire Management',
      'Major Disaster',
    ]);
  });

  it('stops when there is nothing to count', () => {
    expect(() => buildFemaDeclarationCatalogue([])).toThrow(UsSourceParseError);
  });
});

describe('fetchFemaDeclarations', () => {
  it('reads the file through the caller’s fetch', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(SMALL_PAYLOAD))
    ) as unknown as typeof globalThis.fetch;
    const catalogue = await fetchFemaDeclarations({ fetchImpl });
    expect(catalogue.declarationCount).toBe(3);
  });

  it('reports an HTTP failure as an API error', async () => {
    const fetchImpl = (async () =>
      new Response('nope', { status: 500 })) as unknown as typeof globalThis.fetch;
    await expect(fetchFemaDeclarations({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('femaDisasterDeclarationsAdapter', () => {
  it('describes itself as a keyless source', () => {
    expect(femaDisasterDeclarationsAdapter.id).toBe('fema-disaster-declarations');
    expect(femaDisasterDeclarationsAdapter.auth).toBe('none');
    expect(femaDisasterDeclarationsAdapter.description.length).toBeGreaterThan(0);
  });

  it('loads the committed snapshot', () => {
    const catalogue = femaDisasterDeclarationsAdapter.loadFixture();
    expect(catalogue.declarationCount).toBeGreaterThan(5000);
    expect(catalogue.firstYear).toBe(1953);
    expect(catalogue.years.length).toBeGreaterThan(70);
  });

  it('parses a payload through the same path as the live fetch', () => {
    expect(femaDisasterDeclarationsAdapter.parse(SMALL_PAYLOAD).declarationCount).toBe(3);
  });

  it('fetches live through the caller’s fetch', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(SMALL_PAYLOAD))
    ) as unknown as typeof globalThis.fetch;
    const catalogue = await femaDisasterDeclarationsAdapter.fetchLive({ fetchImpl });
    expect(catalogue.declarationCount).toBe(3);
  });
});
