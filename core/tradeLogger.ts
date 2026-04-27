export const TRADE_LOG_KEY = "wolvrene_trade_log_v1";

export type LoggedTrade = {
  id: string;
  strategyName: string;
  mode: "SCALP" | "SWING";
  timeframe: string;
  session: string;
  side: "LONG" | "SHORT";
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tpHits: 0 | 1 | 2 | 3;
  rr: number;
  result: "WIN" | "LOSS" | "BE" | "INVALIDATED";
  entryGrade: "A+" | "A" | "B" | "C" | "Reject";
  durationMin: number;
  managementActions: string[];
  triggerType?: string;
  openedAt: number;
  closedAt: number;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function readTradeLog(): LoggedTrade[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(TRADE_LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendTradeLog(trade: LoggedTrade): LoggedTrade[] {
  const current = readTradeLog();
  const next = [trade, ...current].slice(0, 1000);
  if (canUseStorage()) {
    localStorage.setItem(TRADE_LOG_KEY, JSON.stringify(next));
  }
  return next;
}
