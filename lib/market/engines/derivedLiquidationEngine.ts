import type { LiquidationLevel, MarketSnapshot } from "../types";

export function buildDerivedLiquidationLevels(snapshot: MarketSnapshot): LiquidationLevel[] {
  const price = snapshot.price;
  if (!price || snapshot.candles.length < 20) return [];

  const candles = snapshot.candles.slice(-60);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const recentHigh = Math.max(...highs);
  const recentLow = Math.min(...lows);
  const avgVol = candles.reduce((a, c) => a + (c.volume || 0), 0) / candles.length;
  const last = candles.at(-1)!;
  const spike = (last.volume || 0) > avgVol * 1.5;

  const oiExpanding = snapshot.openInterest.bias === "POSITIONS_ENTERING";
  const crowdedLongs = snapshot.funding.bias === "CROWDED_LONGS" || snapshot.longShort.bias === "LONGS_CROWDED";
  const crowdedShorts = snapshot.funding.bias === "CROWDED_SHORTS" || snapshot.longShort.bias === "SHORTS_CROWDED";

  const bidSum = snapshot.orderBook?.bids.slice(0, 10).reduce((a, b) => a + b.size, 0) || 0;
  const askSum = snapshot.orderBook?.asks.slice(0, 10).reduce((a, b) => a + b.size, 0) || 0;
  const imbalance = bidSum && askSum ? (bidSum - askSum) / (bidSum + askSum) : 0;

  const strengthBase = Math.min(95, 55 + (oiExpanding ? 10 : 0) + (spike ? 8 : 0) + Math.round(Math.abs(imbalance) * 20));

  const levels: LiquidationLevel[] = [
    {
      price: recentHigh,
      side: "SHORT_LIQUIDATIONS",
      notional: null,
      strength: crowdedLongs ? strengthBase + 8 : strengthBase,
      distancePct: Math.abs((recentHigh - price) / price) * 100,
      source: "derived",
    },
    {
      price: recentLow,
      side: "LONG_LIQUIDATIONS",
      notional: null,
      strength: crowdedShorts ? strengthBase + 8 : strengthBase,
      distancePct: Math.abs((recentLow - price) / price) * 100,
      source: "derived",
    },
  ];

  return levels.sort((a, b) => a.distancePct! - b.distancePct!);
}
