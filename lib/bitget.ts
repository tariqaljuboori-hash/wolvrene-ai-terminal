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

export async function getBitgetCandles(tf: string): Promise<Candle[]> {
  const res = await fetch(
    `https://api.bitget.com/api/v3/market/candles?category=USDT-FUTURES&symbol=BTCUSDT&interval=${tf}&type=MARKET&limit=240`,
    { cache: "no-store" }
  );

  const data = await res.json();
  if (!data?.data) return [];

  return data.data
    .map((candle: string[]) => ({
      time: Number(candle[0]) / 1000,
      open: Number(candle[1]),
      high: Number(candle[2]),
      low: Number(candle[3]),
      close: Number(candle[4]),
    }))
    .filter((c: Candle) => c.time && c.open && c.high && c.low && c.close)
    .sort((a: Candle, b: Candle) => a.time - b.time);
}

export async function getBitgetTickerStats() {
  const res = await fetch(
    "https://api.bitget.com/api/v2/mix/market/ticker?symbol=BTCUSDT&productType=USDT-FUTURES",
    { cache: "no-store" }
  );

  const data = await res.json();
  return data?.data?.[0] || data?.data || {};
}
