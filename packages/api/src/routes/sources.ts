import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { US_DATA_SOURCES, probeUsDataSource } from '@open-data-connectors/usa-sources';
import type { UsDataAdapter, UsFetchOptions } from '@open-data-connectors/usa-sources';

const sourceIdParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
});

/** Options for the source listing, probe, and data routes. */
export interface SourcesRouteOptions {
  apiKeys?: Record<string, string>;
  probeFn?: typeof probeUsDataSource;
  fetchImpl?: typeof globalThis.fetch;
}

/**
 * Finds one registered source adapter by id.
 *
 * @param id - The adapter id from the request path.
 * @returns The adapter, or undefined when no adapter has that id.
 */
function findUsDataSource(id: string): UsDataAdapter<unknown> | undefined {
  return US_DATA_SOURCES.find((source) => source.id === id);
}

/**
 * Builds the fetch options one adapter call needs.
 *
 * @param sourceId - The adapter id, used to pick a per-source key.
 * @param options - The route options holding the key map and fetch stub.
 * @returns An optional key plus an optional fetch implementation.
 */
function buildSourceFetchOptions(sourceId: string, options: SourcesRouteOptions): UsFetchOptions {
  const apiKey = options.apiKeys?.[sourceId];
  return {
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  };
}

/**
 * Routes that list, probe, and read the uniform US data source adapters.
 *
 * @param options - Optional API keys, a probe override, and a fetch stub.
 * @returns A Hono app with the source listing, probe, and data routes.
 */
export function createSourcesRoutes(options: SourcesRouteOptions = {}): Hono {
  const app = new Hono();
  const probeFn = options.probeFn ?? probeUsDataSource;

  app.get('/sources', (c) => {
    const sources = US_DATA_SOURCES.map((source) => ({
      id: source.id,
      name: source.name,
      auth: source.auth,
      description: source.description,
    }));
    return c.json(sources);
  });

  app.get('/sources/:id/probe', zValidator('param', sourceIdParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const adapter = findUsDataSource(id);
    if (adapter === undefined) {
      const NOT_FOUND = 404;
      return c.json({ error: `Unknown source: ${id}` }, NOT_FOUND);
    }
    const probe = await probeFn(adapter, buildSourceFetchOptions(adapter.id, options));
    return c.json(probe);
  });

  app.get('/sources/:id/data', zValidator('param', sourceIdParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const adapter = findUsDataSource(id);
    if (adapter === undefined) {
      const NOT_FOUND = 404;
      return c.json({ error: `Unknown source: ${id}` }, NOT_FOUND);
    }
    try {
      const data = await adapter.fetchLive(buildSourceFetchOptions(adapter.id, options));
      return c.json({ id: adapter.id, name: adapter.name, auth: adapter.auth, data });
    } catch (error) {
      const BAD_GATEWAY = 502;
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'upstream_failure', message }, BAD_GATEWAY);
    }
  });

  return app;
}
