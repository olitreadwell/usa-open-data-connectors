import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createSourcesRoutes } from './sources';

// The route module reads whatever a request returns, so the stub answers with
// the committed fixture for the adapter under test.
const BLS_FIXTURE = readFileSync(
  path.join(process.cwd(), '../usa-sources/src/fixtures/bls-unemployment-rate.json'),
  'utf8'
);

// A fetch stub that answers every request with the BLS fixture.
const fixtureFetch = (async () =>
  new Response(BLS_FIXTURE, { status: 200 })) as unknown as typeof globalThis.fetch;

// A fetch stub that always fails upstream.
const failingFetch = (async () =>
  new Response('nope', { status: 500 })) as unknown as typeof globalThis.fetch;

describe('GET /sources', () => {
  it('lists the registered US adapters without their fetch functions', async () => {
    const routes = createSourcesRoutes();
    const res = await routes.request('/sources');
    expect(res.status).toBe(200);
    const sources = (await res.json()) as Array<Record<string, unknown>>;
    expect(sources.map((source) => source.id)).toEqual([
      'bls-unemployment-rate',
      'usgs-hawaii-earthquakes',
    ]);
    for (const source of sources) {
      expect(Object.keys(source).sort()).toEqual(['auth', 'description', 'id', 'name']);
    }
  });
});

describe('GET /sources/:id/data', () => {
  it('parses the live payload for a known source', async () => {
    const routes = createSourcesRoutes({ fetchImpl: fixtureFetch });
    const res = await routes.request('/sources/bls-unemployment-rate/data');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      name: string;
      auth: string;
      data: { seriesId: string; points: Array<{ period: string }> };
    };
    expect(body.id).toBe('bls-unemployment-rate');
    expect(body.auth).toBe('none');
    expect(body.data.seriesId).toBe('LNS14000000');
    expect(body.data.points.length).toBeGreaterThan(0);
  });

  it('answers 404 for an unknown source', async () => {
    const routes = createSourcesRoutes({ fetchImpl: fixtureFetch });
    const res = await routes.request('/sources/nope/data');
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Unknown source: nope' });
  });

  it('answers 400 for a malformed source id', async () => {
    const routes = createSourcesRoutes({ fetchImpl: fixtureFetch });
    const res = await routes.request('/sources/%20/data');
    expect(res.status).toBe(400);
  });

  it('answers 502 when the upstream source fails', async () => {
    const routes = createSourcesRoutes({ fetchImpl: failingFetch });
    const res = await routes.request('/sources/bls-unemployment-rate/data');
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('upstream_failure');
    expect(body.message).toContain('500');
  });
});

describe('GET /sources/:id/probe', () => {
  it('uses the registered adapter when no probe override is given', async () => {
    const routes = createSourcesRoutes({ fetchImpl: fixtureFetch });
    const res = await routes.request('/sources/bls-unemployment-rate/probe');
    expect(res.status).toBe(200);
    const probe = (await res.json()) as { id: string; ok: boolean; sample?: string };
    expect(probe.id).toBe('bls-unemployment-rate');
    expect(probe.ok).toBe(true);
    expect(probe.sample).toContain('LNS14000000');
  });
});
