import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AiCallError, createAiClient, type AiFetch } from './aiClient';
import type { AiConfig } from './aiConfig';
import { AiBudgetError } from './aiGuard';
import { createAiUsageLedger } from './aiUsage';

const testConfig: AiConfig = {
  baseUrl: 'http://localhost:11434/v1',
  apiKey: 'test-key',
  model: 'gpt-4o-mini',
  timeoutMs: 1_000,
  maxOutputTokens: 128,
  maxCostUsdPerRequest: 1,
  temperature: 0,
};

/** Build a fake JSON response without depending on a global `Response`. */
function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    body: null,
  } as unknown as Response;
}

/** Build a fake SSE response backed by a plain reader. */
function streamResponse(chunks: string[]): Response {
  let index = 0;
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
    body: {
      getReader: () => ({
        read: async () =>
          index < chunks.length
            ? { done: false, value: encoder.encode(chunks[index++]) }
            : { done: true, value: undefined },
      }),
    },
  } as unknown as Response;
}

/** A chat-completion body with text content and token usage. */
function completionBody(content: string, promptTokens = 100, completionTokens = 50) {
  return {
    model: 'gpt-4o-mini',
    choices: [{ message: { content } }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
  };
}

describe('generateText', () => {
  it('returns the text, the usage, and a priced cost', async () => {
    const ledger = createAiUsageLedger();
    const fetchImpl = vi.fn(async () =>
      jsonResponse(completionBody('Kia ora'))
    ) as unknown as AiFetch;
    const client = createAiClient(testConfig, { fetch: fetchImpl, ledger });

    const result = await client.generateText({ prompt: 'hi', promptHash: 'abc123' });

    expect(result.value).toBe('Kia ora');
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    expect(result.cost.priced).toBe(true);
    expect(result.cost.usd).toBeGreaterThan(0);
    expect(result.promptHash).toBe('abc123');
    expect(ledger.totals().calls).toBe(1);
  });

  it('throws AiCallError on a non-2xx answer', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 401)) as unknown as AiFetch;
    const client = createAiClient(testConfig, { fetch: fetchImpl });

    await expect(client.generateText({ prompt: 'hi' })).rejects.toThrow(AiCallError);
  });

  it('refuses a call whose estimated cost is over the cap', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(completionBody('big', 1_000_000, 1_000_000))
    ) as unknown as AiFetch;
    const client = createAiClient(
      { ...testConfig, maxCostUsdPerRequest: 0.0001 },
      { fetch: fetchImpl }
    );

    await expect(client.generateText({ prompt: 'hi' })).rejects.toThrow(AiBudgetError);
  });
});

describe('generateObject', () => {
  const schema = z.object({ title: z.string(), count: z.number() });

  it('parses JSON and validates it against the schema', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(completionBody('```json\n{"title":"Sheep","count":23}\n```'))
    ) as unknown as AiFetch;
    const client = createAiClient(testConfig, { fetch: fetchImpl });

    const result = await client.generateObject({ prompt: 'summarise', schema });

    expect(result.value).toEqual({ title: 'Sheep', count: 23 });
  });

  it('asks for a repair when the first answer fails validation', async () => {
    const answers = [
      completionBody('{"title":"Sheep"}'),
      completionBody('{"title":"Sheep","count":23}'),
    ];
    let call = 0;
    const fetchImpl = vi.fn(async () => jsonResponse(answers[call++])) as unknown as AiFetch;
    const client = createAiClient(testConfig, { fetch: fetchImpl });

    const result = await client.generateObject({ prompt: 'summarise', schema });

    expect(result.value.count).toBe(23);
    expect(result.usage.inputTokens).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws when the repairs run out', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(completionBody('not json at all'))
    ) as unknown as AiFetch;
    const client = createAiClient(testConfig, { fetch: fetchImpl });

    await expect(client.generateObject({ prompt: 'summarise', schema })).rejects.toThrow(
      AiCallError
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('streamText', () => {
  it('yields deltas and records the reported usage', async () => {
    const ledger = createAiUsageLedger();
    const fetchImpl = vi.fn(async () =>
      streamResponse([
        'data: {"choices":[{"delta":{"content":"Kia "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"ora"}}]}\n\n',
        'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":11,"completion_tokens":2}}\n\n',
        'data: [DONE]\n\n',
      ])
    ) as unknown as AiFetch;
    const client = createAiClient(testConfig, { fetch: fetchImpl, ledger });

    const parts: string[] = [];
    for await (const chunk of client.streamText({ prompt: 'hi' })) parts.push(chunk);

    expect(parts.join('')).toBe('Kia ora');
    expect(ledger.records()[0]).toMatchObject({ inputTokens: 11, outputTokens: 2 });
  });
});
