import { serve } from '@hono/node-server';

import { createConnectorsApp } from './index';
import type { ConnectorsAppOptions } from './index';
import { DEFAULT_RATE_LIMIT_OPTIONS } from './rateLimiter';

/**
 * Parses an optional positive integer env var, falling back to the default.
 *
 * @param value - Raw env value, or undefined when unset.
 * @param fallback - Value used when unset or invalid.
 * @returns A positive integer.
 */
function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

const port = Number(process.env.PORT ?? 8787);

const options: ConnectorsAppOptions = {};
if (process.env.CORS_ORIGIN !== undefined) {
  options.corsOrigin = process.env.CORS_ORIGIN;
}
if (process.env.SENTRY_DSN !== undefined) {
  options.sentryDsn = process.env.SENTRY_DSN;
}
options.rateLimit = {
  maxRequests: parsePositiveIntEnv(
    process.env.RATE_LIMIT_MAX,
    DEFAULT_RATE_LIMIT_OPTIONS.maxRequests
  ),
  windowMs: parsePositiveIntEnv(
    process.env.RATE_LIMIT_WINDOW_MS,
    DEFAULT_RATE_LIMIT_OPTIONS.windowMs
  ),
};

const app = createConnectorsApp(options);

serve({ fetch: app.fetch, port }, (info) => {
  process.stdout.write(`USA open data connectors listening on http://localhost:${info.port}\n`);
});
