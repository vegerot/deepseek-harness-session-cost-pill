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

const { RATES, costOfUsage, calculateSessionCost, formatCost, CostPill, isPeak } = pluginModule;

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

// One million of each bucket makes the per-1M rate directly readable as dollars.
const millionEach = {
  uncachedInputTokens: 1_000_000,
  cacheReadTokens: 1_000_000,
  outputTokens: 1_000_000,
};
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${actual} ≈ ${expected}`);
// 2026-10-12 is a Monday; 02:00 UTC is peak, 05:00 UTC is off-peak.
const PEAK_AT = Date.UTC(2026, 9, 12, 2);
const OFF_PEAK_AT = Date.UTC(2026, 9, 12, 5);
const step = (at: number, usage?: object) => ({ kind: 'assistant', time: at, usage });

describe('costOfUsage', () => {
  it('returns null when modelId is not present in RATES', () => {
    assert.equal(costOfUsage(millionEach, 'unknown-model', false), null);
  });

  it('prices deepseek-flash at its published off-peak rates', () => {
    const result = costOfUsage(millionEach, 'deepseek-flash', false);
    assert.notEqual(result, null);
    close(result!.hitCost, 0.003);
    close(result!.missCost, 0.15);
    close(result!.outCost, 0.6);
    close(result!.totalCost, 0.753);
  });

  it('prices deepseek-flash at exactly double during peak', () => {
    const result = costOfUsage(millionEach, 'deepseek-flash', true);
    assert.notEqual(result, null);
    close(result!.hitCost, 0.006);
    close(result!.missCost, 0.3);
    close(result!.outCost, 1.2);
  });

  it('prices deepseek-v4-pro at its published rates', () => {
    const off = costOfUsage(millionEach, 'deepseek-v4-pro', false);
    assert.notEqual(off, null);
    close(off!.hitCost, 0.022);
    close(off!.missCost, 0.66);
    close(off!.outCost, 1.98);

    const peak = costOfUsage(millionEach, 'deepseek-v4-pro', true);
    assert.notEqual(peak, null);
    close(peak!.hitCost, 0.044);
    close(peak!.missCost, 1.32);
    close(peak!.outCost, 3.96);
  });

  it('carries no rate for the retired chat and reasoner aliases', () => {
    assert.equal(costOfUsage(millionEach, 'deepseek-chat', false), null);
    assert.equal(costOfUsage(millionEach, 'deepseek-reasoner', false), null);
  });
});

describe('calculateSessionCost', () => {
  it('returns null when no step reports billable usage', () => {
    assert.equal(calculateSessionCost([], 'deepseek-flash'), null);
    assert.equal(calculateSessionCost([step(OFF_PEAK_AT, undefined)], 'deepseek-flash'), null);
    assert.equal(
      calculateSessionCost([step(OFF_PEAK_AT, { uncachedInputTokens: 0, cacheReadTokens: 0, outputTokens: 0 })], 'deepseek-flash'),
      null,
    );
  });

  it('prices an off-peak step at the off-peak rate', () => {
    const result = calculateSessionCost([step(OFF_PEAK_AT, millionEach)], 'deepseek-flash');
    assert.notEqual(result, null);
    close(result!.outCost, 0.6);
  });

  it('prices a peak step at the peak rate', () => {
    const result = calculateSessionCost([step(PEAK_AT, millionEach)], 'deepseek-flash');
    assert.notEqual(result, null);
    close(result!.outCost, 1.2);
  });

  // The behaviour a session-wide total cannot reproduce: each step is priced by
  // its OWN timestamp, so a session spanning a peak boundary is not charged a
  // single blended rate.
  it('prices each step by its own timestamp within one session', () => {
    const result = calculateSessionCost(
      [step(OFF_PEAK_AT, millionEach), step(PEAK_AT, millionEach)],
      'deepseek-flash',
    );
    assert.notEqual(result, null);
    close(result!.outCost, 0.6 + 1.2);
    close(result!.missCost, 0.15 + 0.3);
    close(result!.hitCost, 0.003 + 0.006);
  });

  it('returns null when the model has no configured rate', () => {
    assert.equal(calculateSessionCost([step(OFF_PEAK_AT, millionEach)], 'unknown-model'), null);
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
  const modelIs = (model: string) => (key: string) =>
    key === 'modelSelection' ? { lastUsed: { model } } : undefined;
  const chatWith = (nodes: readonly unknown[]) =>
    (selector: (snapshot: unknown) => unknown) => selector({ legacy: { nodes } });

  it('returns null without the session standard kit', () => {
    assert.equal(CostPill({}), null);
    assert.equal(CostPill({ useProjection: modelIs('deepseek-flash') }), null);
    assert.equal(CostPill({ useChat: chatWith([]) }), null);
  });

  it('returns null when no step billed anything', () => {
    assert.equal(CostPill({ useProjection: modelIs('deepseek-flash'), useChat: chatWith([]) }), null);
    assert.equal(
      CostPill({
        useProjection: modelIs('deepseek-flash'),
        useChat: chatWith([step(OFF_PEAK_AT, { uncachedInputTokens: 0, cacheReadTokens: 0, outputTokens: 0 })]),
      }),
      null,
    );
  });

  it('returns null when the model has no configured rate', () => {
    const element = CostPill({
      useProjection: modelIs('unknown-model'),
      useChat: chatWith([step(OFF_PEAK_AT, millionEach)]),
    });
    assert.equal(element, null);
  });

  // End-to-end proof of per-request pricing: one off-peak and one peak step,
  // summed at their own rates (0.009 + 0.45 + 1.80 = 2.259).
  it('renders spend priced per step, with semantic styling and a breakdown', () => {
    const element = CostPill({
      useProjection: modelIs('deepseek-flash'),
      useChat: chatWith([step(OFF_PEAK_AT, millionEach), step(PEAK_AT, millionEach)]),
    });
    assert.notEqual(element, null);
    assert.equal(element!.type, 'span');
    assert.equal(element!.props['data-composer-stat'], 'cost');
    assert.equal(element!.props.children, '💸 $2.26');
    assert.match(element!.props.title, /Estimated Spend: \$2\.26/);
    assert.match(element!.props.title, /Input: \$0\.4500/);
    assert.match(element!.props.title, /Cache Read: \$0\.0090/);
    assert.match(element!.props.title, /Output: \$1\.8000/);
    assert.match(element!.props.style.background, /oklch/);
    assert.match(element!.props.style.border, /oklch/);
    assert.equal(element!.props.style.gap, '0.35rem');
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
