import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createSourceMcpServer, type SourceMcpConfig } from './createSourceMcpServer.js';

/** Connects a client to a server over the in-memory transport pair. */
async function connectClient(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

/** Reads the first text block out of a tool result. */
function firstText(result: unknown): string {
  const content = (result as { content: { type: string; text?: string }[] }).content;
  const block = content.find((entry) => entry.type === 'text');
  return block?.text ?? '';
}

function buildServer(overrides: Partial<SourceMcpConfig> = {}): McpServer {
  return createSourceMcpServer({
    serverName: 'test-country-open-data',
    serverVersion: '0.0.0',
    listSources: () => [
      { id: 'alpha', name: 'Alpha source', auth: 'none', description: 'First test source.' },
    ],
    probeSources: async () => [
      { id: 'alpha', name: 'Alpha source', auth: 'none', ok: true, status: 'ok', sample: '{}' },
    ],
    fetchSource: async (id) => ({ id, answered: true }),
    queryTools: [
      {
        name: 'alpha_rows',
        title: 'Alpha rows',
        description: 'Reads rows from alpha.',
        inputSchema: { limit: z.number().int().optional().describe('Row cap.') },
        run: async (args) => ({ requestedLimit: args.limit ?? null }),
      },
    ],
    ...overrides,
  });
}

describe('createSourceMcpServer', () => {
  it('advertises the registry, probe, fetch, and query tools', async () => {
    const client = await connectClient(buildServer());

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual([
      'list_sources',
      'probe_sources',
      'fetch_source',
      'alpha_rows',
    ]);
  });

  it('returns the registry as JSON text', async () => {
    const client = await connectClient(buildServer());

    const result = await client.callTool({ name: 'list_sources', arguments: {} });

    expect(JSON.parse(firstText(result))).toEqual([
      { id: 'alpha', name: 'Alpha source', auth: 'none', description: 'First test source.' },
    ]);
  });

  it('returns probe results as JSON text', async () => {
    const client = await connectClient(buildServer());

    const result = await client.callTool({
      name: 'probe_sources',
      arguments: { ids: ['alpha'] },
    });

    expect(JSON.parse(firstText(result))[0].ok).toBe(true);
  });

  it('passes the api key through to the adapter fetch', async () => {
    const fetchSource = vi.fn().mockResolvedValue({ ok: true });
    const client = await connectClient(buildServer({ fetchSource }));

    await client.callTool({ name: 'fetch_source', arguments: { id: 'alpha', apiKey: 'k-1' } });

    expect(fetchSource).toHaveBeenCalledWith('alpha', { apiKey: 'k-1' });
  });

  it('leaves the options out of the adapter fetch when no api key is given', async () => {
    const fetchSource = vi.fn().mockResolvedValue({ ok: true });
    const client = await connectClient(buildServer({ fetchSource }));

    await client.callTool({ name: 'fetch_source', arguments: { id: 'alpha' } });

    expect(fetchSource).toHaveBeenCalledWith('alpha', undefined);
  });

  it('runs a query tool with the arguments the model sent', async () => {
    const client = await connectClient(buildServer());

    const result = await client.callTool({ name: 'alpha_rows', arguments: { limit: 5 } });

    expect(JSON.parse(firstText(result))).toEqual({ requestedLimit: 5 });
  });

  it('reports a failing source as an error result rather than crashing', async () => {
    const fetchSource = vi.fn().mockRejectedValue(new Error('HTTP 503 from alpha'));
    const client = await connectClient(buildServer({ fetchSource }));

    const result = await client.callTool({ name: 'fetch_source', arguments: { id: 'alpha' } });

    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(firstText(result)).toBe('HTTP 503 from alpha');
  });

  it('stringifies a non-Error rejection', async () => {
    const fetchSource = vi.fn().mockRejectedValue('gateway down');
    const client = await connectClient(buildServer({ fetchSource }));

    const result = await client.callTool({ name: 'fetch_source', arguments: { id: 'alpha' } });

    expect(firstText(result)).toBe('gateway down');
  });

  it('sends undefined tool output as null rather than dropping the block', async () => {
    const queryTools = [
      {
        name: 'alpha_nothing',
        title: 'Alpha nothing',
        description: 'Returns nothing.',
        inputSchema: {},
        run: async () => undefined,
      },
    ];
    const client = await connectClient(buildServer({ queryTools }));

    const result = await client.callTool({ name: 'alpha_nothing', arguments: {} });

    expect(firstText(result)).toBe('null');
  });
});
