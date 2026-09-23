import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildUsgsEarthquakeCatalogue,
  buildUsgsEarthquakeUrl,
  fetchUsgsEarthquakes,
  parseUsgsEarthquakes,
  usgsHawaiiEarthquakesAdapter,
  usgsHawaiiRollingWindow,
  USGS_HAWAII_BOUNDS,
  USGS_HAWAII_MIN_MAGNITUDE,
} from './usgsEarthquakes.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const FIXTURE = readFixtureJson('usgs-hawaii-earthquakes.json');

/** One catalogue feature with the fields the parser reads. */
function feature(overrides: {
  id?: string;
  mag?: number | null;
  place?: string | null;
  type?: string;
  time?: number;
  depthKm?: number;
}): unknown {
  return {
    type: 'Feature',
    id: overrides.id ?? 'us1',
    properties: {
      mag: overrides.mag === undefined ? 3.1 : overrides.mag,
      place: overrides.place === undefined ? '10 km E of Pāhala, Hawaii' : overrides.place,
      time: overrides.time ?? 1_735_764_689_000,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us1',
      type: overrides.type ?? 'earthquake',
    },
    geometry: {
      type: 'Point',
      coordinates:
        overrides.depthKm === undefined
          ? [-155.47, 19.2, 31.1]
          : [-155.47, 19.2, overrides.depthKm],
    },
  };
}

/** A response envelope holding the given features. */
function response(features: unknown[], status = 200): unknown {
  return {
    type: 'FeatureCollection',
    metadata: { status, count: features.length },
    features,
  };
}

describe('parseUsgsEarthquakes', () => {
  it('parses the fixture into earthquakes, oldest first', () => {
    const earthquakes = parseUsgsEarthquakes(FIXTURE);
    expect(earthquakes).toHaveLength(264);
    expect(earthquakes[0]).toMatchObject({
      magnitude: 3.1,
      place: '10 km E of Pāhala, Hawaii',
      timeMs: 1_735_764_689_000,
    });
    expect(earthquakes[earthquakes.length - 1]?.magnitude).toBe(2.52);
    const times = earthquakes.map((earthquake) => earthquake.timeMs);
    expect([...times].sort((left, right) => left - right)).toEqual(times);
  });

  it('drops quarry blasts and explosions, keeping tectonic earthquakes', () => {
    const earthquakes = parseUsgsEarthquakes(
      response([feature({ id: 'blast', type: 'quarry blast' }), feature({ id: 'quake' })])
    );
    expect(earthquakes.map((earthquake) => earthquake.id)).toEqual(['quake']);
  });

  it('drops a row that carries no magnitude', () => {
    const earthquakes = parseUsgsEarthquakes(
      response([feature({ id: 'no-mag', mag: null }), feature({ id: 'quake' })])
    );
    expect(earthquakes.map((earthquake) => earthquake.id)).toEqual(['quake']);
  });

  it('drops a row that carries no place or depth', () => {
    const earthquakes = parseUsgsEarthquakes(
      response([
        feature({ id: 'no-place', place: null }),
        {
          ...(feature({ id: 'no-depth' }) as { geometry: unknown }),
          geometry: { type: 'Point', coordinates: [-155, 19] },
        },
        feature({ id: 'quake' }),
      ])
    );
    expect(earthquakes.map((earthquake) => earthquake.id)).toEqual(['quake']);
  });

  it('breaks a tie on time with the event id', () => {
    const earthquakes = parseUsgsEarthquakes(
      response([feature({ id: 'us2', time: 1_000 }), feature({ id: 'us1', time: 1_000 })])
    );
    expect(earthquakes.map((earthquake) => earthquake.id)).toEqual(['us1', 'us2']);
  });

  it('throws a parse error when the payload is not a feature collection', () => {
    expect(() => parseUsgsEarthquakes({ hello: 'world' })).toThrow(UsSourceParseError);
  });

  it('throws an API error when the envelope reports a failure', () => {
    expect(() => parseUsgsEarthquakes(response([], 400))).toThrow(UsSourceApiError);
  });
});

describe('buildUsgsEarthquakeCatalogue', () => {
  it('counts the window and finds the strongest and the deepest', () => {
    const catalogue = buildUsgsEarthquakeCatalogue(parseUsgsEarthquakes(FIXTURE));
    expect(catalogue.count).toBe(264);
    expect(catalogue.strongest).toMatchObject({
      magnitude: 4.41,
      place: '53 km W of Hawaiian Ocean View, Hawaii',
    });
    expect(catalogue.deepest).toMatchObject({ depthKm: 59.8, place: '13 km W of Puako, Hawaii' });
    expect(catalogue.earliest.timeMs).toBeLessThan(catalogue.latest.timeMs);
  });

  it('throws when the window holds no earthquakes', () => {
    expect(() => buildUsgsEarthquakeCatalogue([])).toThrow(/No earthquakes/);
  });
});

describe('buildUsgsEarthquakeUrl', () => {
  it('asks for the window, the magnitude floor, and the box', () => {
    const url = buildUsgsEarthquakeUrl({
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      minMagnitude: USGS_HAWAII_MIN_MAGNITUDE,
      bounds: USGS_HAWAII_BOUNDS,
    });
    expect(url.startsWith('https://earthquake.usgs.gov/fdsnws/event/1/query?')).toBe(true);
    expect(url).toContain('format=geojson');
    expect(url).toContain('starttime=2025-01-01');
    expect(url).toContain('endtime=2026-01-01');
    expect(url).toContain('minmagnitude=2.5');
    expect(url).toContain('minlatitude=18.5');
    expect(url).toContain('maxlatitude=22.5');
    expect(url).toContain('minlongitude=-161');
    expect(url).toContain('maxlongitude=-154');
  });
});

describe('fetchUsgsEarthquakes', () => {
  const QUERY = {
    startDate: '2025-01-01',
    endDate: '2026-01-01',
    minMagnitude: USGS_HAWAII_MIN_MAGNITUDE,
    bounds: USGS_HAWAII_BOUNDS,
  };

  it('reads the window from the live endpoint', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      seen.push(String(url));
      return new Response(JSON.stringify(FIXTURE), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const earthquakes = await fetchUsgsEarthquakes(QUERY, { fetchImpl });
    expect(earthquakes).toHaveLength(264);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('minmagnitude=2.5');
  });

  it('raises an API error on a non-200 reply', async () => {
    const fetchImpl = (async () =>
      new Response('nope', { status: 503 })) as unknown as typeof globalThis.fetch;
    await expect(fetchUsgsEarthquakes(QUERY, { fetchImpl })).rejects.toThrow(/HTTP 503/);
  });
});

describe('usgsHawaiiRollingWindow', () => {
  it('counts back a year from the given day', () => {
    const window = usgsHawaiiRollingWindow(new Date('2026-01-01T12:00:00Z'));
    expect(window.endDate).toBe('2026-01-01');
    expect(window.startDate).toBe('2025-01-01');
    expect(window.minMagnitude).toBe(USGS_HAWAII_MIN_MAGNITUDE);
    expect(window.bounds).toEqual(USGS_HAWAII_BOUNDS);
  });
});

describe('usgsHawaiiEarthquakesAdapter', () => {
  it('is keyless and reads the rolling year from its own box', async () => {
    expect(usgsHawaiiEarthquakesAdapter.id).toBe('usgs-hawaii-earthquakes');
    expect(usgsHawaiiEarthquakesAdapter.auth).toBe('none');

    const seen: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      seen.push(String(url));
      return new Response(JSON.stringify(FIXTURE), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const catalogue = await usgsHawaiiEarthquakesAdapter.fetchLive({ fetchImpl });
    expect(catalogue.count).toBe(264);
    expect(seen[0]).toContain('minlatitude=18.5');
    expect(seen[0]).toContain(`minmagnitude=${USGS_HAWAII_MIN_MAGNITUDE}`);
  });

  it('parses a payload and loads its committed fixture', () => {
    expect(usgsHawaiiEarthquakesAdapter.parse(FIXTURE).count).toBe(264);
    expect(usgsHawaiiEarthquakesAdapter.loadFixture().count).toBe(264);
  });
});
