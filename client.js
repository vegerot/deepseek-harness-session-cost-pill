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
 * One model's published off-peak and peak list prices. DeepSeek charges peak
 * rates during its weekday peak windows and half of them at all other times,
 * so a single rate per model cannot price a session correctly.
 * @typedef {object} ModelRates
 * @property {ModelRate} offPeak
 * @property {ModelRate} peak
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
 * A whole session's cost: the per-bucket totals, plus the peak/off-peak split
 * that explains them (the same tokens cost double inside a peak window).
 * @typedef {object} SessionCost
 * @property {number} missCost
 * @property {number} hitCost
 * @property {number} outCost
 * @property {number} totalCost
 * @property {number} peakCost Total priced at peak rates.
 * @property {number} offPeakCost Total priced at off-peak rates.
 * @property {number} peakSteps Billable steps that ran at peak rates.
 * @property {number} offPeakSteps Billable steps that ran at off-peak rates.
 */

/**
 * What the pill renders once the projections have been read.
 * @typedef {object} CostView
 * @property {string} modelId
 * @property {SessionCost} breakdown
 */

/**
 * One settled assistant step from the chat snapshot. `time` is the epoch ms of
 * the settled message — the request's own instant, which decides its rate.
 * @typedef {object} AssistantStep
 * @property {number} time
 * @property {TokenUsage} [usage]
 */

/**
 * The slice of the chat snapshot this pill reads.
 * @typedef {object} ChatSnapshot
 * @property {{ nodes: readonly AssistantStep[] }} legacy
 */

/**
 * The session standard kit, injected into every session-scoped slot entry:
 * a key-addressed projection reader and the Chat snapshot selector hook.
 * @typedef {object} CostPillProps
 * @property {(key: string) => unknown} [useProjection]
 * @property {(selector: (snapshot: ChatSnapshot) => readonly AssistantStep[]) => readonly AssistantStep[]} [useChat]
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
 * @property {Record<string, ModelRates>} RATES
 * @property {(epochMs: number) => boolean} isPeak
 * @property {(usage: TokenUsage, modelId: string, peak: boolean) => CostBreakdown | null} costOfUsage
 * @property {(nodes: readonly AssistantStep[], modelId: string) => SessionCost | null} calculateSessionCost
 * @property {(amount: number) => string} formatCost
 * @property {(amount: number) => string} formatExactCost
 * @property {(props: CostPillProps) => CostView | null} costView
 * @property {(input: { id: string, breakdown: SessionCost, modelId: string }) => any[]} renderCostPill
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
  id: 'dsh-plugin-session-cost-pill',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // DeepSeek published list prices, USD per 1M tokens, transcribed from
    // https://api-docs.deepseek.com/quick_start/pricing/ — off-peak and peak
    // are stored separately rather than derived, so the table stays a direct
    // transcription of the source and cannot drift from a stale multiplier.
    // The retired deepseek-chat and deepseek-reasoner aliases are absent:
    // GET /models now returns only deepseek-flash and deepseek-v4-pro.
    /** @type {Record<string, ModelRates>} */
    const RATES = {
      'deepseek-flash': {
        offPeak: { hit: 0.003, miss: 0.15, out: 0.60 },
        peak: { hit: 0.006, miss: 0.30, out: 1.20 },
      },
      'deepseek-v4-pro': {
        offPeak: { hit: 0.022, miss: 0.66, out: 1.98 },
        peak: { hit: 0.044, miss: 1.32, out: 3.96 },
      },
    };

    /**
     * Whether one request's instant fell in DeepSeek's peak window: 01:00-04:00
     * and 06:00-10:00 UTC, Monday through Friday.
     *
     * Chinese public holidays are off-peak in full, which this deliberately does
     * not model — that needs a PRC holiday calendar, so weekday windows falling
     * inside a holiday week are priced as peak.
     * @param {number} epochMs
     * @returns {boolean}
     */
    function isPeak(epochMs) {
      const at = new Date(epochMs);
      const weekday = at.getUTCDay();
      if (weekday === 0 || weekday === 6) return false;
      const hour = at.getUTCHours();
      return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
    }

    /**
     * Price one request's token totals at one model's route rate.
     *
     * DeepSeek bills cache reads and cache misses but has no cache-write line,
     * so `cacheWriteTokens` is deliberately not priced.
     * @param {TokenUsage} usage
     * @param {string} modelId
     * @param {boolean} peak Whether the request ran inside a peak window.
     * @returns {CostBreakdown | null} null when the model has no configured rate.
     */
    function costOfUsage(usage, modelId, peak) {
      const model = RATES[modelId];
      if (!model) return null;
      const pricing = peak ? model.peak : model.offPeak;

      const missCost = ((usage.uncachedInputTokens || 0) * pricing.miss) / 1_000_000;
      const hitCost = ((usage.cacheReadTokens || 0) * pricing.hit) / 1_000_000;
      const outCost = ((usage.outputTokens || 0) * pricing.out) / 1_000_000;
      const totalCost = missCost + hitCost + outCost;

      return { missCost, hitCost, outCost, totalCost };
    }

    /**
     * Price a whole session by pricing every assistant step at the rate in
     * effect for that step's own timestamp.
     *
     * The session-wide `tokenUsage` projection cannot drive this: it carries no
     * timestamps, so a session straddling a peak boundary would be billed at one
     * blended rate. Steps with no usage record (aborted or interrupted attempts)
     * and steps that billed nothing contribute nothing.
     * @param {readonly AssistantStep[]} nodes Settled chat nodes.
     * @param {string} modelId The session's model.
     * @returns {SessionCost | null} null when the model is unpriced or nothing billed.
     */
    function calculateSessionCost(nodes, modelId) {
      if (!RATES[modelId]) return null;

      let missCost = 0;
      let hitCost = 0;
      let outCost = 0;
      let peakCost = 0;
      let offPeakCost = 0;
      let peakSteps = 0;
      let offPeakSteps = 0;
      let billed = false;
      for (const node of nodes) {
        const usage = node.usage;
        if (usage === undefined) continue;
        const tokens = (usage.uncachedInputTokens || 0) + (usage.cacheReadTokens || 0) + (usage.outputTokens || 0);
        if (tokens === 0) continue;
        const peak = isPeak(node.time);
        const step = costOfUsage(usage, modelId, peak);
        if (step === null) continue;
        missCost += step.missCost;
        hitCost += step.hitCost;
        outCost += step.outCost;
        if (peak) {
          peakCost += step.totalCost;
          peakSteps += 1;
        } else {
          offPeakCost += step.totalCost;
          offPeakSteps += 1;
        }
        billed = true;
      }
      if (!billed) return null;

      return {
        missCost,
        hitCost,
        outCost,
        totalCost: missCost + hitCost + outCost,
        peakCost,
        offPeakCost,
        peakSteps,
        offPeakSteps,
      };
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
     * Render dollars for a breakdown row. Four decimals, because the cache-read
     * bucket is two orders of magnitude smaller than output and would otherwise
     * round away to nothing next to it.
     * @param {number} amount
     * @returns {string}
     */
    function formatExactCost(amount) {
      return '$' + amount.toFixed(4);
    }

    // The pill and its panel wear the composer dock's own skin. The pill
    // mirrors StatsPills.module.css and the panel mirrors stat-dialog.module.css
    // — the surface the built-in Token usage panel opens — through the same
    // --dsw-* tokens, so the row reads as one family in either theme.
    //
    // A style element rather than inline styles for two reasons: the hover
    // state needs a selector, and React removes the rules with the pill when it
    // unmounts.
    const PILL_CSS = `
/* Sizes are rem so they follow the reader's text size; the two px values are
   the cases with no content-relative equivalent — a pill radius and a
   device-pixel hairline rule. */

.dsh-cost-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  box-sizing: border-box;
  max-width: 100%;
  padding: 0.0625rem 0.5rem;
  border: none;
  border-radius: 9999px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-variant-numeric: tabular-nums;
  line-height: inherit;
  white-space: nowrap;
  cursor: pointer;
}
/* The pill's glyph, kept out of the markup: aria-label supplies the button's
   accessible name, so nothing here has to be hidden from assistive tech. */
.dsh-cost-pill::before {
  content: '💸';
  font-size: 0.875rem;
  line-height: 1;
}
.dsh-cost-pill:hover,
.dsh-cost-pill:has(~ [popover]:popover-open) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.dsh-cost-panel {
  position: fixed;
  z-index: 1100;
  box-sizing: border-box;
  /* Above the pill and centred on it. The "center" half is load-bearing:
     position-area alone selects the whole strip above the anchor, which is
     viewport-wide, so centring inside it centres on the viewport rather than on
     the pill. A browser without CSS anchor positioning drops all three
     declarations and the user agent's own inset/margin centring stands in,
     which is why the gap is a translate: a margin here would override that
     centring and strand the panel in a corner.
     No position-try-fallbacks: measured in Chrome, flip-block never fires here.
     When the panel does not fit above the anchor Chrome slides it into the
     viewport instead, and that corrected position counts as fitting, so the
     fallback is never consulted and the panel simply covers the pill. The dock
     sits at the bottom of the window with the whole conversation above it, so
     that only happens in a window too short for the app to be usable. */
  position-area: top center;
  translate: 0 -0.5rem;
  width: max-content;
  min-width: min(18.75rem, calc(100vw - 1.5rem));
  max-width: min(27.5rem, calc(100vw - 1.5rem));
  padding: 1rem;
  border: 0;
  overflow: visible;
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-specific-menu);
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent);
  font-size: 0.75rem;
  line-height: 1.125rem;
  color: var(--dsw-alias-label-secondary);
  cursor: default;
}
.dsh-cost-panel-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.5rem;
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
}
.dsh-cost-panel-title {
  margin: 0;
  font: inherit;
}
.dsh-cost-panel-total {
  font-variant-numeric: tabular-nums;
}
.dsh-cost-panel-rule {
  margin: 0 0 0.625rem;
  border: 0;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}
.dsh-cost-panel-rows {
  display: grid;
  grid-template-columns: minmax(4.75rem, auto) minmax(0, 1fr);
  gap: 0.375rem 1rem;
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
}
/* The spec's own way to group a term with its value, so the dt/dd pair stays
   one grid item without introducing a styling-only wrapper. */
.dsh-cost-panel-rows > div {
  display: contents;
}
.dsh-cost-panel-rows dt,
.dsh-cost-panel-rows dd {
  min-width: 0;
  margin: 0;
}
.dsh-cost-panel-rows dd {
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.dsh-cost-panel-note {
  margin: 0.625rem 0 0;
  padding-top: 0.625rem;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-tertiary);
}
`;

    /**
     * How many billable steps a rate band covered.
     * @param {number} count
     * @returns {string}
     */
    function stepCount(count) {
      return count === 1 ? '1 step' : count + ' steps';
    }

    /**
     * One breakdown row. A div wrapping a dt/dd pair is the valid way to group
     * a term with its value inside a dl.
     * @param {string} key
     * @param {string} label
     * @param {string} value
     * @returns {any}
     */
    function costRow(key, label, value) {
      return h('div', { key, 'data-cost-row': key }, [
        h('dt', { key: 'label' }, label),
        h('dd', { key: 'value' }, value),
      ]);
    }

    /**
     * The pill markup: the trigger button and the popover it opens.
     *
     * `popover="auto"` is what makes a click show the breakdown. The browser
     * opens it through `popovertarget`, closes it on Escape and on an outside
     * click, and paints it in the top layer so the dock cannot clip it — no
     * state, refs, effects, or listeners of ours are involved.
     * @param {{ id: string, breakdown: SessionCost, modelId: string }} input
     * @returns {any[]} the stylesheet, the trigger, then the popover it targets.
     */
    function renderCostPill({ id, breakdown, modelId }) {
      const anchor = '--' + id;
      const titleId = id + '-title';
      const total = formatCost(breakdown.totalCost);

      // The button carries only the figure: PILL_CSS generates the glyph, and
      // aria-label gives the button a name worth announcing. There is no
      // aria-haspopup because that means "menu" and this opens a panel.
      const trigger = h('button', {
        key: 'trigger',
        type: 'button',
        className: 'dsh-cost-pill',
        'data-composer-stat': 'cost',
        popovertarget: id,
        'aria-label': 'Estimated session spend ' + total + '. Show the breakdown.',
        title: 'Show the cost breakdown',
        // The button is what the panel positions against, so the anchor name
        // belongs here and the reference belongs on the panel.
        style: { anchorName: anchor },
      }, total);

      // Only the anchor pair is per-instance; the skin is PILL_CSS. The
      // trigger precedes the popover so the pill can pick up the panel's open
      // state through :has().
      const popover = h('section', {
        key: 'breakdown',
        id,
        popover: 'auto',
        className: 'dsh-cost-panel',
        'data-cost-breakdown': '',
        'aria-labelledby': titleId,
        style: { positionAnchor: anchor },
      }, [
        h('header', { key: 'header', className: 'dsh-cost-panel-header' }, [
          h('h2', { key: 'title', id: titleId, className: 'dsh-cost-panel-title' }, 'Estimated session spend'),
          h('data', { key: 'total', className: 'dsh-cost-panel-total', value: breakdown.totalCost }, total),
        ]),
        h('hr', { key: 'rule', className: 'dsh-cost-panel-rule' }),
        h('dl', { key: 'rows', className: 'dsh-cost-panel-rows' }, [
          costRow('uncached-input', 'Uncached input', formatExactCost(breakdown.missCost)),
          costRow('cache-read', 'Cache read', formatExactCost(breakdown.hitCost)),
          costRow('output', 'Output', formatExactCost(breakdown.outCost)),
          costRow('peak', 'Peak (' + stepCount(breakdown.peakSteps) + ')', formatExactCost(breakdown.peakCost)),
          costRow('off-peak', 'Off-peak (' + stepCount(breakdown.offPeakSteps) + ')', formatExactCost(breakdown.offPeakCost)),
        ]),
        h('p', { key: 'note', className: 'dsh-cost-panel-note' }, 'Priced per request at ' + modelId + ' rates'),
      ]);

      return [h('style', { key: 'sheet' }, PILL_CSS), trigger, popover];
    }

    /**
     * Read the session's projections into the values the pill renders.
     * @param {CostPillProps} props
     * @returns {CostView | null} null without the standard kit, billable usage, or a price.
     */
    function costView(props) {
      const useProjection = props.useProjection;
      const useChat = props.useChat;
      if (!useProjection || !useChat) return null;

      const nodes = useChat((snapshot) => snapshot.legacy.nodes);

      const modelSelection = /** @type {ModelSelection | undefined} */ (useProjection('modelSelection'));
      const modelId = modelSelection?.lastUsed?.model || modelSelection?.next?.model || '';

      const breakdown = calculateSessionCost(nodes, modelId);
      if (!breakdown) return null;

      return { modelId, breakdown };
    }

    /**
     * The composer-dock cost pill; renders nothing without billable usage and a
     * configured rate. The id comes from useId so two composers cannot target
     * each other's breakdown.
     * @param {CostPillProps} props
     * @returns {unknown}
     */
    function CostPill(props) {
      const id = 'cost-pill-' + React.useId().replace(/[^a-zA-Z0-9]/g, '');
      const view = costView(props);
      if (!view) return null;
      return renderCostPill({ id, breakdown: view.breakdown, modelId: view.modelId });
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
      isPeak,
      costOfUsage,
      calculateSessionCost,
      formatCost,
      formatExactCost,
      costView,
      renderCostPill,
      CostPill,
    };
  },
});
