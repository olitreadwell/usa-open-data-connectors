import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
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
  it('advertises the country query tool', async () => {
    const client = await connectClient(createUsaOpenDataMcpServer());

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toContain('us_fema_declarations');
  });

  it('lists every source in the country registry', async () => {
    const client = await connectClient(createUsaOpenDataMcpServer());

    const result = await client.callTool({ name: 'list_sources', arguments: {} });

    const sources = JSON.parse(firstText(result)) as { id: string }[];
    expect(sources.length).toBe(11);
    expect(sources.every((source) => source.id.length > 0)).toBe(true);
  });

  it('names a source that is not in the registry', async () => {
    const client = await connectClient(createUsaOpenDataMcpServer());

    const result = await client.callTool({
      name: 'fetch_source',
      arguments: { id: 'not-a-real-source' },
    });

    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(firstText(result)).toContain('not-a-real-source');
  });
});

/** Arguments a tool needs before its handler will run at all. */
const REQUIRED_ARGS: Record<string, Record<string, unknown>> = {};

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
        expect((result as { content?: unknown }).content, tool.name).toBeDefined();
      }
    }

    vi.unstubAllGlobals();
  }, 60_000);
});
