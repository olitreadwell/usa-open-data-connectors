import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildNextBusVehicleUrl,
  fetchNextBusVehicles,
  nextBusTransitVehiclesAdapter,
  NEXTBUS_PORTLAND_STREETCAR_QUERY,
  NEXTBUS_XML_FEED_BASE,
  parseNextBusVehiclePayload,
} from './nextBusTransitVehicles.js';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText('nextbus-portland-streetcar-vehicles-2026-10-22.xml');

const SINGLE_VEHICLE_XML = `<?xml version="1.0" encoding="utf-8" ?>
<body copyright="All data copyright Portland Streetcar 2026.">
<vehicle id="099" routeTag="193" lat="45.5" lon="-122.6" secsSinceReport="4" predictable="true" heading="90" speedKmHr="12"/>
<lastTime time="1792648671716"/>
</body>`;

const ERROR_XML = `<?xml version="1.0" encoding="utf-8" ?>
<body copyright="All data copyright agencies listed below and Umo IQ 2026.">
<Error shouldRetry="false">Agency parameter "a=nope" is not valid.</Error>
</body>`;

const OUT_OF_RANGE_XML = `<?xml version="1.0" encoding="utf-8" ?>
<body copyright="All data copyright Portland Streetcar 2026.">
<vehicle id="099" routeTag="193" lat="145.5" lon="-122.6" secsSinceReport="4" predictable="true"/>
<lastTime time="1792648671716"/>
</body>`;

describe('buildNextBusVehicleUrl', () => {
  it('asks the NextBus feed for the Portland Streetcar route NS', () => {
    const url = new URL(buildNextBusVehicleUrl(NEXTBUS_PORTLAND_STREETCAR_QUERY));
    expect(url.origin + url.pathname).toBe(NEXTBUS_XML_FEED_BASE);
    expect(url.searchParams.get('command')).toBe('vehicleLocations');
    expect(url.searchParams.get('a')).toBe('portland-sc');
    expect(url.searchParams.get('r')).toBe('193');
    expect(url.searchParams.get('t')).toBe('0');
  });

  it('takes another agency and route from the caller', () => {
    const url = new URL(buildNextBusVehicleUrl({ agencyTag: 'west-hollywood', routeTag: 'CLEB' }));
    expect(url.searchParams.get('a')).toBe('west-hollywood');
    expect(url.searchParams.get('r')).toBe('CLEB');
  });
});

describe('parseNextBusVehiclePayload', () => {
  it('reads every vehicle position out of the fixture', () => {
    const snapshot = parseNextBusVehiclePayload(FIXTURE);
    expect(snapshot.vehicleCount).toBe(5);
    expect(snapshot.vehicles[0]).toEqual({
      vehicleId: '022',
      routeTag: '193',
      directionTag: '',
      latitude: 45.5290958,
      longitude: -122.681345,
      headingDegrees: -4,
      speedKmPerHour: 0,
      secondsSinceReport: 6,
      predictable: false,
    });
    expect(snapshot.vehicles[1]?.directionTag).toBe('193_0_var5');
  });

  it('names the query and the time of the snapshot', () => {
    const snapshot = parseNextBusVehiclePayload(FIXTURE);
    expect(snapshot.agencyTag).toBe('portland-sc');
    expect(snapshot.routeTag).toBe('193');
    expect(snapshot.observedAtEpochMs).toBe(1792648671716);
  });

  it('counts predictable vehicles and reports the report age', () => {
    const snapshot = parseNextBusVehiclePayload(FIXTURE);
    expect(snapshot.predictableVehicleCount).toBe(4);
    expect(snapshot.newestReportSeconds).toBe(6);
    expect(snapshot.oldestReportSeconds).toBe(23);
    expect(snapshot.averageSpeedKmPerHour).toBe(0);
  });

  it('treats one vehicle as a one-item list', () => {
    const snapshot = parseNextBusVehiclePayload(SINGLE_VEHICLE_XML);
    expect(snapshot.vehicleCount).toBe(1);
    expect(snapshot.vehicles[0]?.vehicleId).toBe('099');
    expect(snapshot.averageSpeedKmPerHour).toBe(12);
  });

  it('carries the query through to the snapshot', () => {
    const snapshot = parseNextBusVehiclePayload(SINGLE_VEHICLE_XML, {
      agencyTag: 'west-hollywood',
      routeTag: 'CLEB',
    });
    expect(snapshot.agencyTag).toBe('west-hollywood');
    expect(snapshot.routeTag).toBe('CLEB');
  });

  it('stops on an error body from the feed', () => {
    expect(() => parseNextBusVehiclePayload(ERROR_XML)).toThrow(UsSourceParseError);
    expect(() => parseNextBusVehiclePayload(ERROR_XML)).toThrow('Agency parameter');
  });

  it('stops on a position outside the map', () => {
    expect(() => parseNextBusVehiclePayload(OUT_OF_RANGE_XML)).toThrow(UsSourceParseError);
  });

  it('stops on text that is not XML', () => {
    expect(() => parseNextBusVehiclePayload('nope')).toThrow(UsSourceParseError);
  });
});

describe('fetchNextBusVehicles', () => {
  it('requests the feed and parses the answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(FIXTURE, { status: 200 }));
    const snapshot = await fetchNextBusVehicles({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(snapshot.vehicleCount).toBe(5);
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(fetchNextBusVehicles({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('nextBusTransitVehiclesAdapter', () => {
  it('registers as a keyless source', () => {
    expect(nextBusTransitVehiclesAdapter.id).toBe('nextbus-transit-vehicles');
    expect(nextBusTransitVehiclesAdapter.auth).toBe('none');
    expect(nextBusTransitVehiclesAdapter.description).toContain('NextBus');
  });

  it('parses a payload through the adapter surface', () => {
    expect(nextBusTransitVehiclesAdapter.parse(FIXTURE).vehicleCount).toBe(5);
  });

  it('reads the committed fixture', () => {
    const snapshot = nextBusTransitVehiclesAdapter.loadFixture();
    expect(snapshot.vehicleCount).toBe(5);
    expect(snapshot.vehicles.map((vehicle) => vehicle.vehicleId)).toEqual([
      '022',
      '003',
      '004',
      '026',
      '005',
    ]);
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(FIXTURE, { status: 200 }));
    const snapshot = await nextBusTransitVehiclesAdapter.fetchLive({ fetchImpl });
    expect(snapshot.vehicleCount).toBe(5);
  });
});

// The committed snapshot is what the page and the tests describe, so a
// refreshed fixture that changes the line fails here rather than quietly
// changing the copy.
describe('the committed NextBus fixture', () => {
  const snapshot = nextBusTransitVehiclesAdapter.loadFixture();

  it('covers the Portland Streetcar route NS at one moment', () => {
    expect(snapshot.agencyTag).toBe('portland-sc');
    expect(snapshot.routeTag).toBe('193');
    expect(snapshot.observedAtEpochMs).toBe(1792648671716);
  });

  it('holds five streetcars with one not yet predictable', () => {
    expect(snapshot.vehicleCount).toBe(5);
    expect(snapshot.predictableVehicleCount).toBe(4);
  });
});
