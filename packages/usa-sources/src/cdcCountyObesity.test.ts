import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildCdcCountyObesitySet,
  buildCdcCountyObesityUrl,
  cdcCountyObesityAdapter,
  CDC_PLACES_COUNTY_API_BASE,
  CDC_PLACES_COUNTY_ROW_LIMIT,
  CDC_PLACES_CRUDE_PREVALENCE_ID,
  CDC_PLACES_OBESITY_MEASURE_ID,
  fetchCdcCountyObesity,
  parseCdcCountyObesityPayload,
  sortCdcCountiesByPercent,
} from './cdcCountyObesity.js';
import { UsSourceApiError, UsSourceParseError } from './errors.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const FIXTURE = readFixtureJson('cdc-county-obesity-2026-09-25.json');

/**
 * One response row, with the fields the parser reads.
 *
 * A field set to null is left out of the row, which is how Socrata sends a
 * value the release does not carry.
 */
function row(overrides: {
  locationname?: string | null;
  stateabbr?: string | null;
  data_value?: string | null;
  totalpopulation?: string | null;
  year?: string | null;
}): unknown {
  const merged: Record<string, unknown> = {
    locationname: 'Boulder',
    stateabbr: 'CO',
    data_value: '16.7',
    totalpopulation: '326831',
    year: '2023',
    ...overrides,
  };
  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== null));
}

describe('parseCdcCountyObesityPayload', () => {
  it('parses the fixture into counties, lowest share of obesity first', () => {
    const payload = parseCdcCountyObesityPayload(FIXTURE);
    expect(payload.counties).toHaveLength(2956);
    expect(payload.counties[0]).toEqual({
      countyName: 'Boulder',
      stateAbbr: 'CO',
      percent: 16.7,
      population: 326831,
    });
    expect(payload.counties[payload.counties.length - 1]).toEqual({
      countyName: 'Perry',
      stateAbbr: 'AL',
      percent: 52.9,
      population: 7738,
    });
    const percents = payload.counties.map((county) => county.percent);
    expect([...percents].sort((left, right) => left - right)).toEqual(percents);
    expect(payload.dataYear).toBe(2023);
  });

  it('keeps the national row out of the county count', () => {
    const payload = parseCdcCountyObesityPayload(FIXTURE);
    expect(payload.national).toEqual({ percent: 32.8, population: 334914895 });
    expect(payload.counties.some((county) => county.stateAbbr === 'US')).toBe(false);
  });

  it('drops a county the release could not estimate', () => {
    const payload = parseCdcCountyObesityPayload([
      row({ locationname: 'Loving', stateabbr: 'TX', data_value: null }),
      row({}),
    ]);
    expect(payload.counties.map((county) => county.countyName)).toEqual(['Boulder']);
  });

  it('drops a row whose value or population is not a number', () => {
    const payload = parseCdcCountyObesityPayload([
      row({ locationname: 'Nowhere', data_value: 'N/A' }),
      row({ locationname: 'Elsewhere', totalpopulation: '' }),
      row({}),
    ]);
    expect(payload.counties.map((county) => county.countyName)).toEqual(['Boulder']);
  });

  it('drops a row with a value but no county name or state', () => {
    const payload = parseCdcCountyObesityPayload([
      row({ locationname: null }),
      row({ stateabbr: null }),
      row({}),
    ]);
    expect(payload.counties.map((county) => county.countyName)).toEqual(['Boulder']);
  });

  it('breaks a tie on percent with the state then the county name', () => {
    const payload = parseCdcCountyObesityPayload([
      row({ locationname: 'Zavala', stateabbr: 'TX' }),
      row({ locationname: 'Barbour', stateabbr: 'AL' }),
      row({ locationname: 'Clay', stateabbr: 'AL' }),
    ]);
    expect(payload.counties.map((county) => county.countyName)).toEqual([
      'Barbour',
      'Clay',
      'Zavala',
    ]);
  });

  it('reports no national row when the response carried none', () => {
    const payload = parseCdcCountyObesityPayload([row({})]);
    expect(payload.national).toBeNull();
  });

  it('throws a parse error when the payload is not an array', () => {
    expect(() => parseCdcCountyObesityPayload({ hello: 'world' })).toThrow(UsSourceParseError);
  });

  it('accepts an empty release without inventing rows', () => {
    const payload = parseCdcCountyObesityPayload([]);
    expect(payload.counties).toEqual([]);
    expect(payload.dataYear).toBeNull();
  });
});

describe('sortCdcCountiesByPercent', () => {
  it('leaves the order alone when every county is already in place', () => {
    const payload = parseCdcCountyObesityPayload(FIXTURE);
    expect(sortCdcCountiesByPercent(payload.counties)).toEqual(payload.counties);
  });
});

describe('buildCdcCountyObesitySet', () => {
  it('folds the fixture into a set with its lowest and highest counties', () => {
    const set = buildCdcCountyObesitySet(parseCdcCountyObesityPayload(FIXTURE));
    expect(set.countyCount).toBe(2956);
    expect(set.lowest.countyName).toBe('Boulder');
    expect(set.highest).toMatchObject({ countyName: 'Perry', stateAbbr: 'AL', percent: 52.9 });
    expect(set.national.percent).toBe(32.8);
    expect(set.dataYear).toBe(2023);
  });

  it('throws when the release holds no county estimates', () => {
    expect(() =>
      buildCdcCountyObesitySet({
        counties: [],
        national: { percent: 32.8, population: 1 },
        dataYear: 2023,
      })
    ).toThrow(/No county estimates/);
  });

  it('throws when the national row is missing', () => {
    const payload = parseCdcCountyObesityPayload([row({})]);
    expect(() => buildCdcCountyObesitySet(payload)).toThrow(/no national row/);
  });

  it('throws when no row carried a survey year', () => {
    const payload = parseCdcCountyObesityPayload([
      row({ year: null }),
      row({ data_value: '32.8', stateabbr: 'US', locationname: null, year: null }),
    ]);
    expect(() => buildCdcCountyObesitySet(payload)).toThrow(/no survey year/);
  });
});

describe('buildCdcCountyObesityUrl', () => {
  it('asks for one measure at crude prevalence, with the columns the parser reads', () => {
    const url = buildCdcCountyObesityUrl();
    expect(url.startsWith(`${CDC_PLACES_COUNTY_API_BASE}?`)).toBe(true);
    expect(url).toContain('locationname%2Cstateabbr%2Cdata_value%2Ctotalpopulation%2Cyear');
    expect(url).toContain(`measureid%3D%27${CDC_PLACES_OBESITY_MEASURE_ID}%27`);
    expect(url).toContain(`datavaluetypeid%3D%27${CDC_PLACES_CRUDE_PREVALENCE_ID}%27`);
    expect(url).toContain(`%24limit=${CDC_PLACES_COUNTY_ROW_LIMIT}`);
  });

  it('takes a row cap for tests', () => {
    expect(buildCdcCountyObesityUrl({ rowLimit: 3 })).toContain('%24limit=3');
  });
});

describe('fetchCdcCountyObesity', () => {
  it('reads the release from the live endpoint', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      seen.push(String(url));
      return new Response(JSON.stringify(FIXTURE), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const payload = await fetchCdcCountyObesity({ fetchImpl });
    expect(payload.counties).toHaveLength(2956);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('measureid');
  });

  it('raises an API error on a non-200 reply', async () => {
    const fetchImpl = (async () =>
      new Response('nope', { status: 503 })) as unknown as typeof globalThis.fetch;
    await expect(fetchCdcCountyObesity({ fetchImpl })).rejects.toThrow(UsSourceApiError);
    await expect(fetchCdcCountyObesity({ fetchImpl })).rejects.toThrow(/HTTP 503/);
  });
});

describe('cdcCountyObesityAdapter', () => {
  it('is keyless and reads the one release it names', async () => {
    expect(cdcCountyObesityAdapter.id).toBe('cdc-county-obesity');
    expect(cdcCountyObesityAdapter.auth).toBe('none');

    const seen: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      seen.push(String(url));
      return new Response(JSON.stringify(FIXTURE), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const set = await cdcCountyObesityAdapter.fetchLive({ fetchImpl });
    expect(set.countyCount).toBe(2956);
    expect(seen[0]).toContain('data.cdc.gov');
  });

  it('parses a payload and loads its committed fixture', () => {
    expect(cdcCountyObesityAdapter.parse(FIXTURE).countyCount).toBe(2956);
    expect(cdcCountyObesityAdapter.loadFixture().countyCount).toBe(2956);
  });
});
