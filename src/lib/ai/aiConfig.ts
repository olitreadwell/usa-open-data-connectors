/**
 * Environment-driven configuration for the AI seam.
 *
 * The seam is off by default: with no `AI_API_KEY` set, `isAiConfigured()`
 * returns false and every AI call is expected to short-circuit. That keeps
 * `pnpm run check` green on a machine with no provider credentials.
 */

/** Anything that speaks the OpenAI chat-completions shape. */
export interface AiConfig {
  /** Base URL of the OpenAI-compatible API, without a trailing slash. */
  baseUrl: string;
  /** Secret used as a bearer token. Never logged, never returned to a client. */
  apiKey: string;
  /** Model identifier passed straight through to the provider. */
  model: string;
  /** Per-request wall clock budget in milliseconds. */
  timeoutMs: number;
  /** Hard ceiling on generated tokens for one call. */
  maxOutputTokens: number;
  /** Refuse a call whose estimated cost exceeds this many US dollars. */
  maxCostUsdPerRequest: number;
  /** Sampling temperature for generation. */
  temperature: number;
}

/** Raised when AI configuration is missing or malformed. */
export class AiConfigError extends Error {
  /**
   * @param message - What is wrong with the configuration
   */
  constructor(message: string) {
    super(message);
    this.name = 'AiConfigError';
  }
}

const DEFAULT_BASE_URL = 'https://ollama.com/v1';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1_024;
const DEFAULT_MAX_COST_USD_PER_REQUEST = 0.25;
const DEFAULT_TEMPERATURE = 0.2;

/**
 * Read a number from the environment, falling back when unset or unusable.
 *
 * @param raw - Raw environment value, possibly undefined
 * @param fallback - Value to use when `raw` is unset or not a usable number
 * @param minimum - Smallest value accepted, defaults to exclusive zero
 * @returns The parsed number, or the fallback
 */
function readEnvironmentNumber(
  raw: string | undefined,
  fallback: number,
  minimum = Number.MIN_VALUE
): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < minimum) return fallback;
  return parsed;
}

/**
 * Whether an AI provider is configured for this process.
 *
 * @param env - Environment to read, defaults to `process.env`
 * @returns True when an API key is present
 */
export function isAiConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.AI_API_KEY?.trim());
}

/**
 * Build the AI configuration from the environment.
 *
 * @param env - Environment to read, defaults to `process.env`
 * @returns A frozen configuration object
 * @throws AiConfigError when `AI_API_KEY` is missing
 */
export function readAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const apiKey = env.AI_API_KEY?.trim();
  if (!apiKey) {
    throw new AiConfigError('AI_API_KEY is not set; AI features stay disabled');
  }

  return Object.freeze({
    baseUrl: (env.AI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    apiKey,
    model: env.AI_MODEL?.trim() || 'gpt-oss:120b',
    timeoutMs: readEnvironmentNumber(env.AI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxOutputTokens: readEnvironmentNumber(env.AI_MAX_OUTPUT_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS),
    maxCostUsdPerRequest: readEnvironmentNumber(
      env.AI_MAX_COST_USD_PER_REQUEST,
      DEFAULT_MAX_COST_USD_PER_REQUEST
    ),
    temperature: readEnvironmentNumber(env.AI_TEMPERATURE, DEFAULT_TEMPERATURE, 0),
  });
}
