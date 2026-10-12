import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

// Load client module via simulated __ModuleLoader__
let pluginModule: any = null;
const mockWindow: any = {
  __ModuleLoader__: {
    load(config: any) {
      pluginModule = config.factory((name: string) => {
        if (name === 'react') return React;
        throw new Error(`Unexpected require: ${name}`);
      });
    },
  },
};
(globalThis as any).window = mockWindow;

await import('./client.js');

const { RATES, calculateSessionCost, formatCost, CostPill, isPeak } = pluginModule;

describe('isPeak', () => {
  // Peak is 01:00-04:00 and 06:00-10:00 UTC, Monday-Friday. 2026-10-12 is a Monday.
  const monday = (hour: number, minute = 0) => Date.UTC(2026, 9, 12, hour, minute);

  it('is peak inside the 01:00-04:00 UTC window on a weekday', () => {
    assert.equal(isPeak(monday(2)), true);
  });

  it('is peak inside the 06:00-10:00 UTC window on a weekday', () => {
    assert.equal(isPeak(monday(7)), true);
  });

  it('is off-peak in the 04:00-06:00 UTC gap between windows', () => {
    assert.equal(isPeak(monday(5)), false);
  });

  it('is off-peak just before the first window opens', () => {
    assert.equal(isPeak(monday(0, 59)), false);
  });

  it('treats both window edges as exclusive at the end', () => {
    assert.equal(isPeak(monday(1)), true);
    assert.equal(isPeak(monday(4)), false);
    assert.equal(isPeak(monday(6)), true);
    assert.equal(isPeak(monday(10)), false);
  });

  it('is off-peak all weekend', () => {
    assert.equal(isPeak(Date.UTC(2026, 9, 17, 2)), false); // Saturday
    assert.equal(isPeak(Date.UTC(2026, 9, 18, 7)), false); // Sunday
  });
});

describe('calculateSessionCost', () => {
  it('returns null when modelId is not present in RATES', () => {
    const usage = {
      uncachedInputTokens: 1000,
      cacheReadTokens: 5000,
      outputTokens: 200,
    };
    const result = calculateSessionCost(usage, 'unknown-model');
    assert.equal(result, null);
  });

  it('calculates cost breakdown and total for deepseek-flash', () => {
    const usage = {
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
    assert.equal(element.type, 'span');
    assert.equal(element.props['data-composer-stat'], 'cost');
    assert.equal(element.props.children, '💸 $0.42');
    assert.match(element.props.title, /Estimated Spend: \$0\.42/);
    assert.match(element.props.title, /Input: \$0\.1400/);
    assert.match(element.props.title, /Cache Read: \$0\.1400/);
    assert.match(element.props.title, /Output: \$0\.1400/);
    assert.match(element.props.style.background, /oklch/);
    assert.match(element.props.style.border, /oklch/);
    assert.equal(element.props.style.gap, '0.35rem');
  });
});

describe('browser bundle registration', () => {
  it('registers factory into window.__ModuleLoader__ and attaches to conversation.composer.dock', () => {
    assert.deepEqual(pluginModule.inject, ['slots']);
    assert.equal(typeof pluginModule.apply, 'function');

    const registeredEntries: any[] = [];
    const fakeCtx = {
      slots: {
        inject(slotName: string, thunk: () => void) {
          assert.equal(slotName, 'conversation.composer.dock');
          thunk();
        },
        register(opts: any, component: any) {
          registeredEntries.push({ opts, component });
        },
      },
    };

    pluginModule.apply(fakeCtx);
    assert.equal(registeredEntries.length, 1);
    assert.equal(registeredEntries[0].opts.name, 'conversation.composer.dock');
    assert.equal(registeredEntries[0].opts.id, 'cost-pill');
    assert.equal(registeredEntries[0].opts.order, 2);
    assert.equal(typeof registeredEntries[0].component, 'function');
  });
});
