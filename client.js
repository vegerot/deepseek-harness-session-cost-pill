// Types are JSDoc-only on purpose: the harness loads this file into the page as
// a CLASSIC script (no `type="module"`), so it reaches the JS engine verbatim —
// no build step and no runtime type stripping exists on this side. `tsc
// --checkJs` verifies these annotations; see tsconfig.json.

/**
 * Published DeepSeek list price for one model, in USD per 1M tokens.
 * @typedef {object} ModelRate
 * @property {number} miss Uncached input ("cache miss") tokens.
 * @property {number} hit Cache-read ("cache hit") input tokens.
 * @property {number} out Output tokens, reasoning included.
 */

/**
 * Session token totals as the `tokenUsage` projection reports them; the four
 * prompt/output buckets are disjoint, so summing them is the true total.
 * @typedef {object} TokenUsage
 * @property {number} [uncachedInputTokens]
 * @property {number} [cacheReadTokens]
 * @property {number} [cacheWriteTokens]
 * @property {number} [outputTokens]
 */

/**
 * The `modelSelection` projection: `lastUsed` is the route the newest request
 * actually ran on, `next` the one queued for the following turn.
 * @typedef {object} ModelSelection
 * @property {{ model?: string } | null} [lastUsed]
 * @property {{ model?: string } | null} [next]
 */

/**
 * Per-bucket dollars plus their sum, all USD.
 * @typedef {object} CostBreakdown
 * @property {number} missCost
 * @property {number} hitCost
 * @property {number} outCost
 * @property {number} totalCost
 */

/**
 * The session standard kit's key-addressed projection reader, injected into
 * every session-scoped slot entry.
 * @typedef {object} CostPillProps
 * @property {(key: string) => unknown} [useProjection]
 */

/**
 * Cordis slot registry reached through the plugin's `apply` context.
 * @typedef {object} SlotRegistry
 * @property {(name: string, thunk: () => void) => void} inject
 * @property {(options: { name: string, id: string, order: number }, component: unknown) => void} register
 */

/**
 * @typedef {object} SlotContext
 * @property {SlotRegistry} slots
 */

/**
 * What this bundle's factory returns to the module system.
 * @typedef {object} PluginModule
 * @property {string[]} inject
 * @property {(ctx: SlotContext) => void} apply
 * @property {Record<string, ModelRate>} RATES
 * @property {(usage: TokenUsage, modelId: string) => CostBreakdown | null} calculateSessionCost
 * @property {(amount: number) => string} formatCost
 * @property {(props: CostPillProps) => unknown} CostPill
 */

/**
 * The shell's bundle registry. The bootstrap queue script defines it in a
 * blocking head script before any bundle loads, so it is present by
 * construction and needs no guard.
 * @typedef {object} ModuleLoader
 * @property {(registration: { id: string, factory: (require: (name: string) => any) => PluginModule }) => void} load
 */

// `window` is augmented by the shell at boot, so assert the one shape this
// bundle reads rather than declaring the global for the whole page.
const shell = /** @type {{ __ModuleLoader__: ModuleLoader }} */ (/** @type {any} */ (window));

shell.__ModuleLoader__.load({
  id: '@local/session-cost-pill',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // DeepSeek rates ($ per 1M tokens)
    /** @type {Record<string, ModelRate>} */
    const RATES = {
      'deepseek-flash': { miss: 0.14, hit: 0.014, out: 0.28 },
      'deepseek-chat': { miss: 0.27, hit: 0.07, out: 1.10 },
      'deepseek-reasoner': { miss: 0.55, hit: 0.14, out: 2.19 },
    };

    /**
     * Price one session's token totals at one model's route rate.
     * @param {TokenUsage} usage
     * @param {string} modelId
     * @returns {CostBreakdown | null} null when the model has no configured rate.
     */
    function calculateSessionCost(usage, modelId) {
      const pricing = RATES[modelId];
      if (!pricing) return null;

      const missCost = ((usage.uncachedInputTokens || 0) * pricing.miss) / 1_000_000;
      const hitCost = ((usage.cacheReadTokens || 0) * pricing.hit) / 1_000_000;
      const outCost = ((usage.outputTokens || 0) * pricing.out) / 1_000_000;
      const totalCost = missCost + hitCost + outCost;

      return { missCost, hitCost, outCost, totalCost };
    }

    /**
     * Render dollars for the pill label.
     * @param {number} amount
     * @returns {string}
     */
    function formatCost(amount) {
      if (amount === 0) return '$0.00';
      if (amount < 0.01) return '<$0.01';
      return '$' + amount.toFixed(2);
    }

    /**
     * The composer-dock cost pill; renders nothing without billable usage and a
     * configured rate.
     * @param {CostPillProps} props
     * @returns {unknown}
     */
    function CostPill(props) {
      const useProjection = props.useProjection;
      if (!useProjection) return null;

      const usage = /** @type {TokenUsage | undefined} */ (useProjection('tokenUsage'));
      if (!usage) return null;

      const totalTokens = (usage.uncachedInputTokens || 0) + (usage.cacheReadTokens || 0) + (usage.outputTokens || 0);
      if (totalTokens === 0) return null;

      const modelSelection = /** @type {ModelSelection | undefined} */ (useProjection('modelSelection'));
      const modelId = modelSelection?.lastUsed?.model || modelSelection?.next?.model || '';

      const cost = calculateSessionCost(usage, modelId);
      if (!cost) return null;

      const formatted = formatCost(cost.totalCost);
      const title = `Estimated Spend: ${formatted}\nInput: $${cost.missCost.toFixed(4)}\nCache Read: $${cost.hitCost.toFixed(4)}\nOutput: $${cost.outCost.toFixed(4)}`;

      return h('span', {
        'data-composer-stat': 'cost',
        title,
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          fontSize: '0.75rem',
          lineHeight: '1.25rem',
          padding: '0.125rem 0.5rem',
          borderRadius: '9999px',
          border: '1px solid oklch(0.6 0.02 240 / 0.25)',
          background: 'oklch(0.6 0.02 240 / 0.08)',
          color: 'inherit',
          cursor: 'default',
          userSelect: 'none',
        },
      }, '💸 ' + formatted);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'cost-pill',
          order: 2,
        }, CostPill));
      },
      // Export internals for test runner
      RATES,
      calculateSessionCost,
      formatCost,
      CostPill,
    };
  },
});
