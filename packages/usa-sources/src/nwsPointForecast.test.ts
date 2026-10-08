import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildNwsPointUrl,
  fetchNwsPointForecast,
  NWS_API_BASE,
  NWS_DEFAULT_LATITUDE,
  NWS_DEFAULT_LONGITUDE,
  NWS_USER_AGENT,
  nwsPointForecastAdapter,
  parseNwsPointForecastPayload,
} from './nwsPointForecast.js';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText('nws-point-forecast-2026-10-05.json');

/** A tiny GeoJSON feature with the same shape as the real one. */
const SMALL_PAYLOAD = JSON.stringify({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-77.0352, 38.8894] },
  properties: {
    gridId: 'LWX',
    gridX: 97,
    gridY: 71,
    forecastOffice: 'https://api.weather.gov/offices/LWX',
    forecast: 'https://api.weather.gov/gridpoints/LWX/97,71/forecast',
    forecastHourly: 'https://api.weather.gov/gridpoints/LWX/97,71/forecast/hourly',
    forecastGridData: 'https://api.weather.gov/gridpoints/LWX/97,71',
    observationStations: 'https://api.weather.gov/gridpoints/LWX/97,71/stations',
    relativeLocation: {
      properties: { city: 'Washington', state: 'DC' },
    },
    timeZone: 'America/New_York',
    radarStation: 'KLWX',
    county: 'https://api.weather.gov/zones/county/DCC001',
    fireWeatherZone: 'https://api.weather.gov/zones/fire/DCZ001',
  },
});

describe('buildNwsPointUrl', () => {
  it('builds the coordinate URL the service expects', () => {
    expect(buildNwsPointUrl()).toBe(
      `${NWS_API_BASE}/points/${NWS_DEFAULT_LATITUDE},${NWS_DEFAULT_LONGITUDE}`
    );
  });

  it('takes a latitude and longitude from the caller', () => {
    expect(buildNwsPointUrl(40.7128, -74.006)).toBe(`${NWS_API_BASE}/points/40.7128,-74.006`);
  });
});

describe('parseNwsPointForecastPayload', () => {
  it('reads the grid point, the place, and the forecast URLs', () => {
    const point = parseNwsPointForecastPayload(JSON.parse(SMALL_PAYLOAD));
    expect(point).toEqual({
      latitude: 38.8894,
      longitude: -77.0352,
      city: 'Washington',
      state: 'DC',
      gridId: 'LWX',
      gridX: 97,
      gridY: 71,
      forecastOfficeUrl: 'https://api.weather.gov/offices/LWX',
      forecastUrl: 'https://api.weather.gov/gridpoints/LWX/97,71/forecast',
      forecastHourlyUrl: 'https://api.weather.gov/gridpoints/LWX/97,71/forecast/hourly',
      forecastGridDataUrl: 'https://api.weather.gov/gridpoints/LWX/97,71',
      observationStationsUrl: 'https://api.weather.gov/gridpoints/LWX/97,71/stations',
      timeZone: 'America/New_York',
      radarStation: 'KLWX',
      countyUrl: 'https://api.weather.gov/zones/county/DCC001',
      fireWeatherZoneUrl: 'https://api.weather.gov/zones/fire/DCZ001',
    });
  });

  it('stops on a response that is not a GeoJSON feature', () => {
    expect(() => parseNwsPointForecastPayload({ type: 'Problem', properties: {} })).toThrow(
      UsSourceParseError
    );
  });

  it('stops on a response without a coordinate pair', () => {
    expect(() =>
      parseNwsPointForecastPayload({
        type: 'Feature',
        geometry: { coordinates: [-77.0352] },
        properties: { gridId: 'LWX', gridX: 97, gridY: 71, forecast: 'x', forecastOffice: 'y' },
      })
    ).toThrow(UsSourceParseError);
  });

  it('stops on a response without a forecast grid', () => {
    expect(() =>
      parseNwsPointForecastPayload({
        type: 'Feature',
        geometry: { coordinates: [-77.0352, 38.8894] },
        properties: { forecast: 'https://api.weather.gov/gridpoints/LWX/97,71/forecast' },
      })
    ).toThrow(UsSourceParseError);
  });

  it('stops on a payload that is not the expected shape', () => {
    expect(() => parseNwsPointForecastPayload('nope')).toThrow(UsSourceParseError);
  });
});

describe('fetchNwsPointForecast', () => {
  it('sends the descriptive User-Agent header and parses the answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const point = await fetchNwsPointForecast({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get('user-agent')).toBe(
      NWS_USER_AGENT
    );
    expect(point.gridId).toBe('LWX');
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(fetchNwsPointForecast({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('nwsPointForecastAdapter', () => {
  it('registers as a keyless source', () => {
    expect(nwsPointForecastAdapter.id).toBe('nws-point-forecast');
    expect(nwsPointForecastAdapter.auth).toBe('none');
    expect(nwsPointForecastAdapter.description).toContain('National Weather Service');
  });

  it('parses a payload through the adapter surface', () => {
    expect(nwsPointForecastAdapter.parse(JSON.parse(SMALL_PAYLOAD)).gridY).toBe(71);
  });

  it('reads the committed fixture', () => {
    expect(nwsPointForecastAdapter.loadFixture().gridId).toBe('LWX');
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    expect((await nwsPointForecastAdapter.fetchLive({ fetchImpl })).city).toBe('Washington');
  });
});

// The point the endpoint answers with is pinned here, so a refreshed snapshot
// that moves it fails the suite rather than quietly changing the copy.
describe('the committed NWS fixture', () => {
  const point = nwsPointForecastAdapter.loadFixture();

  it('resolves the Washington Monument coordinate to the LWX grid', () => {
    expect(point.latitude).toBeCloseTo(38.8894, 4);
    expect(point.longitude).toBeCloseTo(-77.0352, 4);
    expect(point.gridId).toBe('LWX');
    expect(point.gridX).toBe(97);
    expect(point.gridY).toBe(71);
    expect(point.city).toBe('Washington');
    expect(point.state).toBe('DC');
  });

  it('carries the URLs that lead to the forecast', () => {
    expect(point.forecastUrl).toBe('https://api.weather.gov/gridpoints/LWX/97,71/forecast');
    expect(point.forecastHourlyUrl).toBe(
      'https://api.weather.gov/gridpoints/LWX/97,71/forecast/hourly'
    );
    expect(point.timeZone).toBe('America/New_York');
  });

  it('matches the raw fixture the registry test answers with', () => {
    const fromText = parseNwsPointForecastPayload(JSON.parse(FIXTURE));
    expect(fromText.radarStation).toBe('KLWX');
  });
});
