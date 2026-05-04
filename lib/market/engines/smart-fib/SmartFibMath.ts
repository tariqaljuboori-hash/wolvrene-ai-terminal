import type { Candle } from "@/types/trading";

export function calculateATR(candles: Candle[], length: number): number {
  if (candles.length < length + 1) return 0;

  const trValues: number[] = [];
  for (let i = 1; i <= length; i++) {
    const candle = candles[candles.length - i];
    const prevCandle = candles[candles.length - i - 1];
    if (!candle || !prevCandle) continue;

    const tr = Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - prevCandle.close),
      Math.abs(candle.low - prevCandle.close)
    );
    trValues.push(tr);
  }

  return trValues.reduce((sum, tr) => sum + tr, 0) / trValues.length;
}

export function calculateEMA(values: number[], length: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (length + 1);

  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      ema.push(values[i]);
    } else {
      ema.push((values[i] - ema[i - 1]) * multiplier + ema[i - 1]);
    }
  }

  return ema;
}

export function findPivotHighs(candles: Candle[], left: number, right: number): Array<{ index: number; value: number }> {
  const pivots: Array<{ index: number; value: number }> = [];

  for (let i = left; i < candles.length - right; i++) {
    const current = candles[i];
    let isPivot = true;

    // Check left bars
    for (let j = 1; j <= left; j++) {
      if (candles[i - j].high >= current.high) {
        isPivot = false;
        break;
      }
    }

    // Check right bars
    if (isPivot) {
      for (let j = 1; j <= right; j++) {
        if (candles[i + j].high >= current.high) {
          isPivot = false;
          break;
        }
      }
    }

    if (isPivot) {
      pivots.push({ index: i, value: current.high });
    }
  }

  return pivots;
}

export function findPivotLows(candles: Candle[], left: number, right: number): Array<{ index: number; value: number }> {
  const pivots: Array<{ index: number; value: number }> = [];

  for (let i = left; i < candles.length - right; i++) {
    const current = candles[i];
    let isPivot = true;

    // Check left bars
    for (let j = 1; j <= left; j++) {
      if (candles[i - j].low <= current.low) {
        isPivot = false;
        break;
      }
    }

    // Check right bars
    if (isPivot) {
      for (let j = 1; j <= right; j++) {
        if (candles[i + j].low <= current.low) {
          isPivot = false;
          break;
        }
      }
    }

    if (isPivot) {
      pivots.push({ index: i, value: current.low });
    }
  }

  return pivots;
}

export function calculateFibLevels(high: number, low: number, levels: number[]): Array<{ level: number; price: number }> {
  const range = high - low;
  return levels.map(level => ({
    level,
    price: level >= 1 ? high + (range * (level - 1)) : low + (range * level)
  }));
}

export function isWithinTolerance(value: number, target: number, tolerance: number, mode: "absolute" | "percent"): boolean {
  if (mode === "absolute") {
    return Math.abs(value - target) <= tolerance;
  } else {
    return Math.abs((value - target) / target) <= tolerance;
  }
}

export function calculateLevelScore(
  candle: Candle,
  levelPrice: number,
  atr: number,
  touchMode: string,
  touchAtrTol: number,
  minWickRatio: number,
  minBodyRatio: number
): number {
  let score = 0;

  // Touch detection
  const tolerance = touchMode === "ATR Tolerance" ? atr * touchAtrTol : 0.001; // fallback
  const touched = isWithinTolerance(candle.low, levelPrice, tolerance, "absolute") ||
                  isWithinTolerance(candle.high, levelPrice, tolerance, "absolute");

  if (!touched) return 0;

  // Wick/body analysis
  const bodySize = Math.abs(candle.close - candle.open);
  const totalRange = candle.high - candle.low;

  if (totalRange === 0) return 0;

  const wickRatio = (totalRange - bodySize) / totalRange;
  const bodyRatio = bodySize / totalRange;

  if (wickRatio < minWickRatio || bodyRatio < minBodyRatio) return 0;

  score += 50; // Base touch score

  // Direction bias
  if (levelPrice > candle.close && candle.close > candle.open) score += 20; // Bullish rejection
  if (levelPrice < candle.close && candle.close < candle.open) score += 20; // Bearish rejection

  return Math.min(score, 100);
}