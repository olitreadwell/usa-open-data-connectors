import { describe, expect, it } from 'vitest';

import { probeUsDataSource } from '@open-data-connectors/usa-sources';

import { runCli } from './commands.js';
import type { CliDependencies, CliOutput } from './commands.js';

function createCapture(): { out: string[]; err: string[]; output: CliOutput } {
  const out: string[] = [];
  const err: string[] = [];
  const output: CliOutput = {
    writeOut: (line) => out.push(line),
    writeErr: (line) => err.push(line),
  };
  return { out, err, output };
}

const stubProbe: typeof probeUsDataSource = async (adapter) => ({
  id: adapter.id,
  name: adapter.name,
  auth: adapter.auth,
  ok: true,
  status: 'ok',
});

const failingProbe: typeof probeUsDataSource = async (adapter) => ({
  id: adapter.id,
  name: adapter.name,
  auth: adapter.auth,
  ok: false,
  status: 'HTTP 503',
});

function createDeps(): CliDependencies {
  return { probeSource: stubProbe };
}

describe('runCli', () => {
  it('prints help when no command is given', async () => {
    const { out, err, output } = createCapture();
    const exitCode = await runCli([], output, createDeps());
    expect(exitCode).toBe(0);
    expect(out.join('\n')).toContain('usdata - US open data connectors');
    expect(err).toEqual([]);
  });

  it('prints help for the help command', async () => {
    const { out, output } = createCapture();
    const exitCode = await runCli(['help'], output, createDeps());
    expect(exitCode).toBe(0);
    expect(out.join('\n')).toContain('Usage:');
  });

  it('lists every source as JSON', async () => {
    const { out, output } = createCapture();
    const exitCode = await runCli(['sources'], output, createDeps());
    expect(exitCode).toBe(0);
    const sources = JSON.parse(out.join('\n')) as Array<{ id: string }>;
    expect(sources.length).toBeGreaterThanOrEqual(2);
    expect(sources.map((source) => source.id)).toContain('bls-unemployment-rate');
  });

  it('probes a known source', async () => {
    const { out, output } = createCapture();
    const exitCode = await runCli(['probe', 'bls-unemployment-rate'], output, createDeps());
    expect(exitCode).toBe(0);
    const probe = JSON.parse(out.join('\n')) as { id: string; ok: boolean };
    expect(probe.id).toBe('bls-unemployment-rate');
    expect(probe.ok).toBe(true);
  });

  it('exits non-zero when the probe fails', async () => {
    const { out, output } = createCapture();
    const exitCode = await runCli(['probe', 'bls-unemployment-rate'], output, {
      probeSource: failingProbe,
    });
    expect(exitCode).toBe(1);
    expect(JSON.parse(out.join('\n'))).toMatchObject({ ok: false, status: 'HTTP 503' });
  });

  it('errors when the probe id is missing', async () => {
    const { err, output } = createCapture();
    const exitCode = await runCli(['probe'], output, createDeps());
    expect(exitCode).toBe(1);
    expect(err.join('\n')).toContain('Usage: usdata probe <id>');
  });

  it('errors on an unknown source', async () => {
    const { err, output } = createCapture();
    const exitCode = await runCli(['probe', 'linz'], output, createDeps());
    expect(exitCode).toBe(1);
    expect(err.join('\n')).toContain('Unknown source: linz');
  });

  it('errors on an unknown command', async () => {
    const { err, output } = createCapture();
    const exitCode = await runCli(['frobnicate'], output, createDeps());
    expect(exitCode).toBe(1);
    expect(err.join('\n')).toContain('Unknown command: frobnicate');
  });

  it('errors on an unknown option', async () => {
    const { err, output } = createCapture();
    const exitCode = await runCli(['sources', '--bogus'], output, createDeps());
    expect(exitCode).toBe(1);
    expect(err.join('\n')).toContain('bogus');
  });
});
