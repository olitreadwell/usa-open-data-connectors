import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { createRateLimiter, resolveClientIp, type RateLimiterOptions } from './rateLimiter';

function createRateLimiterApp(options: RateLimiterOptions): Hono {
  const app = new Hono();
  app.use('/api/*', createRateLimiter(options));
  app.get('/api/thing', (c) => c.json({ ok: true }));
  return app;
}

function withClientIp(ip: string): HeadersInit {
  return { 'x-forwarded-for': ip };
}

describe('createRateLimiter', () => {
  it('rejects requests beyond the per-window budget', async () => {
    const app = createRateLimiterApp({ maxRequests: 2, windowMs: 60_000 });
    const first = await app.request('/api/thing', {
      headers: withClientIp('1.2.3.4'),
    });
    const second = await app.request('/api/thing', {
      headers: withClientIp('1.2.3.4'),
    });
    const third = await app.request('/api/thing', {
      headers: withClientIp('1.2.3.4'),
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.headers.get('retry-after')).toBe('60');
    expect(await third.json()).toEqual({ error: 'rate_limited' });
  });

  it('counts each client separately', async () => {
    const app = createRateLimiterApp({ maxRequests: 2, windowMs: 60_000 });

    await app.request('/api/thing', { headers: withClientIp('1.2.3.4') });
    await app.request('/api/thing', { headers: withClientIp('1.2.3.4') });
    const limited = await app.request('/api/thing', {
      headers: withClientIp('1.2.3.4'),
    });
    const otherClient = await app.request('/api/thing', {
      headers: withClientIp('5.6.7.8'),
    });

    expect(limited.status).toBe(429);
    expect(otherClient.status).toBe(200);
  });

  it('resets the budget when the window elapses', async () => {
    const app = createRateLimiterApp({ maxRequests: 2, windowMs: 20 });
    await app.request('/api/thing', { headers: withClientIp('1.2.3.4') });
    await app.request('/api/thing', { headers: withClientIp('1.2.3.4') });
    const limited = await app.request('/api/thing', {
      headers: withClientIp('1.2.3.4'),
    });

    expect(limited.status).toBe(429);

    await new Promise((resolve) => setTimeout(resolve, 30));
    const afterWindow = await app.request('/api/thing', {
      headers: withClientIp('1.2.3.4'),
    });
    expect(afterWindow.status).toBe(200);
  });

  it('purges expired windows when a new client arrives', async () => {
    const app = createRateLimiterApp({ maxRequests: 2, windowMs: 20 });
    await app.request('/api/thing', { headers: withClientIp('1.2.3.4') });
    await app.request('/api/thing', { headers: withClientIp('1.2.3.4') });

    await new Promise((resolve) => setTimeout(resolve, 30));

    const newClient = await app.request('/api/thing', {
      headers: withClientIp('5.6.7.8'),
    });
    const oldClientAgain = await app.request('/api/thing', {
      headers: withClientIp('1.2.3.4'),
    });

    expect(newClient.status).toBe(200);
    expect(oldClientAgain.status).toBe(200);
  });
});

describe('resolveClientIp', () => {
  it('reads the first X-Forwarded-For entry', async () => {
    const app = new Hono();
    app.get('/ip', (c) => c.json({ ip: resolveClientIp(c) }));

    const res = await app.request('/ip', {
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    });
    expect(await res.json()).toEqual({ ip: '203.0.113.7' });
  });

  it('falls back to unknown without a socket or header', async () => {
    const app = new Hono();
    app.get('/ip', (c) => c.json({ ip: resolveClientIp(c) }));

    const res = await app.request('/ip');
    expect(await res.json()).toEqual({ ip: 'unknown' });
  });
});
