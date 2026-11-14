import { describe, expect, it } from 'vitest';
import { AiConfigError, isAiConfigured, readAiConfig } from './aiConfig';

/** Build a partial environment for the reader without touching `process.env`. */
function testEnv(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as unknown as NodeJS.ProcessEnv;
}

describe('isAiConfigured', () => {
  it('is false without a key', () => {
    expect(isAiConfigured(testEnv({}))).toBe(false);
    expect(isAiConfigured(testEnv({ AI_API_KEY: '   ' }))).toBe(false);
  });

  it('is true with a key', () => {
    expect(isAiConfigured(testEnv({ AI_API_KEY: 'k' }))).toBe(true);
  });
});

describe('readAiConfig', () => {
  it('throws when the key is missing', () => {
    expect(() => readAiConfig(testEnv({}))).toThrow(AiConfigError);
  });

  it('falls back to the Ollama-compatible defaults', () => {
    const config = readAiConfig(testEnv({ AI_API_KEY: 'k' }));
    expect(config.baseUrl).toBe('https://ollama.com/v1');
    expect(config.model).toBe('gpt-oss:120b');
    expect(config.timeoutMs).toBe(30_000);
    expect(config.maxOutputTokens).toBe(1_024);
    expect(config.maxCostUsdPerRequest).toBe(0.25);
    expect(config.temperature).toBe(0.2);
  });

  it('reads overrides and trims a trailing slash from the base URL', () => {
    const config = readAiConfig(
      testEnv({
        AI_API_KEY: 'k',
        AI_BASE_URL: 'http://localhost:11434/v1/',
        AI_MODEL: 'llama3.2',
        AI_TIMEOUT_MS: '5000',
        AI_MAX_OUTPUT_TOKENS: '256',
        AI_MAX_COST_USD_PER_REQUEST: '0.01',
        AI_TEMPERATURE: '0',
      })
    );
    expect(config.baseUrl).toBe('http://localhost:11434/v1');
    expect(config.model).toBe('llama3.2');
    expect(config.timeoutMs).toBe(5_000);
    expect(config.maxOutputTokens).toBe(256);
    expect(config.maxCostUsdPerRequest).toBe(0.01);
    expect(config.temperature).toBe(0);
  });

  it('ignores unusable numbers instead of throwing', () => {
    const config = readAiConfig(
      testEnv({
        AI_API_KEY: 'k',
        AI_TIMEOUT_MS: 'soon',
        AI_MAX_OUTPUT_TOKENS: '-5',
        AI_TEMPERATURE: 'warm',
      })
    );
    expect(config.timeoutMs).toBe(30_000);
    expect(config.maxOutputTokens).toBe(1_024);
    expect(config.temperature).toBe(0.2);
  });
});
