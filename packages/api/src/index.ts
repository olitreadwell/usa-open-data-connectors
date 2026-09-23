import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { swaggerUI } from '@hono/swagger-ui';

import { probeUsDataSource } from '@open-data-connectors/usa-sources';

import { OPEN_API_DOCUMENT } from './openapi';
import { createErrorTracker } from './errorTracking';
import { createRequestLogger, defaultLogWrite, writeLogEvent, type LogWrite } from './logger';
import {
  createMetricsCounter,
  createMetricsMiddleware,
  renderPrometheusMetrics,
  type RequestMetrics,
} from './metrics';
import {
  createRateLimiter,
  DEFAULT_RATE_LIMIT_OPTIONS,
  type RateLimiterOptions,
} from './rateLimiter';
import { createSourcesRoutes } from './routes/sources';

/** Options for building the connectors app. */
export interface ConnectorsAppOptions {
  apiKeys?: Record<string, string>;
  probeFn?: typeof probeUsDataSource;
  sentryDsn?: string;
  logWrite?: LogWrite;
  metrics?: RequestMetrics;
  /** Allowed cross-origin origin for /api routes. Defaults to "*". */
  corsOrigin?: string;
  /** Per-IP request budget for /api routes. Defaults to 60 requests/minute. */
  rateLimit?: RateLimiterOptions;
}

/**
 * Builds the connectors app. Keys are read from options, never from callers.
 *
 * @param options - Optional keys, client overrides, and observability hooks.
 * @returns A configured Hono app.
 */
export function createConnectorsApp(options: ConnectorsAppOptions = {}): Hono {
  const app = new Hono();
  const logWrite = options.logWrite ?? defaultLogWrite;
  const metrics = options.metrics ?? createMetricsCounter();
  const errorTracker = createErrorTracker(options.sentryDsn);

  app.use('*', createRequestLogger(logWrite));
  app.use('*', createMetricsMiddleware(metrics));
  app.use('/api/*', cors({ origin: options.corsOrigin ?? '*' }));
  app.use('/api/*', createRateLimiter(options.rateLimit ?? DEFAULT_RATE_LIMIT_OPTIONS));
  app.get('/health', (c) => c.json({ ok: true, name: 'usa-open-data-connectors' }));
  app.get('/openapi.json', (c) => c.json(OPEN_API_DOCUMENT));
  app.get('/docs', swaggerUI({ url: '/openapi.json' }));
  app.get('/metrics', (c) => c.text(renderPrometheusMetrics(metrics)));
  const sourcesOptions: {
    apiKeys?: Record<string, string>;
    probeFn?: typeof probeUsDataSource;
  } = {};
  if (options.apiKeys !== undefined) {
    sourcesOptions.apiKeys = options.apiKeys;
  }
  if (options.probeFn !== undefined) {
    sourcesOptions.probeFn = options.probeFn;
  }
  app.route('/api', createSourcesRoutes(sourcesOptions));
  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  app.onError((error, c) => {
    const message = error instanceof Error ? error.message : String(error);
    errorTracker.report(error, { path: c.req.path });
    writeLogEvent(
      {
        ts: new Date().toISOString(),
        level: 'error',
        event: 'unhandled_error',
        path: c.req.path,
        message,
      },
      logWrite
    );
    return c.json({ error: 'internal_error' }, 500);
  });
  return app;
}
