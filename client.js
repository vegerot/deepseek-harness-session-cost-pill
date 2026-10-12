window.__ModuleLoader__.load({
  id: '@local/session-cost-pill',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const RATES = {
      'deepseek-flash': { miss: 0.14, hit: 0.014, out: 0.28 },
      'deepseek-chat': { miss: 0.27, hit: 0.07, out: 1.10 },
      'deepseek-reasoner': { miss: 0.55, hit: 0.14, out: 2.19 },
    };

    function CostPill(props) {
      if (!props.useProjection) return null;

      const usage = props.useProjection('tokenUsage');
      if (!usage) return null;

      const totalTokens = (usage.uncachedInputTokens || 0) + (usage.cacheReadTokens || 0) + (usage.outputTokens || 0);
      if (totalTokens === 0) return null;

      const modelSelection = props.useProjection('modelSelection');
      const modelId = modelSelection?.lastUsed?.model || modelSelection?.next?.model || '';

      const pricing = RATES[modelId];
      if (!pricing) return null;

      const missCost = ((usage.uncachedInputTokens || 0) * pricing.miss) / 1_000_000;
      const hitCost = ((usage.cacheReadTokens || 0) * pricing.hit) / 1_000_000;
      const outCost = ((usage.outputTokens || 0) * pricing.out) / 1_000_000;
      const totalCost = missCost + hitCost + outCost;

      const formatted = totalCost === 0 ? '$0.00' : totalCost < 0.01 ? '<$0.01' : '$' + totalCost.toFixed(2);
      const title = `Estimated Spend: ${formatted}\nInput: $${missCost.toFixed(4)}\nCache Read: $${hitCost.toFixed(4)}\nOutput: $${outCost.toFixed(4)}`;

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
    };
  },
});
