import { describe, expect, it } from 'vitest';

import { createConnectorsApp } from './index';
import { OPEN_API_DOCUMENT } from './openapi';

type DocumentedPath = keyof typeof OPEN_API_DOCUMENT.paths;

/**
 * Returns the app's route paths, excluding middleware-only registrations.
 *
 * @param app - The built connectors app.
 * @returns Sorted route paths with ":id" params converted to "{id}".
 */
function registeredPaths(app: ReturnType<typeof createConnectorsApp>): string[] {
  return [...new Set(app.routes.map((route) => route.path))]
    .filter((path) => path !== '/api/*' && path !== '/*')
    .map((path) => path.replaceAll(':id', '{id}'))
    .sort();
}

/**
 * Returns the documented responses for one path.
 *
 * @param path - A path key from the OpenAPI document.
 * @returns The documented HTTP responses for that path.
 */
function documentedResponses(path: DocumentedPath): Record<string, unknown> {
  return OPEN_API_DOCUMENT.paths[path].get.responses;
}

describe('OpenAPI contract', () => {
  it('registers every app route in the OpenAPI document', () => {
    const app = createConnectorsApp({});
    const documented = new Set(Object.keys(OPEN_API_DOCUMENT.paths));

    for (const path of registeredPaths(app)) {
      expect(documented.has(path), `missing documented path ${path}`).toBe(true);
    }
  });

  it('registers every documented path in the app', () => {
    const app = createConnectorsApp({});
    const registered = new Set(registeredPaths(app));

    for (const path of Object.keys(OPEN_API_DOCUMENT.paths)) {
      expect(registered.has(path), `missing registered route ${path}`).toBe(true);
    }
  });

  it('documents the rate limit response on every /api path', () => {
    const apiPaths = (Object.keys(OPEN_API_DOCUMENT.paths) as DocumentedPath[]).filter((path) =>
      path.startsWith('/api/')
    );

    for (const path of apiPaths) {
      expect(Object.keys(documentedResponses(path)), `missing 429 response for ${path}`).toContain(
        '429'
      );
    }
  });

  it('documents error responses for routes that can fail', () => {
    expect(Object.keys(documentedResponses('/api/sources/{id}/probe'))).toEqual(
      expect.arrayContaining(['200', '400', '404', '429'])
    );
    expect(Object.keys(documentedResponses('/api/sources/{id}/data'))).toEqual(
      expect.arrayContaining(['200', '400', '404', '429', '502'])
    );
  });
});
