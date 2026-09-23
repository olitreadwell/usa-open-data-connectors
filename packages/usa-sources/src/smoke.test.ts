import { describe, expect, it } from 'vitest';

import { US_DATA_SOURCES, probeAllUsDataSources } from './registry.js';

const RUN_SMOKE = process.env.RUN_SMOKE === '1';

// The live probe hits the BLS public API. It runs only when RUN_SMOKE=1, so
// the normal test run stays offline and inside the daily query budget.
describe.skipIf(!RUN_SMOKE)('live smoke', () => {
  it('every registered source answers a live request', async () => {
    const probes = await probeAllUsDataSources();
    for (const probe of probes) {
      expect(probe.ok, `${probe.id}: ${probe.status}`).toBe(true);
    }
    expect(probes).toHaveLength(US_DATA_SOURCES.length);
  }, 60_000);
});
