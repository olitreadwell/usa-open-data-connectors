/**
 * A small OpenAI-compatible client for the AI seam.
 *
 * Deliberately dependency-free: the template should not pick a vendor SDK for
 * every project. Anything that answers `POST {baseUrl}/chat/completions`
 * works, which covers OpenAI, Ollama, vLLM, OpenRouter, Groq and most hosted
 * gateways, so a project can change provider without changing its code.
 *
 * Every call records its tokens in the ledger and refuses to run when the
 * estimate is over the configured cost cap.
 */

import { z } from 'zod';
import { readAiConfig, type AiConfig } from './aiConfig';
import { assertWithinRequestBudget } from './aiGuard';
import {
  createAiUsageLedger,
  estimateAiCost,
  type AiCostEstimate,
  type AiTokenUsage,
  type AiUsageLedger,
} from './aiUsage';

/** Provider failure: non-2xx, unreadable body, or unusable output. */
export class AiCallError extends Error {
  /** HTTP status when the provider answered, otherwise null. */
  status: number | null;

  /**
   * @param message - What went wrong, safe to log
   * @param status - HTTP status from the provider when there was one
   */
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'AiCallError';
    this.status = status;
  }
}

/** One finished call, with what it cost and how long it took. */
export interface AiCompletion<TValue> {
  value: TValue;
  model: string;
  usage: AiTokenUsage;
  cost: AiCostEstimate;
  latencyMs: number;
  /** Fingerprint of the prompt definition, when the caller passed one. */
  promptHash?: string;
}

/** A plain-text generation request. */
export interface AiTextRequest {
  prompt: string;
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  promptHash?: string;
}

/** A generation request whose output must satisfy a zod schema. */
export interface AiObjectRequest<TSchema extends z.ZodType> extends AiTextRequest {
  schema: TSchema;
  /** Extra attempts allowed when the first answer fails validation; default 1. */
  repairAttempts?: number;
}

/** The seam's surface. Swap the implementation in tests, keep the calls. */
export interface AiClient {
  /**
   * Generate plain text.
   *
   * @param request - Prompt, optional system message, and limits
   * @returns The text and its accounting
   */
  generateText(request: AiTextRequest): Promise<AiCompletion<string>>;
  /**
   * Generate an object validated against a zod schema.
   *
   * @param request - Prompt plus the schema the answer must satisfy
   * @returns The parsed value and its accounting
   */
  generateObject<TSchema extends z.ZodType>(
    request: AiObjectRequest<TSchema>
  ): Promise<AiCompletion<z.infer<TSchema>>>;
  /**
   * Stream plain text, one delta at a time.
   *
   * @param request - Prompt, optional system message, and limits
   * @returns An async generator of text chunks
   */
  streamText(request: AiTextRequest): AsyncGenerator<string>;
}

/** Injectable transport, so tests never touch the network. */
export type AiFetch = (url: string, init: RequestInit) => Promise<Response>;

/** Optional collaborators for `createAiClient`. */
export interface AiClientOptions {
  fetch?: AiFetch;
  ledger?: AiUsageLedger;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const JSON_ONLY_INSTRUCTION =
  'Reply with a single JSON object and nothing else. No prose, no code fence.';

/**
 * Build the AI client.
 *
 * @param config - Provider configuration, defaults to the environment
 * @param options - Injectable fetch and usage ledger, for tests
 * @returns An `AiClient` bound to that provider
 * @throws AiConfigError when no API key is configured
 */
export function createAiClient(
  config: AiConfig = readAiConfig(),
  options: AiClientOptions = {}
): AiClient {
  const transport = options.fetch ?? ((url, init) => fetch(url, init));
  const ledger = options.ledger ?? createAiUsageLedger();

  function readUsage(body: ChatCompletionResponse): AiTokenUsage {
    return {
      inputTokens: body.usage?.prompt_tokens ?? 0,
      outputTokens: body.usage?.completion_tokens ?? 0,
    };
  }

  function account(usage: AiTokenUsage, startedAt: number, promptHash?: string) {
    const cost = estimateAiCost(config.model, usage);
    assertWithinRequestBudget(cost.usd, config.maxCostUsdPerRequest);
    ledger.record(config.model, usage);
    const completion = {
      model: config.model,
      usage,
      cost,
      latencyMs: Date.now() - startedAt,
      ...(promptHash ? { promptHash } : {}),
    };
    return completion;
  }

  async function postChat(
    body: Record<string, unknown>,
    signal: AbortSignal | undefined
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);

    try {
      const response = await transport(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new AiCallError(`provider responded ${response.status}`, response.status);
      }
      return response;
    } catch (error) {
      if (error instanceof AiCallError) throw error;
      if (controller.signal.aborted) {
        throw new AiCallError(`provider call exceeded ${config.timeoutMs}ms`);
      }
      throw new AiCallError(error instanceof Error ? error.message : 'provider call failed');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  async function readChatBody(response: Response): Promise<ChatCompletionResponse> {
    try {
      return (await response.json()) as ChatCompletionResponse;
    } catch {
      throw new AiCallError('provider returned a body that is not JSON', response.status);
    }
  }

  function firstMessageContent(body: ChatCompletionResponse): string {
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      throw new AiCallError('provider returned no message content');
    }
    return content;
  }

  function stripCodeFence(text: string): string {
    const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    return fenced?.[1] ?? text.trim();
  }

  return {
    async generateText(request) {
      const startedAt = Date.now();
      const messages: ChatMessage[] = [
        ...(request.system ? [{ role: 'system' as const, content: request.system }] : []),
        { role: 'user' as const, content: request.prompt },
      ];
      const response = await postChat(
        {
          model: config.model,
          messages,
          max_tokens: request.maxOutputTokens ?? config.maxOutputTokens,
          temperature: request.temperature ?? config.temperature,
        },
        request.signal
      );
      const body = await readChatBody(response);
      const text = firstMessageContent(body);
      return { value: text, ...account(readUsage(body), startedAt, request.promptHash) };
    },

    async generateObject(request) {
      const startedAt = Date.now();
      const attempts = (request.repairAttempts ?? 1) + 1;
      const schemaJson = JSON.stringify(z.toJSONSchema(request.schema));
      const system = [request.system, JSON_ONLY_INSTRUCTION, `Schema: ${schemaJson}`]
        .filter(Boolean)
        .join('\n\n');
      const messages: ChatMessage[] = [
        { role: 'system', content: system },
        { role: 'user', content: request.prompt },
      ];
      const usage: AiTokenUsage = { inputTokens: 0, outputTokens: 0 };

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const response = await postChat(
          {
            model: config.model,
            messages,
            max_tokens: request.maxOutputTokens ?? config.maxOutputTokens,
            temperature: request.temperature ?? config.temperature,
            response_format: { type: 'json_object' },
          },
          request.signal
        );
        const body = await readChatBody(response);
        const turn = readUsage(body);
        usage.inputTokens += turn.inputTokens;
        usage.outputTokens += turn.outputTokens;
        const text = firstMessageContent(body);

        let parsed: unknown;
        try {
          parsed = JSON.parse(stripCodeFence(text));
        } catch {
          parsed = undefined;
        }
        const result = request.schema.safeParse(parsed);
        if (result.success) {
          return {
            value: result.data,
            ...account(usage, startedAt, request.promptHash),
          };
        }
        if (attempt < attempts - 1) {
          messages.push({ role: 'assistant', content: text });
          messages.push({
            role: 'user',
            content: `That failed validation: ${result.error.issues
              .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
              .join('; ')}. Return corrected JSON only.`,
          });
        } else {
          throw new AiCallError(
            `model output failed schema validation after ${attempts} attempt(s): ${result.error.issues
              .map((issue) => issue.message)
              .join('; ')}`
          );
        }
      }

      throw new AiCallError('generateObject exhausted its attempts without a value');
    },

    async *streamText(request) {
      const startedAt = Date.now();
      const messages: ChatMessage[] = [
        ...(request.system ? [{ role: 'system' as const, content: request.system }] : []),
        { role: 'user' as const, content: request.prompt },
      ];
      const response = await postChat(
        {
          model: config.model,
          messages,
          max_tokens: request.maxOutputTokens ?? config.maxOutputTokens,
          temperature: request.temperature ?? config.temperature,
          stream: true,
          stream_options: { include_usage: true },
        },
        request.signal
      );
      const reader = response.body?.getReader();
      if (!reader) throw new AiCallError('provider returned no response body to stream');

      const decoder = new TextDecoder();
      const usage: AiTokenUsage = { inputTokens: 0, outputTokens: 0 };
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          let chunk: ChatCompletionResponse & {
            choices?: Array<{ delta?: { content?: string | null } }>;
          };
          try {
            chunk = JSON.parse(payload) as typeof chunk;
          } catch {
            continue;
          }
          if (chunk.usage) {
            usage.inputTokens = chunk.usage.prompt_tokens ?? usage.inputTokens;
            usage.outputTokens = chunk.usage.completion_tokens ?? usage.outputTokens;
          }
          const delta = chunk.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta !== '') yield delta;
        }
      }

      account(usage, startedAt, request.promptHash);
    },
  };
}
