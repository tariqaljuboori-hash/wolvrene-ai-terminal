import type { LiquidityLevel, MarketSnapshot } from "../types";

export function buildLiquidityMap(snapshot: MarketSnapshot): LiquidityLevel[] {
  const out: LiquidityLevel[] = [];
  const p = snapshot.price;
  const add = (id: string, type: LiquidityLevel['type'], price: number, source: LiquidityLevel['source'], strength = 70) => {
    out.push({ id, type, price, side: p != null && price > p ? 'ABOVE' : 'BELOW', strength, swept: false, distancePct: p ? Math.abs((price - p) / p) * 100 : null, source });
  };

  if (snapshot.session.previousDayHigh) add('pdh', 'PDH', snapshot.session.previousDayHigh, 'price_action', 85);
  if (snapshot.session.previousDayLow) add('pdl', 'PDL', snapshot.session.previousDayLow, 'price_action', 85);
  if (snapshot.session.weeklyHigh) add('pwh', 'PWH', snapshot.session.weeklyHigh, 'price_action', 90);
  if (snapshot.session.weeklyLow) add('pwl', 'PWL', snapshot.session.weeklyLow, 'price_action', 90);

  const recent = snapshot.candles.slice(-40);
  if (recent.length) {
    add('range-high', 'RANGE_HIGH', Math.max(...recent.map((c) => c.high)), 'price_action', 75);
    add('range-low', 'RANGE_LOW', Math.min(...recent.map((c) => c.low)), 'price_action', 75);
  }

  snapshot.liquidationMap.levels.slice(0, 8).forEach((x, i) => add(`liq-${i}`, 'LIQUIDATION_CLUSTER', x.price, 'liquidations', x.strength));
  snapshot.optionsMap.levels.slice(0, 8).forEach((x, i) => add(`opt-${i}`, 'OPTIONS_LEVEL', x.price, 'options', x.strength));
  snapshot.volumeProfile.hvn.slice(0, 3).forEach((x, i) => add(`hvn-${i}`, 'VOLUME_NODE', x.price, 'volume_profile', x.strength));

  return out.sort((a, b) => (a.distancePct ?? 99) - (b.distancePct ?? 99));
}
