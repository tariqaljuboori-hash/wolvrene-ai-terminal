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

export async function getBitgetCandles(tf: string, limit: number = 1000, enableBackfill: boolean = true, maxBatches: number = 5): Promise<Candle[]> {
  const candles: Candle[] = [];
  let endTime: number | undefined;
  const batchSize = 240; // API max per request
  const batches = enableBackfill
    ? Math.min(Math.ceil(limit / batchSize), maxBatches)
    : 1;

  for (let i = 0; i < batches; i++) {
    const currentLimit = Math.min(batchSize, limit - candles.length);
    if (currentLimit <= 0) break;

    let url = `https://api.bitget.com/api/v3/market/candles?category=USDT-FUTURES&symbol=BTCUSDT&interval=${tf}&type=MARKET&limit=${currentLimit}`;
    if (endTime) {
      url += `&endTime=${endTime}`;
    }

    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();

    if (!data?.data) break;

    const batchCandles = data.data
      .map((candle: string[]) => ({
        time: Number(candle[0]) / 1000,
        open: Number(candle[1]),
        high: Number(candle[2]),
        low: Number(candle[3]),
        close: Number(candle[4]),
      }))
      .filter((c: Candle) => c.time && c.open && c.high && c.low && c.close)
      .sort((a: Candle, b: Candle) => a.time - b.time);

    if (batchCandles.length === 0) break;

    candles.push(...batchCandles);
    endTime = Math.floor(batchCandles[0].time * 1000) - 1; // Set endTime to before the earliest candle in this batch
  }

  // Remove duplicates and sort
  const uniqueCandles = candles.filter((candle, index, arr) =>
    arr.findIndex(c => c.time === candle.time) === index
  );

  return uniqueCandles.sort((a, b) => a.time - b.time);
}

export async function getBitgetTickerStats() {
  const res = await fetch(
    "https://api.bitget.com/api/v2/mix/market/ticker?symbol=BTCUSDT&productType=USDT-FUTURES",
    { cache: "no-store" }
  );

  const data = await res.json();
  return data?.data?.[0] || data?.data || {};
}
