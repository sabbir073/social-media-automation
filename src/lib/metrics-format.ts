export type MetricTotals = { likes: number; comments: number; shares: number; views: number; saves: number };

export function readMetrics(json: unknown): MetricTotals {
  const m = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const n = (k: string) => (typeof m[k] === "number" ? (m[k] as number) : 0);
  return { likes: n("likes"), comments: n("comments"), shares: n("shares"), views: n("views"), saves: n("saves") };
}

export const engagement = (m: MetricTotals) => m.likes + m.comments + m.shares + m.saves;
