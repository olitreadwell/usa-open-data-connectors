import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

const RUN_SMOKE = process.env.RUN_SMOKE === '1';

/** Reads the first text block out of a tool result. */
function firstText(result: unknown): string {
  const content = (result as { content: { type: string; text?: string }[] }).content;
  return content.find((entry) => entry.type === 'text')?.text ?? '';
}

describe.runIf(RUN_SMOKE)('the built stdio server', () => {
  it('starts, lists its tools, and probes a US source live', async () => {
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['dist/stdio.js'],
      cwd: process.cwd(),
    });
    const client = new Client({ name: 'smoke-client', version: '0.0.0' });
    await client.connect(transport);

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain('us_fema_declarations');

    const sources = await client.callTool({ name: 'list_sources', arguments: {} });
    expect(JSON.parse(firstText(sources)).length).toBe(22);

    const probe = await client.callTool({
      name: 'probe_sources',
      arguments: { ids: ['fema-disaster-declarations'] },
    });
    expect(JSON.parse(firstText(probe))[0].ok).toBe(true);

    await client.close();
  }, 90_000);
});
