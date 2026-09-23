import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { createRequestLogger, type LogWrite } from './logger';

function captureWrites(): { lines: string[]; write: LogWrite } {
  const lines: string[] = [];
  return {
    lines,
    write: (line: string) => {
      lines.push(line);
    },
  };
}

describe('createRequestLogger', () => {
  it('logs method, path, route pattern, status, and duration as JSON', async () => {
    const { lines, write } = captureWrites();
    const app = new Hono();
    app.use('*', createRequestLogger(write));
    app.get('/health', (c) => c.json({ ok: true }));

    await app.request('/health');

    expect(lines).toHaveLength(1);
    const event = JSON.parse(lines[0] ?? '');
    expect(event.event).toBe('http_request');
    expect(event.method).toBe('GET');
    expect(event.path).toBe('/health');
    expect(event.route).toBe('/health');
    expect(event.status).toBe(200);
    expect(event.level).toBe('info');
    expect(event.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof event.duration_ms).toBe('number');
  });

  it('uses the route pattern for parameterised routes', async () => {
    const { lines, write } = captureWrites();
    const app = new Hono();
    app.use('*', createRequestLogger(write));
    app.get('/api/sources/:id/probe', (c) => c.json({ ok: true }));

    await app.request('/api/sources/not-a-source/probe');

    const event = JSON.parse(lines[0] ?? '');
    expect(event.route).toBe('/api/sources/:id/probe');
    expect(event.path).toBe('/api/sources/not-a-source/probe');
  });

  it('logs errors at error level with status 500', async () => {
    const { lines, write } = captureWrites();
    const app = new Hono();
    app.use('*', createRequestLogger(write));
    app.onError((error, c) => {
      void error;
      return c.json({ error: 'internal_error' }, 500);
    });
    app.get('/boom', () => {
      throw new Error('boom');
    });

    const res = await app.request('/boom');

    expect(res.status).toBe(500);
    expect(lines).toHaveLength(1);
    const event = JSON.parse(lines[0] ?? '');
    expect(event.level).toBe('error');
    expect(event.status).toBe(500);
  });
});
