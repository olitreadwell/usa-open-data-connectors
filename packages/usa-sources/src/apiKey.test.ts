import { describe, expect, it } from 'vitest';

import { normalizeSourceApiKey } from './apiKey.js';

describe('normalizeSourceApiKey', () => {
  it('passes a real key through, trimmed', () => {
    expect(normalizeSourceApiKey('  secret-key  ')).toBe('secret-key');
  });

  it('treats an unset key as absent', () => {
    expect(normalizeSourceApiKey(undefined)).toBeUndefined();
  });

  it('treats an empty key as absent', () => {
    expect(normalizeSourceApiKey('')).toBeUndefined();
  });

  it('treats a whitespace-only key as absent', () => {
    expect(normalizeSourceApiKey('   ')).toBeUndefined();
  });
});
