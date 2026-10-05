import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { blsUnemploymentAdapter } from './blsSeries.js';
import { cdcCountyObesityAdapter } from './cdcCountyObesity.js';
import { cfpbConsumerComplaintsAdapter } from './cfpbConsumerComplaints.js';
import { btsTransportationStatsAdapter } from './btsTransportationStats.js';
import { cdcSocrataCatalogueAdapter } from './cdcSocrataCatalogue.js';
import { clinicalTrialsStudiesAdapter } from './clinicalTrialsStudies.js';
import { epaEnvirofactsFacilitiesAdapter } from './epaEnvirofactsFacilities.js';
import { fdicBankDirectoryAdapter } from './fdicBankDirectory.js';
import { healthdataSocrataCatalogueAdapter } from './healthdataSocrataCatalogue.js';
import { ncbiPubmedSearchAdapter } from './ncbiPubmedSearch.js';
import { nwsPointForecastAdapter } from './nwsPointForecast.js';
import { secEdgarFilingsAdapter } from './secEdgarFilings.js';
import { treasuryDebtToPennyAdapter } from './treasuryDebtToPenny.js';
import { usaspendingAgenciesAdapter } from './usaspendingAgencies.js';
import { cpscProductRecallsAdapter } from './cpscProductRecalls.js';
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
// The recall service answers one year per request. This fixture holds the
// first three recalls of every year from 2014 to 2026, so the stub answers
// each year with the rows dated inside it.
const RAW_CPSC_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/cpsc-recall-rows-2014-2026-sampled-2026-10-02.json'),
  'utf8'
);
// The complaint search API answers one question per request. This fixture is
// the folded snapshot, so the stub can answer each year from its year rows and
// the tally request from its product and company lists.
const CFPB_COMPLAINT_FIXTURE = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'src/fixtures/cfpb-consumer-complaints-2026-10-03.json'),
    'utf8'
  )
) as {
  newestReceivedDate: string;
  years: { year: number; complaintCount: number }[];
  topProducts: { product: string; complaintCount: number }[];
  topCompanies: { company: string; complaintCount: number }[];
};

/**
 * Answer one Consumer Complaint Database request with the part of the
 * snapshot it asks for.
 *
 * The adapter asks three shapes on one host: one year of totals, one day of
 * totals, and the product and company tallies, so the fixture is picked by
 * the query rather than by the host alone.
 */
function cfpbFixtureFor(url: URL): string {
  if (url.searchParams.get('no_aggs') !== 'true') {
    return JSON.stringify({
      aggregations: {
        product: {
          product: {
            buckets: CFPB_COMPLAINT_FIXTURE.topProducts.map((row) => ({
              key: row.product,
              doc_count: row.complaintCount,
            })),
          },
        },
        company: {
          company: {
            buckets: CFPB_COMPLAINT_FIXTURE.topCompanies.map((row) => ({
              key: row.company,
              doc_count: row.complaintCount,
            })),
          },
        },
      },
    });
  }
  const min = url.searchParams.get('date_received_min') ?? '';
  const max = url.searchParams.get('date_received_max') ?? '';
  const count =
    min === max
      ? Number(min === CFPB_COMPLAINT_FIXTURE.newestReceivedDate)
      : (CFPB_COMPLAINT_FIXTURE.years.find((row) => min.startsWith(String(row.year)))
          ?.complaintCount ?? 0);
  return JSON.stringify({ hits: { total: { value: count, relation: 'eq' }, hits: [] } });
}
const RAW_TREASURY_DEBT_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/treasury-debt-to-penny-2026-10-05.json'),
  'utf8'
);
const RAW_SEC_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/sec-edgar-filings-2026-10-05.json'),
  'utf8'
);
const RAW_FDIC_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/fdic-bank-directory-2026-10-05.json'),
  'utf8'
);
const RAW_CLINICALTRIALS_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/clinicaltrials-studies-2026-10-05.json'),
  'utf8'
);
const RAW_NWS_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/nws-point-forecast-2026-10-05.json'),
  'utf8'
);
const RAW_USASPENDING_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/usaspending-agencies-2026-10-05.json'),
  'utf8'
);
const RAW_EPA_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/epa-envirofacts-facilities-2026-10-05.json'),
  'utf8'
);
const RAW_PUBMED_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/ncbi-pubmed-search-2026-10-05.json'),
  'utf8'
);
const RAW_CDC_CATALOGUE_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/cdc-socrata-catalogue-2026-10-05.json'),
  'utf8'
);
const RAW_HEALTHDATA_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/healthdata-socrata-catalogue-2026-10-05.json'),
  'utf8'
);
const RAW_BTS_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/bts-transportation-stats-2026-10-05.json'),
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
    return parsed.pathname.endsWith('/api/views.json')
      ? RAW_CDC_CATALOGUE_FIXTURE
      : RAW_CDC_FIXTURE;
  }
  if (hostname === 'www.ncei.noaa.gov') {
    return RAW_NCEI_FIXTURE;
  }
  if (hostname === 'api.fiscaldata.treasury.gov') {
    return parsed.pathname.includes('debt_to_penny')
      ? RAW_TREASURY_DEBT_FIXTURE
      : RAW_TREASURY_FIXTURE;
  }
  if (hostname === 'www.fema.gov') {
    return RAW_FEMA_FIXTURE;
  }
  if (hostname === 'api.waterdata.usgs.gov') {
    return RAW_USGS_PEAK_FIXTURE;
  }
  if (hostname === 'www.saferproducts.gov') {
    return RAW_CPSC_FIXTURE;
  }
  if (hostname === 'www.consumerfinance.gov') {
    return cfpbFixtureFor(parsed);
  }
  if (hostname === 'data.sec.gov') {
    return RAW_SEC_FIXTURE;
  }
  if (hostname === 'banks.data.fdic.gov') {
    return RAW_FDIC_FIXTURE;
  }
  if (hostname === 'clinicaltrials.gov') {
    return RAW_CLINICALTRIALS_FIXTURE;
  }
  if (hostname === 'api.weather.gov') {
    return RAW_NWS_FIXTURE;
  }
  if (hostname === 'api.usaspending.gov') {
    return RAW_USASPENDING_FIXTURE;
  }
  if (hostname === 'data.epa.gov') {
    return RAW_EPA_FIXTURE;
  }
  if (hostname === 'eutils.ncbi.nlm.nih.gov') {
    return RAW_PUBMED_FIXTURE;
  }
  if (hostname === 'healthdata.gov') {
    return RAW_HEALTHDATA_FIXTURE;
  }
  if (hostname === 'data.bts.gov') {
    return RAW_BTS_FIXTURE;
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
    expect(ids).toContain('cpsc-product-recalls');
    expect(ids).toContain('cfpb-consumer-complaints');
    expect(ids).toContain('treasury-debt-to-penny');
    expect(ids).toContain('sec-edgar-filings');
    expect(ids).toContain('fdic-bank-directory');
    expect(ids).toContain('clinicaltrials-studies');
    expect(ids).toContain('nws-point-forecast');
    expect(ids).toContain('usaspending-agencies');
    expect(ids).toContain('epa-envirofacts-facilities');
    expect(ids).toContain('ncbi-pubmed-search');
    expect(ids).toContain('cdc-socrata-catalogue');
    expect(ids).toContain('healthdata-socrata-catalogue');
    expect(ids).toContain('bts-transportation-stats');
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
    expect(getUsDataSource('cpsc-product-recalls')).toBe(cpscProductRecallsAdapter);
    expect(getUsDataSource('cfpb-consumer-complaints')).toBe(cfpbConsumerComplaintsAdapter);
    expect(getUsDataSource('treasury-debt-to-penny')).toBe(treasuryDebtToPennyAdapter);
    expect(getUsDataSource('sec-edgar-filings')).toBe(secEdgarFilingsAdapter);
    expect(getUsDataSource('fdic-bank-directory')).toBe(fdicBankDirectoryAdapter);
    expect(getUsDataSource('clinicaltrials-studies')).toBe(clinicalTrialsStudiesAdapter);
    expect(getUsDataSource('nws-point-forecast')).toBe(nwsPointForecastAdapter);
    expect(getUsDataSource('usaspending-agencies')).toBe(usaspendingAgenciesAdapter);
    expect(getUsDataSource('epa-envirofacts-facilities')).toBe(epaEnvirofactsFacilitiesAdapter);
    expect(getUsDataSource('ncbi-pubmed-search')).toBe(ncbiPubmedSearchAdapter);
    expect(getUsDataSource('cdc-socrata-catalogue')).toBe(cdcSocrataCatalogueAdapter);
    expect(getUsDataSource('healthdata-socrata-catalogue')).toBe(healthdataSocrataCatalogueAdapter);
    expect(getUsDataSource('bts-transportation-stats')).toBe(btsTransportationStatsAdapter);
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
