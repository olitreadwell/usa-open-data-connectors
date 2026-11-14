/**
 * Token and cost accounting for the AI seam.
 *
 * A feature that talks to a model has a bill attached, and the bill is not
 * visible from the code that calls it. This module turns a provider's token
 * counts into a number a route can log, cap, or report, so cost is something
 * the repo measures rather than something it discovers on an invoice.
 */

/** Token counts for a single model call, as reported by the provider. */
export interface AiTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** A cost estimate, with the flag that says whether a price was known. */
export interface AiCostEstimate {
  /** Estimated cost in US dollars. Zero when no price is known. */
  usd: number;
  /** False when the model is not in the price table. */
  priced: boolean;
}

/** One recorded call, with its cost and when it happened. */
export interface AiUsageRecord extends AiTokenUsage {
  model: string;
  usd: number;
  priced: boolean;
  /** Epoch milliseconds when the record was written. */
  at: number;
}

/** Rolling totals across every record in a ledger. */
export interface AiUsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  /** True only when every recorded call had a known price. */
  fullyPriced: boolean;
}

/** Mutable in-process accumulator; one per request, or one per process. */
export interface AiUsageLedger {
  /**
   * Record one call.
   *
   * @param model - Model identifier used for the call
   * @param usage - Token counts reported by the provider
   * @returns The stored record
   */
  record(model: string, usage: AiTokenUsage): AiUsageRecord;
  /**
   * @returns Totals across every record so far
   */
  totals(): AiUsageTotals;
  /**
   * @returns A copy of every record, oldest first
   */
  records(): readonly AiUsageRecord[];
  /**
   * Forget every record.
   */
  reset(): void;
}

/** US dollars per million tokens, keyed by model identifier. */
const MODEL_PRICE_TABLE: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

/**
 * Estimate the cost of one call from a model's published per-million prices.
 *
 * @param model - Model identifier
 * @param usage - Token counts for the call
 * @returns Cost in US dollars, and whether the model had a known price
 */
export function estimateAiCost(model: string, usage: AiTokenUsage): AiCostEstimate {
  const price = MODEL_PRICE_TABLE[model];
  if (!price) return { usd: 0, priced: false };
  const usd =
    (usage.inputTokens / 1_000_000) * price.input + (usage.outputTokens / 1_000_000) * price.output;
  return { usd, priced: true };
}

/**
 * Create an in-process usage ledger.
 *
 * @returns A ledger that accumulates records until `reset()` is called
 */
export function createAiUsageLedger(): AiUsageLedger {
  const records: AiUsageRecord[] = [];

  return {
    record(model, usage) {
      const cost = estimateAiCost(model, usage);
      const entry: AiUsageRecord = {
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        usd: cost.usd,
        priced: cost.priced,
        at: Date.now(),
      };
      records.push(entry);
      return entry;
    },
    totals() {
      return records.reduce<AiUsageTotals>(
        (totals, entry) => ({
          calls: totals.calls + 1,
          inputTokens: totals.inputTokens + entry.inputTokens,
          outputTokens: totals.outputTokens + entry.outputTokens,
          usd: totals.usd + entry.usd,
          fullyPriced: totals.fullyPriced && entry.priced,
        }),
        { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0, fullyPriced: true }
      );
    },
    records() {
      return [...records];
    },
    reset() {
      records.length = 0;
    },
  };
}
