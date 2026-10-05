import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildEpaEnvirofactsFacilitiesUrl,
  EPA_ENVIROFACTS_API_BASE,
  EPA_ENVIROFACTS_ROW_WINDOW,
  EPA_ENVIROFACTS_STATE_ABBR,
  epaEnvirofactsFacilitiesAdapter,
  fetchEpaEnvirofactsFacilities,
  parseEpaEnvirofactsFacilitiesPayload,
} from './epaEnvirofactsFacilities.js';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText('epa-envirofacts-facilities-2026-10-05.json');

/** A tiny array with the same shape as the real one. */
const SMALL_PAYLOAD = JSON.stringify([
  {
    tri_facility_id: '02804MPRLW50CHA',
    facility_name: 'IMPERIAL WALLCOVERINGS INC',
    street_address: '50 CHASE HILL RD',
    city_name: 'ASHAWAY',
    county_name: 'WASHINGTON',
    state_abbr: 'RI',
    zip_code: '02804',
    region: '1',
    fac_closed_ind: '0',
    parent_co_name: 'COLLINS & AIKMAN CORP',
  },
  {
    tri_facility_id: '02806SKNKLBAYSP',
    facility_name: 'SEEKONK LACE CO',
    street_address: '1 BAY SPRING AVE',
    city_name: 'BARRINGTON',
    county_name: 'BRISTOL',
    state_abbr: 'RI',
    zip_code: '02806',
    region: '1',
    fac_closed_ind: '1',
    parent_co_name: 'NA',
  },
]);

describe('buildEpaEnvirofactsFacilitiesUrl', () => {
  it('puts the state value straight after the column, with no equals segment', () => {
    expect(buildEpaEnvirofactsFacilitiesUrl()).toBe(
      `${EPA_ENVIROFACTS_API_BASE}/TRI_FACILITY/STATE_ABBR/${EPA_ENVIROFACTS_STATE_ABBR}/rows/${EPA_ENVIROFACTS_ROW_WINDOW}/JSON`
    );
  });

  it('takes a state code and row window from the caller', () => {
    expect(buildEpaEnvirofactsFacilitiesUrl({ stateAbbr: 'CA', rowWindow: '0:4' })).toBe(
      `${EPA_ENVIROFACTS_API_BASE}/TRI_FACILITY/STATE_ABBR/CA/rows/0:4/JSON`
    );
  });

  it('never builds an equals segment, which the service ignores', () => {
    expect(buildEpaEnvirofactsFacilitiesUrl()).not.toContain('equals');
  });
});

describe('parseEpaEnvirofactsFacilitiesPayload', () => {
  it('reads the facility fields out of each row', () => {
    const page = parseEpaEnvirofactsFacilitiesPayload(JSON.parse(SMALL_PAYLOAD));
    expect(page.facilityCount).toBe(2);
    expect(page.facilities[0]).toEqual({
      facilityId: '02804MPRLW50CHA',
      facilityName: 'IMPERIAL WALLCOVERINGS INC',
      streetAddress: '50 CHASE HILL RD',
      city: 'ASHAWAY',
      countyName: 'WASHINGTON',
      stateAbbr: 'RI',
      postalCode: '02804',
      region: '1',
      closed: false,
      parentCompanyName: 'COLLINS & AIKMAN CORP',
    });
  });

  it("treats the register's NA parent company as absent", () => {
    const page = parseEpaEnvirofactsFacilitiesPayload(JSON.parse(SMALL_PAYLOAD));
    expect(page.facilities[1]?.parentCompanyName).toBeNull();
  });

  it('counts the open and closed facilities', () => {
    const page = parseEpaEnvirofactsFacilitiesPayload(JSON.parse(SMALL_PAYLOAD));
    expect(page.openCount).toBe(1);
    expect(page.closedCount).toBe(1);
  });

  it('counts the counties in the page, most facilities first', () => {
    expect(parseEpaEnvirofactsFacilitiesPayload(JSON.parse(SMALL_PAYLOAD)).counties).toEqual([
      { countyName: 'BRISTOL', facilityCount: 1 },
      { countyName: 'WASHINGTON', facilityCount: 1 },
    ]);
  });

  it('reports an error body as an API error', () => {
    expect(() =>
      parseEpaEnvirofactsFacilitiesPayload({
        error: 'TRI_FACILITY/rows/0:2: The table is not available.',
      })
    ).toThrow(UsSourceApiError);
  });

  it('stops on a payload that is not the expected shape', () => {
    expect(() => parseEpaEnvirofactsFacilitiesPayload('nope')).toThrow(UsSourceParseError);
    expect(() => parseEpaEnvirofactsFacilitiesPayload([])).toThrow(UsSourceParseError);
  });

  it('stops on a row without a facility id, name, or state', () => {
    expect(() => parseEpaEnvirofactsFacilitiesPayload([{ county_name: 'KENT' }])).toThrow(
      UsSourceParseError
    );
  });
});

describe('fetchEpaEnvirofactsFacilities', () => {
  it('requests the Envirofacts service and folds the answer into a page', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const page = await fetchEpaEnvirofactsFacilities({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(page.facilityCount).toBe(2);
  });

  it('sends a state code from the caller in the URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    await fetchEpaEnvirofactsFacilities({ stateAbbr: 'CA', fetchImpl });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('/STATE_ABBR/CA/');
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));
    await expect(fetchEpaEnvirofactsFacilities({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('epaEnvirofactsFacilitiesAdapter', () => {
  it('registers as a keyless source', () => {
    expect(epaEnvirofactsFacilitiesAdapter.id).toBe('epa-envirofacts-facilities');
    expect(epaEnvirofactsFacilitiesAdapter.auth).toBe('none');
    expect(epaEnvirofactsFacilitiesAdapter.description).toContain('Envirofacts');
  });

  it('parses a payload through the adapter surface', () => {
    expect(epaEnvirofactsFacilitiesAdapter.parse(JSON.parse(SMALL_PAYLOAD)).facilityCount).toBe(2);
  });

  it('reads the committed fixture', () => {
    expect(epaEnvirofactsFacilitiesAdapter.loadFixture().facilityCount).toBe(10);
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const page = await epaEnvirofactsFacilitiesAdapter.fetchLive({ fetchImpl });
    expect(page.counties).toEqual([
      { countyName: 'BRISTOL', facilityCount: 1 },
      { countyName: 'WASHINGTON', facilityCount: 1 },
    ]);
  });
});

// The page the endpoint answers with is pinned here, so a refreshed snapshot
// that moves it fails the suite rather than quietly changing the copy.
describe('the committed Envirofacts fixture', () => {
  const page = epaEnvirofactsFacilitiesAdapter.loadFixture();

  it('holds ten Rhode Island facilities, which the live service returned', () => {
    expect(page.facilityCount).toBe(10);
    expect(page.facilities[0]?.facilityId).toBe('02804MPRLW50CHA');
    expect(page.facilities[0]?.facilityName).toBe('IMPERIAL WALLCOVERINGS INC');
  });

  it('shows the state filter narrowed the rows: every one is Rhode Island', () => {
    expect(new Set(page.facilities.map((facility) => facility.stateAbbr))).toEqual(new Set(['RI']));
  });

  it('rolls the page up into open, closed, and county counts', () => {
    expect(page.openCount).toBe(9);
    expect(page.closedCount).toBe(1);
    expect(page.counties).toEqual([
      { countyName: 'BRISTOL', facilityCount: 6 },
      { countyName: 'WASHINGTON', facilityCount: 4 },
    ]);
  });

  it('matches the raw fixture the registry test answers with', () => {
    const fromText = parseEpaEnvirofactsFacilitiesPayload(JSON.parse(FIXTURE));
    expect(fromText.facilityCount).toBe(10);
  });
});
