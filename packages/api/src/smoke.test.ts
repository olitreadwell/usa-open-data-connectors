import { describe, expect, it } from 'vitest';

import { createConnectorsApp } from './index';

const RUN_SMOKE = process.env.RUN_SMOKE === '1';

describe.skipIf(!RUN_SMOKE)('live API smoke test', () => {
  it('lists every source through the API', async () => {
    const app = createConnectorsApp({});
    const res = await app.request('/api/sources');
    expect(res.status).toBe(200);
    const sources = (await res.json()) as Array<{ id: string }>;
    expect(sources.length).toBeGreaterThanOrEqual(2);
  });

  it('reads the BLS unemployment series keyless', async () => {
    const app = createConnectorsApp({});
    const res = await app.request('/api/sources/bls-unemployment-rate/data');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { seriesId: string; points: Array<unknown> } };
    expect(body.data.seriesId).toBe('LNS14000000');
    expect(body.data.points.length).toBeGreaterThan(0);
  }, 60_000);

  it('probes every registered source', async () => {
    const app = createConnectorsApp({});
    const listed = await app.request('/api/sources');
    const sources = (await listed.json()) as Array<{ id: string }>;
    expect(sources.length).toBeGreaterThanOrEqual(2);
    for (const source of sources) {
      const res = await app.request(`/api/sources/${source.id}/probe`);
      expect(res.status).toBe(200);
      const probe = (await res.json()) as { ok: boolean; status: string };
      expect(probe.ok, `${source.id}: ${probe.status}`).toBe(true);
    }
  }, 60_000);
});
