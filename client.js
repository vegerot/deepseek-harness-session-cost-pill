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

    // The trigger keeps the pill skin the dock already uses, but is a button:
    // the click is what opens the breakdown.
    const TRIGGER_STYLE = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.35rem',
      font: 'inherit',
      fontSize: '0.75rem',
      lineHeight: '1.25rem',
      padding: '0.125rem 0.5rem',
      borderRadius: '9999px',
      border: '1px solid oklch(0.6 0.02 240 / 0.25)',
      background: 'oklch(0.6 0.02 240 / 0.08)',
      color: 'inherit',
      cursor: 'pointer',
      userSelect: 'none',
    };

    // The popover sits above its anchor. Browsers without CSS anchor
    // positioning drop the anchor properties and the UA's own
    // `inset: 0; margin: auto` centring still applies — which is why the gap is
    // a translate rather than a margin, since a margin here would override that
    // centring and strand the panel in the corner.
    const PANEL_STYLE = {
      position: 'fixed',
      positionArea: 'top',
      justifySelf: 'center',
      translate: '0 -0.5rem',
      minWidth: '16rem',
      padding: '0.625rem 0.75rem',
      borderRadius: '0.75rem',
      border: '1px solid oklch(0.6 0.02 240 / 0.25)',
      background: 'oklch(0.24 0.012 240)',
      color: 'oklch(0.97 0.005 240)',
      boxShadow: '0 0.75rem 2rem oklch(0 0 0 / 0.35)',
      fontFamily: 'inherit',
      fontSize: '0.75rem',
    };

    const TITLE_STYLE = {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: '1rem',
    };

    const TOTAL_STYLE = { fontVariantNumeric: 'tabular-nums', fontWeight: 600 };

    const LIST_STYLE = {
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      gap: '0.125rem 1rem',
      margin: 0,
      paddingTop: '0.375rem',
      borderTop: '1px solid oklch(0.6 0.02 240 / 0.25)',
    };

    // Purely a grouping for assistive tech; the dt/dd pair stays a grid item.
    const ROW_STYLE = { display: 'contents' };

    const LABEL_STYLE = { opacity: 0.75 };

    const VALUE_STYLE = { margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

    const NOTE_STYLE = {
      marginTop: '0.125rem',
      paddingTop: '0.375rem',
      borderTop: '1px solid oklch(0.6 0.02 240 / 0.25)',
      opacity: 0.6,
    };

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
      return h('div', { key, 'data-cost-row': key, style: ROW_STYLE }, [
        h('dt', { key: 'label', style: LABEL_STYLE }, label),
        h('dd', { key: 'value', style: VALUE_STYLE }, value),
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
     * @returns {any[]} the trigger, then the popover it targets.
     */
    function renderCostPill({ id, breakdown, modelId }) {
      const anchor = '--' + id;

      const trigger = h('button', {
        key: 'trigger',
        type: 'button',
        'data-composer-stat': 'cost',
        popovertarget: id,
        'aria-haspopup': 'true',
        title: 'Show the cost breakdown',
        style: TRIGGER_STYLE,
      }, '💸 ' + formatCost(breakdown.totalCost));

      const popover = h('div', {
        key: 'breakdown',
        id,
        popover: 'auto',
        'data-cost-breakdown': '',
        style: { ...PANEL_STYLE, anchorName: anchor, positionAnchor: anchor },
      }, [
        h('div', { key: 'title', style: TITLE_STYLE }, [
          h('span', { key: 'label' }, 'Estimated session spend'),
          h('span', { key: 'total', style: TOTAL_STYLE }, formatCost(breakdown.totalCost)),
        ]),
        h('dl', { key: 'rows', style: LIST_STYLE }, [
          costRow('uncached-input', 'Uncached input', formatExactCost(breakdown.missCost)),
          costRow('cache-read', 'Cache read', formatExactCost(breakdown.hitCost)),
          costRow('output', 'Output', formatExactCost(breakdown.outCost)),
          costRow('peak', 'Peak (' + stepCount(breakdown.peakSteps) + ')', formatExactCost(breakdown.peakCost)),
          costRow('off-peak', 'Off-peak (' + stepCount(breakdown.offPeakSteps) + ')', formatExactCost(breakdown.offPeakCost)),
        ]),
        h('div', { key: 'note', style: NOTE_STYLE }, 'Priced per request at ' + modelId + ' rates'),
      ]);

      return [trigger, popover];
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
