import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { blsUnemploymentAdapter } from './blsSeries.js';
import { cdcCountyObesityAdapter } from './cdcCountyObesity.js';
import { femaDisasterDeclarationsAdapter } from './femaDisasterDeclarations.js';
import { nceiAnnualTemperatureAdapter } from './nceiAnnualTemperature.js';
import { noaaSeaLevelAdapter } from './noaaSeaLevel.js';
import { openFdaFoodRecallsAdapter } from './openFdaFoodRecalls.js';
import { usgsHawaiiEarthquakesAdapter } from './usgsEarthquakes.js';
import { usgsPeakStreamflowAdapter } from './usgsPeakStreamflow.js';
import {
  getUsDataSource,
  probeAllUsDataSources,
  probeUsDataSource,
  US_DATA_SOURCES,
} from './registry.js';

// Each adapter parses its own response shape, so the stubs answer with the
// raw fixture for the host being asked rather than with a parsed value.
const RAW_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/bls-unemployment-rate.json'),
  'utf8'
);
const RAW_USGS_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/usgs-hawaii-earthquakes.json'),
  'utf8'
);
const RAW_CDC_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/cdc-county-obesity-2026-09-25.json'),
  'utf8'
);
const RAW_NCEI_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/ncei-annual-temperature-2026-09-26.csv'),
  'utf8'
);
const RAW_NOAA_SEA_LEVEL_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/noaa-sea-level-2026-09-27.json'),
  'utf8'
);
const RAW_TREASURY_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/treasury-avg-interest-rate-2026-09-28.json'),
  'utf8'
);
const RAW_FEMA_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/fema-disaster-declarations-2026-09-29.json'),
  'utf8'
);
const RAW_USGS_PEAK_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/usgs-peak-streamflow-2026-10-01.json'),
  'utf8'
);
const OPENFDA_FOOD_RECALL_FIXTURE = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'src/fixtures/openfda-food-recalls-2026-09-30.json'),
    'utf8'
  )
) as {
  recallCount: number;
  reportDates: unknown[];
  classOneDates: unknown[];
  classifications: unknown[];
  voluntary: unknown[];
};

/**
 * Answer one openFDA request with the part of the snapshot it asks for.
 *
 * The food recall adapter asks five questions on one host, so the fixture is
 * picked by the counted field rather than by the host alone.
 */
function openFdaFixtureFor(url: URL): string {
  const count = url.searchParams.get('count');
  if (count === 'report_date') {
    return JSON.stringify({
      results:
        url.searchParams.get('search') === null
          ? OPENFDA_FOOD_RECALL_FIXTURE.reportDates
          : OPENFDA_FOOD_RECALL_FIXTURE.classOneDates,
    });
  }
  if (count === 'classification.exact') {
    return JSON.stringify({ results: OPENFDA_FOOD_RECALL_FIXTURE.classifications });
  }
  if (count === 'voluntary_mandated.exact') {
    return JSON.stringify({ results: OPENFDA_FOOD_RECALL_FIXTURE.voluntary });
  }
  return JSON.stringify({ meta: { results: { total: OPENFDA_FOOD_RECALL_FIXTURE.recallCount } } });
}

/**
 * Pick the fixture that answers a request, by exact host.
 *
 * Parsing the URL and comparing `hostname` keeps the match on the real host, so
 * a URL that merely mentions `data.cdc.gov` elsewhere cannot select the wrong
 * fixture (`js/incomplete-url-substring-sanitization`).
 */
function rawFixtureForUrl(url: string): string {
  const parsed = new URL(url);
  const { hostname } = parsed;
  if (hostname === 'api.fda.gov') {
    return openFdaFixtureFor(parsed);
  }
  if (hostname === 'earthquake.usgs.gov') {
    return RAW_USGS_FIXTURE;
  }
  if (hostname === 'data.cdc.gov') {
    return RAW_CDC_FIXTURE;
  }
  if (hostname === 'www.ncei.noaa.gov') {
    return RAW_NCEI_FIXTURE;
  }
  if (hostname === 'api.fiscaldata.treasury.gov') {
    return RAW_TREASURY_FIXTURE;
  }
  if (hostname === 'www.fema.gov') {
    return RAW_FEMA_FIXTURE;
  }
  if (hostname === 'api.waterdata.usgs.gov') {
    return RAW_USGS_PEAK_FIXTURE;
  }
  return hostname === 'api.tidesandcurrents.noaa.gov' ? RAW_NOAA_SEA_LEVEL_FIXTURE : RAW_FIXTURE;
}

/** A fetch stub that answers each source with its own fixture. */
const FIXTURE_FETCH = (async (input: string | URL) =>
  new Response(rawFixtureForUrl(String(input)), {
    status: 200,
  })) as unknown as typeof globalThis.fetch;

describe('US_DATA_SOURCES', () => {
  it('registers the unemployment adapter with a unique id', () => {
    const ids = US_DATA_SOURCES.map((source) => source.id);
    expect(ids).toContain('bls-unemployment-rate');
    expect(ids).toContain('usgs-hawaii-earthquakes');
    expect(ids).toContain('cdc-county-obesity');
    expect(ids).toContain('ncei-annual-temperature');
    expect(ids).toContain('noaa-sea-level');
    expect(ids).toContain('treasury-avg-interest-rate');
    expect(ids).toContain('fema-disaster-declarations');
    expect(ids).toContain('openfda-food-recalls');
    expect(ids).toContain('usgs-peak-streamflow');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks every source as keyless or keyed', () => {
    for (const source of US_DATA_SOURCES) {
      expect(['none', 'key']).toContain(source.auth);
    }
  });

  it('gives every source a fixture it can load', () => {
    for (const source of US_DATA_SOURCES) {
      expect(() => source.loadFixture()).not.toThrow();
    }
  });
});

describe('getUsDataSource', () => {
  it('finds a source by id', () => {
    expect(getUsDataSource('bls-unemployment-rate')).toBe(blsUnemploymentAdapter);
    expect(getUsDataSource('usgs-hawaii-earthquakes')).toBe(usgsHawaiiEarthquakesAdapter);
    expect(getUsDataSource('cdc-county-obesity')).toBe(cdcCountyObesityAdapter);
    expect(getUsDataSource('ncei-annual-temperature')).toBe(nceiAnnualTemperatureAdapter);
    expect(getUsDataSource('noaa-sea-level')).toBe(noaaSeaLevelAdapter);
    expect(getUsDataSource('fema-disaster-declarations')).toBe(femaDisasterDeclarationsAdapter);
    expect(getUsDataSource('openfda-food-recalls')).toBe(openFdaFoodRecallsAdapter);
    expect(getUsDataSource('usgs-peak-streamflow')).toBe(usgsPeakStreamflowAdapter);
  });

  it('returns undefined for an unknown id', () => {
    expect(getUsDataSource('nope')).toBeUndefined();
  });
});

describe('probeUsDataSource', () => {
  it('reports ok when the source answers', async () => {
    const fetchImpl = (async () =>
      new Response(RAW_FIXTURE, { status: 200 })) as unknown as typeof globalThis.fetch;
    const probe = await probeUsDataSource(blsUnemploymentAdapter, { fetchImpl });
    expect(probe.ok).toBe(true);
    expect(probe.status).toBe('ok');
    expect(probe.sample).toContain('LNS14000000');
  });

  it('reports the failure message when the source throws', async () => {
    const fetchImpl = (async () =>
      new Response('nope', { status: 500 })) as unknown as typeof globalThis.fetch;
    const probe = await probeUsDataSource(blsUnemploymentAdapter, { fetchImpl });
    expect(probe.ok).toBe(false);
    expect(probe.status).toContain('500');
  });
});

describe('probeAllUsDataSources', () => {
  it('probes every registered source', async () => {
    const probes = await probeAllUsDataSources({ fetchImpl: FIXTURE_FETCH });
    expect(probes).toHaveLength(US_DATA_SOURCES.length);
    expect(probes.every((probe) => probe.ok)).toBe(true);
  });
});
