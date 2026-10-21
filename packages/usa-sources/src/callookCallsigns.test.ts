import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildCallookCallsignUrl,
  CALLOOK_API_BASE,
  CALLOOK_DISTRICT_CALLSIGNS,
  callookCallsignsAdapter,
  fetchCallookCallsigns,
  parseCallookCallsignsPayload,
} from './callookCallsigns.js';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText('callook-callsigns-2026-10-21.json');

const VALID_PAYLOAD = {
  status: 'VALID',
  type: 'PERSON',
  current: { callsign: 'W1ABC', operClass: 'GENERAL' },
  previous: { callsign: 'KA1ABC', operClass: 'TECHNICIAN' },
  trustee: { callsign: '', name: '' },
  name: 'MICHAEL D SHIRRELL',
  address: {
    line1: '1 MAIN ST',
    line2: 'KYLE, TX 78640',
    attn: '',
  },
  location: {
    latitude: '29.9891',
    longitude: '-97.8772',
    gridsquare: 'EM10ca',
  },
  otherInfo: {
    grantDate: '03/24/2026',
    expiryDate: '03/24/2036',
    lastActionDate: '03/24/2026',
    frn: '0000000001',
    ulsUrl: 'https://wireless2.fcc.gov/UlsApp/UlsSearch/license.jsp?licKey=1',
  },
};

const CLUB_PAYLOAD = {
  status: 'VALID',
  type: 'CLUB',
  current: { callsign: 'W2ABC', operClass: '' },
  previous: { callsign: '', operClass: '' },
  trustee: { callsign: 'W2XYZ', name: 'A TRUSTEE' },
  name: 'A RADIO CLUB',
  address: {
    line1: '2 CLUB WAY',
    line2: 'NEW YORK CITY, NY 10023-0016',
    attn: 'ATTN: A TRUSTEE',
  },
  location: {
    latitude: '40.7128',
    longitude: '-74.0060',
    gridsquare: 'FN20xr',
  },
  otherInfo: {
    grantDate: '01/01/2018',
    expiryDate: '01/01/2028',
    lastActionDate: '01/01/2028',
    frn: '0000000002',
    ulsUrl: 'https://wireless2.fcc.gov/UlsApp/UlsSearch/license.jsp?licKey=2',
  },
};

describe('buildCallookCallsignUrl', () => {
  it('builds the JSON lookup URL for a callsign', () => {
    expect(buildCallookCallsignUrl('w1abc')).toBe(`${CALLOOK_API_BASE}/W1ABC/json`);
  });

  it('rejects a value that is not a callsign', () => {
    expect(() => buildCallookCallsignUrl('W1 ABC')).toThrow(UsSourceParseError);
    expect(() => buildCallookCallsignUrl('')).toThrow(UsSourceParseError);
  });
});

describe('parseCallookCallsignsPayload', () => {
  it('reads the licence fields and converts the dates to ISO form', () => {
    const directory = parseCallookCallsignsPayload([VALID_PAYLOAD]);
    expect(directory.callsigns[0]).toEqual({
      status: 'VALID',
      callsign: 'W1ABC',
      licenseType: 'PERSON',
      operatorClass: 'GENERAL',
      previousCallsign: 'KA1ABC',
      previousOperatorClass: 'TECHNICIAN',
      licenseeName: 'MICHAEL D SHIRRELL',
      trusteeCallsign: '',
      trusteeName: '',
      addressLine1: '1 MAIN ST',
      addressLine2: 'KYLE, TX 78640',
      attention: '',
      latitude: 29.9891,
      longitude: -97.8772,
      gridsquare: 'EM10ca',
      grantDate: '2026-03-24',
      expiryDate: '2036-03-24',
      lastActionDate: '2026-03-24',
      frn: '0000000001',
      ulsUrl: 'https://wireless2.fcc.gov/UlsApp/UlsSearch/license.jsp?licKey=1',
      stateAbbr: 'TX',
      callDistrict: '1',
    });
  });

  it('folds the callsigns, licence types, classes, and expiry dates', () => {
    const directory = parseCallookCallsignsPayload([VALID_PAYLOAD, CLUB_PAYLOAD]);
    expect(directory.callsignCount).toBe(2);
    expect(directory.validCount).toBe(2);
    expect(directory.licenseTypeCounts).toEqual([
      { label: 'CLUB', count: 1 },
      { label: 'PERSON', count: 1 },
    ]);
    expect(directory.operatorClassCounts).toEqual([{ label: 'GENERAL', count: 1 }]);
    expect(directory.callDistrictCount).toBe(2);
    expect(directory.soonestExpiry?.callsign).toBe('W2ABC');
    expect(directory.latestExpiry?.callsign).toBe('W1ABC');
  });

  it('keeps an invalid lookup as a record without inventing licence fields', () => {
    const directory = parseCallookCallsignsPayload([{ status: 'INVALID' }]);
    expect(directory.invalidCount).toBe(1);
    expect(directory.callsigns[0]).toMatchObject({
      status: 'INVALID',
      callsign: '',
      licenseeName: '',
      expiryDate: null,
    });
    expect(directory.soonestExpiry).toBeNull();
  });

  it('reports the updating status as a parse result, not a licence', () => {
    const directory = parseCallookCallsignsPayload([{ status: 'UPDATING' }]);
    expect(directory.callsigns[0]?.status).toBe('UPDATING');
    expect(directory.validCount).toBe(0);
  });

  it('stops on an empty list or an unknown status', () => {
    expect(() => parseCallookCallsignsPayload([])).toThrow(UsSourceParseError);
    expect(() => parseCallookCallsignsPayload([{ status: 'GONE' }])).toThrow(UsSourceParseError);
    expect(() => parseCallookCallsignsPayload({ status: 'VALID' })).toThrow(UsSourceParseError);
  });

  it('stops when a valid record has no current callsign', () => {
    expect(() => parseCallookCallsignsPayload([{ status: 'VALID' }])).toThrow(UsSourceParseError);
  });
});

describe('fetchCallookCallsigns', () => {
  it('asks for each callsign and folds the answers', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(VALID_PAYLOAD), { status: 200 }));
    const directory = await fetchCallookCallsigns({ callsigns: ['W1ABC'], fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(`${CALLOOK_API_BASE}/W1ABC/json`, expect.anything());
    expect(directory.callsignCount).toBe(1);
  });

  it('reads the district sample when no callsigns are given', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => {
      return Promise.resolve(new Response(JSON.stringify(VALID_PAYLOAD), { status: 200 }));
    });
    await fetchCallookCallsigns({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(CALLOOK_DISTRICT_CALLSIGNS.length);
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(fetchCallookCallsigns({ callsigns: ['W1ABC'], fetchImpl })).rejects.toThrow(
      UsSourceApiError
    );
  });
});

describe('callookCallsignsAdapter', () => {
  it('registers as a keyless source', () => {
    expect(callookCallsignsAdapter.id).toBe('callook-callsigns');
    expect(callookCallsignsAdapter.auth).toBe('none');
    expect(callookCallsignsAdapter.description).toContain('Callook');
  });

  it('parses a list through the adapter surface', () => {
    expect(callookCallsignsAdapter.parse([VALID_PAYLOAD]).callsignCount).toBe(1);
  });

  it('reads the committed fixture', () => {
    const directory = callookCallsignsAdapter.loadFixture();
    expect(directory.callsignCount).toBe(10);
    expect(directory.validCount).toBe(10);
    expect(directory.callsigns[0]?.callsign).toBe('W1ABC');
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => {
      return Promise.resolve(new Response(JSON.stringify(VALID_PAYLOAD), { status: 200 }));
    });
    const directory = await callookCallsignsAdapter.fetchLive({ fetchImpl });
    expect(directory.callDistrictCount).toBe(1);
  });
});

// The snapshot is pinned so a refreshed fixture that changes the sample fails
// the suite rather than quietly changing the story.
describe('the committed Callook fixture', () => {
  const directory = callookCallsignsAdapter.loadFixture();

  it('holds one valid callsign in every US call district', () => {
    expect(directory.callsigns.map((callsign) => callsign.callDistrict)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '0',
    ]);
    expect(directory.callDistrictCount).toBe(10);
  });

  it('counts five Extra, three General, and one Technician licence', () => {
    expect(directory.operatorClassCounts).toEqual([
      { label: 'EXTRA', count: 5 },
      { label: 'GENERAL', count: 3 },
      { label: 'TECHNICIAN', count: 1 },
    ]);
  });

  it('separates the one club licence from the nine personal ones', () => {
    expect(directory.licenseTypeCounts).toEqual([
      { label: 'PERSON', count: 9 },
      { label: 'CLUB', count: 1 },
    ]);
  });

  it('names the soonest and latest expiry in the sample', () => {
    expect(directory.soonestExpiry?.callsign).toBe('W2ABC');
    expect(directory.soonestExpiry?.expiryDate).toBe('2026-11-04');
    expect(directory.latestExpiry?.callsign).toBe('W4ABC');
    expect(directory.latestExpiry?.expiryDate).toBe('2036-11-04');
  });

  it('matches the raw fixture the registry test answers with', () => {
    const fromText = parseCallookCallsignsPayload(JSON.parse(FIXTURE));
    expect(fromText.callsignCount).toBe(10);
  });
});
