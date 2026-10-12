import React from 'react';
import { calculateSessionCost, formatCost } from './cost.ts';
import type { TokenUsage } from './cost.ts';

export type ModelSelectionProjection = {
  lastUsed?: { model?: string } | null;
  next?: { model?: string } | null;
}

export type CostPillProps = {
  useProjection?: (key: string) => unknown;
}

export function CostPill(props: CostPillProps): React.ReactElement | null {
  if (!props.useProjection) return null;

  const usage = props.useProjection('tokenUsage') as TokenUsage | undefined;
  if (!usage) return null;

  const totalTokens = (usage.uncachedInputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.outputTokens ?? 0);
  if (totalTokens === 0) return null;

  const modelSelection = props.useProjection('modelSelection') as ModelSelectionProjection | undefined;
  const modelId = modelSelection?.lastUsed?.model ?? modelSelection?.next?.model ?? '';

  const cost = calculateSessionCost(usage, modelId);
  if (!cost) return null;

  const formatted = formatCost(cost.totalCost);
  const title = `Estimated Spend: ${formatted}\nInput: $${cost.missCost.toFixed(4)}\nCache Read: $${cost.hitCost.toFixed(4)}\nOutput: $${cost.outCost.toFixed(4)}`;

  return React.createElement('span', {
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
