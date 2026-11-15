import { describe, expect, it } from 'vitest';

import { US_DATA_SOURCES, getUsSourceMetadata } from './registry.js';

describe('US source metadata', () => {
  it('gives every registered adapter a licence and attribution', () => {
    for (const source of US_DATA_SOURCES) {
      const metadata = getUsSourceMetadata(source.id);
      expect(metadata).toBeDefined();
      expect(metadata?.licence.trim().length).toBeGreaterThan(0);
      expect(metadata?.attribution.trim().length).toBeGreaterThan(0);
    }
  });

  it('records the federal public-domain licence and publisher for BLS', () => {
    expect(getUsSourceMetadata('bls-unemployment-rate')).toEqual({
      licence: 'Public domain in the US (17 U.S.C. 105)',
      attribution: 'Bureau of Labor Statistics',
    });
  });

  it('records portal entry terms for the Socrata catalogue', () => {
    const metadata = getUsSourceMetadata('cdc-socrata-catalogue');
    expect(metadata?.licence).toContain('Per-entry portal terms');
    expect(metadata?.attribution).toBe('Centers for Disease Control and Prevention');
  });

  it('returns undefined for an unknown id', () => {
    expect(getUsSourceMetadata('not-a-source')).toBeUndefined();
  });
});
