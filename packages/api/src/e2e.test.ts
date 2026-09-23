import { serve } from '@hono/node-server';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createConnectorsApp } from './index';

describe('end-to-end over a real HTTP socket', () => {
  let baseUrl: string;
  let closeServer: () => Promise<void>;

  beforeAll(async () => {
    const app = createConnectorsApp({});
    const server = serve({ fetch: app.fetch, port: 0 });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    closeServer = () => new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterAll(async () => {
    await closeServer();
  });

  it('answers health, docs, sources, openapi, and metrics over HTTP', async () => {
    const [health, docs, sources, openapi, metrics] = await Promise.all([
      fetch(`${baseUrl}/health`),
      fetch(`${baseUrl}/docs`),
      fetch(`${baseUrl}/api/sources`),
      fetch(`${baseUrl}/openapi.json`),
      fetch(`${baseUrl}/metrics`),
    ]);

    expect(health.status).toBe(200);
    expect(docs.status).toBe(200);
    expect(sources.status).toBe(200);
    expect(openapi.status).toBe(200);
    expect(metrics.status).toBe(200);
    expect(metrics.headers.get('content-type')).toContain('text/plain');

    const metricsBody = await metrics.text();
    expect(metricsBody).toContain('usdata_http_requests_total{method="GET",route="/health"} 1');
    expect(metricsBody).toContain(
      'usdata_http_requests_total{method="GET",route="/api/sources"} 1'
    );
  });

  it('returns a clean JSON error for unknown routes', async () => {
    const res = await fetch(`${baseUrl}/nope`);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });
});
