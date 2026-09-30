import { routePath } from 'hono/route';
import type { MiddlewareHandler } from 'hono';

/** Counts HTTP requests per method and route pattern. */
export interface RequestMetrics {
  increment(method: string, route: string): void;
  reset(): void;
  snapshot(): Map<string, number>;
}

/** Creates an in-memory request counter. State resets on restart. */
export function createMetricsCounter(): RequestMetrics {
  const counts = new Map<string, number>();
  return {
    increment(method, route) {
      const key = `${method} ${route}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    },
    reset() {
      counts.clear();
    },
    snapshot() {
      return new Map(counts);
    },
  };
}

/** Renders request counts as Prometheus text format, sorted by route. */
export function renderPrometheusMetrics(metrics: RequestMetrics): string {
  const entries = [...metrics.snapshot().entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length === 0) {
    return '';
  }
  const lines = entries.map(([key, count]) => {
    const separatorIndex = key.indexOf(' ');
    const method = key.slice(0, separatorIndex);
    const route = key.slice(separatorIndex + 1);
    return `usdata_http_requests_total{method="${method}",route="${route}"} ${count}`;
  });
  return `${lines.join('\n')}\n`;
}

/** Counts every request that passes through the app. */
export function createMetricsMiddleware(metrics: RequestMetrics): MiddlewareHandler {
  return async (c, next) => {
    await next();
    metrics.increment(c.req.method, routePath(c, -1));
  };
}
