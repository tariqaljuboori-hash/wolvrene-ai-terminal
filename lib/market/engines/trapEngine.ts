import type { LiquidityLevel, MarketSnapshot, SweepEvent } from "../types";

export function detectTrap(
  snapshot: MarketSnapshot,
  levels: LiquidityLevel[]
): { latestSweep: SweepEvent | null; state: "NO_TRADE" | "TRAP_POSSIBLE" | "HUNT_BUILDING"; reaction: boolean } {
  const c = snapshot.candles.slice(-8);
  if (c.length < 3) return { latestSweep: null, state: "NO_TRADE", reaction: false };

  const last = c.at(-1)!;
  const prev = c.at(-2)!;

  const above = levels.find((l) => l.side === "ABOVE" && last.high > l.price && last.close < l.price);
  if (above) {
    const latestSweep: SweepEvent = {
      direction: "UP",
      levelType: above.type,
      levelPrice: above.price,
      sweepPrice: last.high,
      reclaimed: last.close < above.price,
      displacement: Math.abs(last.close - prev.close) > Math.abs(prev.close - (c.at(-3)?.close || prev.close)),
      timestamp: last.time,
    };
    return { latestSweep, state: "TRAP_POSSIBLE", reaction: latestSweep.reclaimed };
  }

  const below = levels.find((l) => l.side === "BELOW" && last.low < l.price && last.close > l.price);
  if (below) {
    const latestSweep: SweepEvent = {
      direction: "DOWN",
      levelType: below.type,
      levelPrice: below.price,
      sweepPrice: last.low,
      reclaimed: last.close > below.price,
      displacement: true,
      timestamp: last.time,
    };
    return { latestSweep, state: "TRAP_POSSIBLE", reaction: latestSweep.reclaimed };
  }

  return { latestSweep: null, state: "HUNT_BUILDING", reaction: false };
}
