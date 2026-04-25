import type { Direction, TradeOrder } from "@/types/trading";

export function formatPrice(value: number | null | undefined) {
  if (!value || Number.isNaN(value)) return "Auto";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function createOrderFromPrice(side: Direction, price: number): TradeOrder {
  const isLong = side === "LONG";
  const id = Date.now() + Math.floor(Math.random() * 999);

  return {
    id,
    side,
    status: "LIMIT",
    orderType: "LIMIT",
    entry: price,
    sl: isLong ? price * 0.995 : price * 1.005,
    tps: [
      {
        id: id + 1,
        label: "TP1",
        price: isLong ? price * 1.005 : price * 0.995,
        closePct: 50,
        hit: false,
      },
      {
        id: id + 2,
        label: "TP2",
        price: isLong ? price * 1.01 : price * 0.99,
        closePct: 50,
        hit: false,
      },
    ],
    size: 0.01,
    leverage: 5,
    createdAt: new Date().toLocaleString(),
  };
}

export function profitPct(side: Direction, entry: number, target: number) {
  const raw = side === "LONG" ? (target - entry) / entry : (entry - target) / entry;
  return raw * 100;
}

export function riskPct(side: Direction, entry: number, sl: number) {
  const raw = side === "LONG" ? (entry - sl) / entry : (sl - entry) / entry;
  return raw * 100;
}
