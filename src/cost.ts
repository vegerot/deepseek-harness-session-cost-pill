export type ModelRate = {
  miss: number;
  hit: number;
  out: number;
}

export type TokenUsage = {
  uncachedInputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  outputTokens?: number;
}

export type SessionCostBreakdown = {
  missCost: number;
  hitCost: number;
  outCost: number;
  totalCost: number;
}

export const RATES = {
  'deepseek-flash': { miss: 0.14, hit: 0.014, out: 0.28 },
  'deepseek-chat': { miss: 0.27, hit: 0.07, out: 1.10 },
  'deepseek-reasoner': { miss: 0.55, hit: 0.14, out: 2.19 },
} as const satisfies Record<string, ModelRate>;

export function calculateSessionCost(usage: TokenUsage, modelId: string): SessionCostBreakdown | null {
  const pricing = RATES[modelId];
  if (!pricing) return null;

  const missCost = ((usage.uncachedInputTokens ?? 0) * pricing.miss) / 1_000_000;
  const hitCost = ((usage.cacheReadTokens ?? 0) * pricing.hit) / 1_000_000;
  const outCost = ((usage.outputTokens ?? 0) * pricing.out) / 1_000_000;
  const totalCost = missCost + hitCost + outCost;

  return { missCost, hitCost, outCost, totalCost };
}

export function formatCost(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount < 0.01) return '<$0.01';
  return `$${amount.toFixed(2)}`;
}
