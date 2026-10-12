import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSessionCost, formatCost } from '../src/cost.ts';
import type { TokenUsage } from '../src/cost.ts';

describe('calculateSessionCost', () => {
  it('returns null when modelId is not present in RATES', () => {
    const usage: TokenUsage = {
      uncachedInputTokens: 1000,
      cacheReadTokens: 5000,
      outputTokens: 200,
    };
    const result = calculateSessionCost(usage, 'unknown-model');
    assert.equal(result, null);
  });

  it('calculates cost breakdown and total for deepseek-flash', () => {
    const usage: TokenUsage = {
      uncachedInputTokens: 1_000_000,
      cacheReadTokens: 10_000_000,
      outputTokens: 500_000,
    };
    const result = calculateSessionCost(usage, 'deepseek-flash');
    assert.notEqual(result, null);
    assert.equal(result.missCost, 0.14);
    assert.equal(result.hitCost, 0.14);
    assert.equal(result.outCost, 0.14);
    assert.ok(Math.abs(result.totalCost - 0.42) < 1e-9);
  });
});

describe('formatCost', () => {
  it('formats zero cost as $0.00', () => {
    assert.equal(formatCost(0), '$0.00');
  });

  it('formats tiny nonzero cost as <$0.01', () => {
    assert.equal(formatCost(0.0004), '<$0.01');
  });

  it('formats normal cost as $X.XX', () => {
    assert.equal(formatCost(0.42), '$0.42');
    assert.equal(formatCost(1.5), '$1.50');
  });
});
