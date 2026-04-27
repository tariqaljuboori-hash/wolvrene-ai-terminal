import type { LoggedTrade } from "@/core/tradeLogger";

export type StrategyPerformance = {
  strategyName: string;
  winRate: number;
  avgRR: number;
  bestSession: string;
  worstSession: string;
  tradeCount: number;
  drawdown: number;
  winRateByQualityGrade: Record<string, number>;
  winRateBySession: Record<string, number>;
  winRateByTriggerType: Record<string, number>;
};

export function buildStrategyPerformance(trades: LoggedTrade[]): StrategyPerformance[] {
  const grouped = new Map<string, LoggedTrade[]>();
  for (const trade of trades) {
    const list = grouped.get(trade.strategyName) || [];
    list.push(trade);
    grouped.set(trade.strategyName, list);
  }
  const result: StrategyPerformance[] = [];
  for (const [strategyName, list] of grouped.entries()) {
    const wins = list.filter((t) => t.result === "WIN").length;
    const winRate = list.length ? (wins / list.length) * 100 : 0;
    const avgRR = list.length ? list.reduce((s, t) => s + t.rr, 0) / list.length : 0;
    const bySession = new Map<string, { wins: number; total: number }>();
    const byQuality = new Map<string, { wins: number; total: number }>();
    const byTrigger = new Map<string, { wins: number; total: number }>();
    let equity = 0;
    let peak = 0;
    let dd = 0;
    for (const trade of list) {
      const v = bySession.get(trade.session) || { wins: 0, total: 0 };
      v.total += 1;
      if (trade.result === "WIN") v.wins += 1;
      bySession.set(trade.session, v);
      const q = byQuality.get(trade.entryGrade) || { wins: 0, total: 0 };
      q.total += 1;
      if (trade.result === "WIN") q.wins += 1;
      byQuality.set(trade.entryGrade, q);
      const triggerKey = (trade as LoggedTrade & { triggerType?: string }).triggerType || "UNKNOWN";
      const tr = byTrigger.get(triggerKey) || { wins: 0, total: 0 };
      tr.total += 1;
      if (trade.result === "WIN") tr.wins += 1;
      byTrigger.set(triggerKey, tr);
      equity += trade.result === "WIN" ? trade.rr : trade.result === "LOSS" ? -1 : 0;
      peak = Math.max(peak, equity);
      dd = Math.min(dd, equity - peak);
    }
    const sorted = [...bySession.entries()].sort((a, b) => (b[1].wins / Math.max(1, b[1].total)) - (a[1].wins / Math.max(1, a[1].total)));
    const winRateByQualityGrade = Object.fromEntries(
      [...byQuality.entries()].map(([k, v]) => [k, Number(((v.wins / Math.max(1, v.total)) * 100).toFixed(2))])
    );
    const winRateBySession = Object.fromEntries(
      [...bySession.entries()].map(([k, v]) => [k, Number(((v.wins / Math.max(1, v.total)) * 100).toFixed(2))])
    );
    const winRateByTriggerType = Object.fromEntries(
      [...byTrigger.entries()].map(([k, v]) => [k, Number(((v.wins / Math.max(1, v.total)) * 100).toFixed(2))])
    );
    result.push({
      strategyName,
      winRate: Number(winRate.toFixed(2)),
      avgRR: Number(avgRR.toFixed(2)),
      bestSession: sorted[0]?.[0] || "N/A",
      worstSession: sorted[sorted.length - 1]?.[0] || "N/A",
      tradeCount: list.length,
      drawdown: Number(Math.abs(dd).toFixed(2)),
      winRateByQualityGrade,
      winRateBySession,
      winRateByTriggerType,
    });
  }
  return result.sort((a, b) => b.tradeCount - a.tradeCount);
}
