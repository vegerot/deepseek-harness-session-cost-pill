import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { CostPill } from '../src/pill.ts';

describe('CostPill', () => {
  it('returns null when useProjection is missing', () => {
    const element = CostPill({});
    assert.equal(element, null);
  });

  it('returns null when tokenUsage has 0 tokens', () => {
    const mockUseProjection = (key: string) => {
      if (key === 'tokenUsage') {
        return { uncachedInputTokens: 0, cacheReadTokens: 0, outputTokens: 0 };
      }
      if (key === 'modelSelection') {
        return { lastUsed: { model: 'deepseek-flash' } };
      }
      return undefined;
    };
    const element = CostPill({ useProjection: mockUseProjection });
    assert.equal(element, null);
  });

  it('returns null when modelId is not in RATES', () => {
    const mockUseProjection = (key: string) => {
      if (key === 'tokenUsage') {
        return { uncachedInputTokens: 1000, cacheReadTokens: 5000, outputTokens: 200 };
      }
      if (key === 'modelSelection') {
        return { lastUsed: { model: 'unknown-model' } };
      }
      return undefined;
    };
    const element = CostPill({ useProjection: mockUseProjection });
    assert.equal(element, null);
  });

  it('renders cost pill with semantic styling and breakdown for valid tokens', () => {
    const mockUseProjection = (key: string) => {
      if (key === 'tokenUsage') {
        return {
          uncachedInputTokens: 1_000_000,
          cacheReadTokens: 10_000_000,
          outputTokens: 500_000,
        };
      }
      if (key === 'modelSelection') {
        return { lastUsed: { model: 'deepseek-flash' } };
      }
      return undefined;
    };
    const element = CostPill({ useProjection: mockUseProjection });
    assert.notEqual(element, null);
    assert.equal(element?.type, 'span');
    assert.equal(element?.props['data-composer-stat'], 'cost');
    assert.equal(element?.props.children, '💸 $0.42');
    assert.match(element?.props.title, /Estimated Spend: \$0\.42/);
    assert.match(element?.props.title, /Input: \$0\.1400/);
    assert.match(element?.props.title, /Cache Read: \$0\.1400/);
    assert.match(element?.props.title, /Output: \$0\.1400/);
    assert.match(element?.props.style.background, /oklch/);
    assert.match(element?.props.style.border, /oklch/);
    assert.equal(element?.props.style.gap, '0.35rem');
  });
});
