import { describe, expect, it } from 'vitest';

import { probeAllNzDataSources } from './registry.js';

const RUN_SMOKE = process.env.RUN_SMOKE === '1';

/** Maps an env var to the adapter id that accepts it as an optional key. */
const OPTIONAL_KEY_SOURCE_ENV: Record<string, string> = {
  LINZ_API_KEY: 'linz',
};

/**
 * Adapter ids skipped in the live probe. The data.govt.nz catalogue blocks
 * non-NZ IPs at the CDN (GitHub Actions runners get an HTML error page), so
 * it is verified by the committed fixture instead.
 */
const GEO_BLOCKED_SOURCE_IDS = new Set(['data-govt-nz', 'data-govt-datastore', 'lawa']);

/**
 * Adapter ids whose upstream service has gone away, with the date the probe
 * first failed. NZOR's hosts (nzor.org.nz, data.nzor.org.nz) have failed the
 * TLS handshake with "unexpected eof while reading" since 2026-09-21, from
 * this machine and from Actions runners. The adapter stays for its
 * committed fixture.
 */
const RETIRED_SOURCE_IDS = new Set(['nzor']);

describe.skipIf(!RUN_SMOKE)('live access smoke test', () => {
  it('reaches every keyless source and verifies optional-key sources with keys', async () => {
    const apiKeys = Object.fromEntries(
      Object.entries(OPTIONAL_KEY_SOURCE_ENV)
        .filter(([envName]) => process.env[envName] !== undefined)
        .map(([envName, sourceId]) => [sourceId, process.env[envName] ?? ''])
    );
    const probes = await probeAllNzDataSources({
      ...(Object.keys(apiKeys).length > 0 ? { apiKeys } : {}),
    });
    for (const probe of probes) {
      if (GEO_BLOCKED_SOURCE_IDS.has(probe.id) || RETIRED_SOURCE_IDS.has(probe.id)) {
        continue;
      }
      expect(probe.ok, `${probe.name}: ${probe.status}`).toBe(true);
      if (apiKeys[probe.id] !== undefined) {
        expect(probe.ok, `${probe.name} (keyed): ${probe.status}`).toBe(true);
      }
    }
  });
});
