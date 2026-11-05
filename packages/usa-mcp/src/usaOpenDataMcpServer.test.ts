import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { createUsaOpenDataMcpServer } from './usaOpenDataMcpServer.js';

/** Connects a client to a server over the in-memory transport pair. */
async function connectClient(
  server: ReturnType<typeof createUsaOpenDataMcpServer>
): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

/** Reads the first text block out of a tool result. */
function firstText(result: unknown): string {
  const content = (result as { content: { type: string; text?: string }[] }).content;
  return content.find((entry) => entry.type === 'text')?.text ?? '';
}

describe('createUsaOpenDataMcpServer', () => {
  it('reports the package.json version in the handshake', async () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    ) as { version: string };
    const client = await connectClient(createUsaOpenDataMcpServer());
    expect(client.getServerVersion()?.version).toBe(manifest.version);
  });

  it('advertises the country query tool', async () => {
    const client = await connectClient(createUsaOpenDataMcpServer());

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toContain('us_fema_declarations');
  });

  it('advertises a named tool for every library query', async () => {
    const client = await connectClient(createUsaOpenDataMcpServer());

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);

    expect(names).toEqual([
      'list_sources',
      'probe_sources',
      'fetch_source',
      'us_bls_unemployment',
      'us_usgs_earthquakes',
      'us_cdc_county_obesity',
      'us_ncei_annual_temperature',
      'us_noaa_sea_level',
      'us_treasury_interest_rates',
      'us_fema_declarations',
      'us_openfda_food_recalls',
      'us_usgs_peak_streamflow',
      'us_cpsc_product_recalls',
      'us_cfpb_consumer_complaints',
      'us_sec_edgar',
      'us_fdic_banks',
      'us_clinicaltrials',
      'us_nws_forecast',
      'us_pubmed_search',
      'us_nyc_open_data',
      'us_bts_stats',
      'us_college_scorecard',
      'us_publicdatahub_hospital',
      'us_nextbus_vehicles',
      'us_epa_facilities',
      'us_usaspending_agencies',
      'us_treasury_debt',
      'us_cdc_socrata',
      'us_healthdata_socrata',
      'us_estimate_tax',
      'us_callook_callsigns',
    ]);
  });

  it('rejects an unknown source id', async () => {
    const client = await connectClient(createUsaOpenDataMcpServer());

    const result = await client.callTool({
      name: 'probe_sources',
      arguments: { ids: ['not-a-source'] },
    });

    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(firstText(result)).toContain('not-a-source');
  });

  it('lists every source in the country registry', async () => {
    const client = await connectClient(createUsaOpenDataMcpServer());

    const result = await client.callTool({ name: 'list_sources', arguments: {} });

    const sources = JSON.parse(firstText(result)) as { id: string }[];
    expect(sources.length).toBe(28);
    expect(sources.every((source) => source.id.length > 0)).toBe(true);
  });

  it('rejects one-sided NWS and NextBus pairs before fetching', async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);
    const client = await connectClient(createUsaOpenDataMcpServer());

    for (const [name, args] of [
      ['us_nws_forecast', { latitude: 40.7 }],
      ['us_nextbus_vehicles', { agencyTag: 'portland-sc' }],
    ] as const) {
      const result = await client.callTool({ name, arguments: args });
      expect((result as { isError?: boolean }).isError, name).toBe(true);
    }
    expect(fetchImpl).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('preserves EstimateTax defaults and explicit federal-only nulls', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('down', { status: 500 }));
    vi.stubGlobal('fetch', fetchImpl);
    const client = await connectClient(createUsaOpenDataMcpServer());

    await client.callTool({
      name: 'us_estimate_tax',
      arguments: { income: 85_000 },
    });
    const defaultUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(defaultUrl.searchParams.get('income')).toBe('85000');
    expect(defaultUrl.searchParams.get('filingStatus')).toBe('single');
    expect(defaultUrl.searchParams.get('state')).toBe('NY');
    expect(defaultUrl.searchParams.get('city')).toBe('new-york-city');

    await client.callTool({
      name: 'us_estimate_tax',
      arguments: { income: 52_000, state: null, city: null },
    });
    const federalOnlyUrl = new URL(String(fetchImpl.mock.calls[1]?.[0]));
    expect(federalOnlyUrl.searchParams.get('state')).toBeNull();
    expect(federalOnlyUrl.searchParams.get('city')).toBeNull();

    vi.unstubAllGlobals();
  });

  it('rejects an EPA state code that is not two letters', async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);
    const client = await connectClient(createUsaOpenDataMcpServer());

    const result = await client.callTool({
      name: 'us_epa_facilities',
      arguments: { stateAbbr: 'C1' },
    });

    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('accepts the documented 10,000 catalogue cap and rejects one above it', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('down', { status: 500 }));
    vi.stubGlobal('fetch', fetchImpl);
    const client = await connectClient(createUsaOpenDataMcpServer());

    for (const name of [
      'us_nyc_open_data',
      'us_bts_stats',
      'us_cdc_socrata',
      'us_healthdata_socrata',
    ]) {
      fetchImpl.mockClear();
      const tooLarge = await client.callTool({
        name,
        arguments: { limit: 10_001 },
      });
      expect((tooLarge as { isError?: boolean }).isError, name).toBe(true);
      expect(fetchImpl, name).not.toHaveBeenCalled();

      await client.callTool({ name, arguments: { limit: 10_000 } });
      expect(fetchImpl, name).toHaveBeenCalledTimes(1);
    }

    vi.unstubAllGlobals();
  });
});

/** Arguments a tool needs before its handler will run at all. */
const REQUIRED_ARGS: Record<string, Record<string, unknown>> = {
  us_estimate_tax: { income: 85_000 },
};

/** Every tool called with every optional argument filled in. */
const FULL_ARGS: Record<string, Record<string, unknown>> = {
  probe_sources: { ids: ['fema-disaster-declarations'] },
  fetch_source: { id: 'fema-disaster-declarations', apiKey: 'k' },
  us_bls_unemployment: { seriesId: 'LNS14000000', startYear: 2020, endYear: 2021 },
  us_usgs_earthquakes: { startDate: '2026-01-01', endDate: '2026-02-01', minMagnitude: 3 },
  us_ncei_annual_temperature: { startYear: 2000, endYear: 2001 },
  us_noaa_sea_level: { stationId: '8518750', startYear: 2000, endYear: 2001 },
  us_treasury_interest_rates: { securityType: 'Interest-bearing Debt' },
  us_fema_declarations: { rowLimit: 100 },
  us_usgs_peak_streamflow: { monitoringLocationId: '07010000' },
  us_cpsc_product_recalls: { firstYear: 2000, newestYear: 2001 },
  us_cfpb_consumer_complaints: { firstYear: 2000, newestYear: 2001 },
  us_sec_edgar: { cik: '0000320193' },
  us_fdic_banks: { rowLimit: 10 },
  us_clinicaltrials: { pageSize: 5 },
  us_nws_forecast: { latitude: 40.7, longitude: -74 },
  us_pubmed_search: { term: 'diabetes', retmax: 5 },
  us_nyc_open_data: { limit: 5 },
  us_bts_stats: { limit: 5 },
  us_college_scorecard: {},
  us_publicdatahub_hospital: { slug: 'example-hospital' },
  us_nextbus_vehicles: { agencyTag: 'x', routeTag: 'y' },
  us_epa_facilities: { stateAbbr: 'CA' },
  us_usaspending_agencies: {},
  us_treasury_debt: { rowLimit: 5 },
  us_cdc_socrata: { limit: 5 },
  us_healthdata_socrata: { limit: 5 },
  us_estimate_tax: {
    income: 85_000,
    filingStatus: 'single',
    state: 'NY',
    city: 'new-york',
    preTaxDeductions: 5_000,
    selfEmploymentIncome: 0,
  },
  us_callook_callsigns: { callsigns: ['W1ABC'] },
};

describe('every advertised tool', () => {
  it('fails cleanly when the upstream API answers with a 500, with and without arguments', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('down', { status: 500 })));
    const client = await connectClient(createUsaOpenDataMcpServer());

    const { tools } = await client.listTools();

    for (const tool of tools) {
      const argumentSets = [REQUIRED_ARGS[tool.name] ?? {}, FULL_ARGS[tool.name] ?? {}];
      for (const args of argumentSets) {
        const result = await client.callTool({ name: tool.name, arguments: args });
        const isError = (result as { isError?: boolean }).isError === true;
        expect((result as { content?: unknown }).content, tool.name).toBeDefined();
        if (tool.name === 'list_sources') {
          expect(isError, tool.name).toBe(false);
        } else if (tool.name === 'probe_sources') {
          expect(isError, tool.name).toBe(false);
          const probes = JSON.parse(firstText(result)) as { ok: boolean }[];
          expect(probes.length, tool.name).toBeGreaterThan(0);
          expect(
            probes.every((probe) => !probe.ok),
            tool.name
          ).toBe(true);
        } else {
          expect(isError, tool.name).toBe(true);
        }
      }
    }

    vi.unstubAllGlobals();
  }, 60_000);
});
