import { describe, expect, it } from 'vitest';
import { createAiUsageLedger, estimateAiCost } from './aiUsage';

describe('estimateAiCost', () => {
  it('prices a known model', () => {
    const cost = estimateAiCost('gpt-4o-mini', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(cost.priced).toBe(true);
    expect(cost.usd).toBeCloseTo(0.75, 5);
  });

  it('reports an unknown model as unpriced rather than free', () => {
    const cost = estimateAiCost('local-llama', { inputTokens: 10_000, outputTokens: 10_000 });
    expect(cost.priced).toBe(false);
    expect(cost.usd).toBe(0);
  });
});

describe('createAiUsageLedger', () => {
  it('accumulates records and totals', () => {
    const ledger = createAiUsageLedger();
    ledger.record('gpt-4o-mini', { inputTokens: 1_000, outputTokens: 2_000 });
    ledger.record('gpt-4o-mini', { inputTokens: 500, outputTokens: 500 });

    const totals = ledger.totals();
    expect(totals.calls).toBe(2);
    expect(totals.inputTokens).toBe(1_500);
    expect(totals.outputTokens).toBe(2_500);
    expect(totals.fullyPriced).toBe(true);
    expect(ledger.records()).toHaveLength(2);
  });

  it('flags totals that include an unpriced model', () => {
    const ledger = createAiUsageLedger();
    ledger.record('gpt-4o-mini', { inputTokens: 1, outputTokens: 1 });
    ledger.record('mystery-model', { inputTokens: 1, outputTokens: 1 });
    expect(ledger.totals().fullyPriced).toBe(false);
  });

  it('clears on reset', () => {
    const ledger = createAiUsageLedger();
    ledger.record('gpt-4o-mini', { inputTokens: 1, outputTokens: 1 });
    ledger.reset();
    expect(ledger.totals().calls).toBe(0);
    expect(ledger.records()).toEqual([]);
  });
});
