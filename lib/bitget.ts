import type { Candle } from "@/types/trading";

export const TF_SECONDS: Record<string, number> = {
  "1m": 60,
  "3m": 180,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1H": 3600,
  "2H": 7200,
  "4H": 14400,
  "1D": 86400,
  "3D": 259200,
  "1W": 604800,
  "1M": 2592000,
};

export const TIMEFRAMES = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1H",
  "2H",
  "4H",
  "1D",
  "3D",
  "1W",
  "1M",
];

export async function getBitgetCandles(
  tf: string,
  options?: { preferredCandleHistoryLimit?: number; enableCandleBackfill?: boolean; maxBackfillBatches?: number }
): Promise<Candle[]> {
  const preferredCandleHistoryLimit = options?.preferredCandleHistoryLimit ?? 1000;
  const enableCandleBackfill = options?.enableCandleBackfill ?? true;
  const maxBackfillBatches = options?.maxBackfillBatches ?? 5;
  const batchLimit = 200;
  const merged = new Map<number, Candle>();
  let endTime: number | null = null;

  for (let batch = 0; batch < (enableCandleBackfill ? maxBackfillBatches : 1); batch += 1) {
    const endTimeParam: string = endTime !== null ? `&endTime=${endTime}` : "";
    const res = await fetch(
      `https://api.bitget.com/api/v3/market/candles?category=USDT-FUTURES&symbol=BTCUSDT&interval=${tf}&type=MARKET&limit=${batchLimit}${endTimeParam}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    if (!data?.data?.length) break;
    for (const candle of data.data as string[][]) {
      const parsed: Candle = {
        time: Number(candle[0]) / 1000,
        open: Number(candle[1]),
        high: Number(candle[2]),
        low: Number(candle[3]),
        close: Number(candle[4]),
      };
      if (parsed.time && parsed.open && parsed.high && parsed.low && parsed.close) {
        merged.set(parsed.time, parsed);
      }
    }
    const oldest = data.data[data.data.length - 1];
    if (!oldest?.[0]) break;
    endTime = Number(oldest[0]) - 1;
    if (merged.size >= preferredCandleHistoryLimit) break;
  }

  return [...merged.values()].sort((a, b) => a.time - b.time).slice(-preferredCandleHistoryLimit);
}

export async function getBitgetTickerStats() {
  const res = await fetch(
    "https://api.bitget.com/api/v2/mix/market/ticker?symbol=BTCUSDT&productType=USDT-FUTURES",
    { cache: "no-store" }
  );

  const data = await res.json();
  return data?.data?.[0] || data?.data || {};
}
