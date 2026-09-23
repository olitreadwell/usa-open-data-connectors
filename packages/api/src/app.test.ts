import { describe, expect, it } from 'vitest';

import { probeUsDataSource } from '@open-data-connectors/usa-sources';

import { createConnectorsApp } from './index';

const stubProbe: typeof probeUsDataSource = async (adapter) => ({
  id: adapter.id,
  name: adapter.name,
  auth: adapter.auth,
  ok: true,
  status: 'ok',
});

function createTestApp(): ReturnType<typeof createConnectorsApp> {
  return createConnectorsApp({ probeFn: stubProbe });
}

describe('createConnectorsApp', () => {
  it('answers the health check', async () => {
    const app = createTestApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      name: 'usa-open-data-connectors',
    });
  });

  it('serves the OpenAPI document', async () => {
    const app = createTestApp();
    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { info: { title: string }; paths: Record<string, unknown> };
    expect(doc.info.title).toBe('USA Open Data Connectors');
    expect(doc.paths['/api/sources']).toBeDefined();
    expect(doc.paths['/api/sources/{id}/data']).toBeDefined();
  });

  it('serves the Swagger UI at /docs', async () => {
    const app = createTestApp();
    const res = await app.request('/docs');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('swagger');
  });

  it('lists every adapter with id, name, auth, and description', async () => {
    const app = createTestApp();
    const res = await app.request('/api/sources');
    expect(res.status).toBe(200);
    const sources = (await res.json()) as Array<{
      id: string;
      name: string;
      auth: string;
      description: string;
    }>;
    expect(sources.length).toBeGreaterThanOrEqual(2);
    expect(sources.map((source) => source.id)).toContain('bls-unemployment-rate');
    expect(sources.map((source) => source.id)).toContain('usgs-hawaii-earthquakes');
    for (const source of sources) {
      expect(source.id.length).toBeGreaterThan(0);
      expect(source.name.length).toBeGreaterThan(0);
      expect(['none', 'key']).toContain(source.auth);
      expect(source.description.length).toBeGreaterThan(0);
    }
  });

  it('probes a known source', async () => {
    const app = createTestApp();
    const res = await app.request('/api/sources/bls-unemployment-rate/probe');
    expect(res.status).toBe(200);
    const probe = (await res.json()) as { id: string; ok: boolean };
    expect(probe.id).toBe('bls-unemployment-rate');
    expect(probe.ok).toBe(true);
  });

  it('returns 404 for an unknown source', async () => {
    const app = createTestApp();
    const res = await app.request('/api/sources/not-a-source/probe');
    expect(res.status).toBe(404);
  });

  it('rejects a malformed probe id', async () => {
    const app = createTestApp();
    const res = await app.request('/api/sources/%20/probe');
    expect(res.status).toBe(400);
  });

  it('allows cross-origin reads on /api routes by default', async () => {
    const app = createTestApp();
    const res = await app.request('/api/sources', {
      headers: { origin: 'https://example.com' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('honors a configured CORS origin', async () => {
    const app = createConnectorsApp({
      probeFn: stubProbe,
      corsOrigin: 'https://app.example.com',
    });
    const res = await app.request('/api/sources', {
      headers: { origin: 'https://app.example.com' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
  });

  it('omits CORS headers for origins outside the configured allowlist', async () => {
    const app = createConnectorsApp({
      probeFn: stubProbe,
      corsOrigin: 'https://app.example.com',
    });
    const res = await app.request('/api/sources', {
      headers: { origin: 'https://evil.example.com' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers OPTIONS preflight for /api routes', async () => {
    const app = createTestApp();
    const res = await app.request('/api/sources', {
      method: 'OPTIONS',
      headers: { origin: 'https://example.com' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
  });

  it('rate limits /api routes per client', async () => {
    const app = createConnectorsApp({
      probeFn: stubProbe,
      rateLimit: { maxRequests: 2, windowMs: 60_000 },
    });
    await app.request('/api/sources', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });
    await app.request('/api/sources', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });
    const limited = await app.request('/api/sources', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'rate_limited' });
  });
});
