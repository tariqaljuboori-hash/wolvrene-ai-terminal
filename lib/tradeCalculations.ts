import type { TradeOrder } from "@/types/trading";

export function clampLeverage(value: string | number) {
  return Math.max(1, Math.min(125, Number(value) || 1));
}

export function calcBaseSizeFromUsd(notionalUsd: number, price: number) {
  if (!Number.isFinite(notionalUsd) || !Number.isFinite(price) || price <= 0) return 0;
  return Math.max(0, notionalUsd / price);
}

export function calcUsdFromBaseSize(size: number, price: number) {
  if (!Number.isFinite(size) || !Number.isFinite(price) || price <= 0) return 0;
  return Math.max(0, size * price);
}

export function calcOrderMarginUsd(order: Pick<TradeOrder, "entry" | "size" | "leverage">) {
  const leverage = clampLeverage(order.leverage);
  const notionalUsd = calcUsdFromBaseSize(Number(order.size) || 0, Number(order.entry) || 0);
  return leverage > 0 ? notionalUsd / leverage : notionalUsd;
}

export function calcOrderPnLUsd(order: Pick<TradeOrder, "entry" | "size" | "side">, markPrice: number) {
  const size = Number(order.size) || 0;
  const entry = Number(order.entry) || 0;
  const mark = Number(markPrice) || entry;
  const diff = order.side === "LONG" ? mark - entry : entry - mark;
  return diff * size;
}

export function calcOrderRoiPct(order: Pick<TradeOrder, "entry" | "size" | "leverage" | "side">, markPrice: number) {
  const margin = calcOrderMarginUsd(order);
  if (!margin) return 0;
  return (calcOrderPnLUsd(order, markPrice) / margin) * 100;
}

export function normalizeOrderFinancials(order: TradeOrder, priceForNotional?: number): TradeOrder {
  const notionalPrice = Number(priceForNotional) > 0 ? Number(priceForNotional) : Number(order.entry) || 0;
  const size = Number(order.size) || 0;
  const leverage = clampLeverage(order.leverage);
  const notionalUsd = calcUsdFromBaseSize(size, notionalPrice);
  const marginUsd = leverage > 0 ? notionalUsd / leverage : notionalUsd;

  return {
    ...order,
    leverage,
    notionalUsd,
    marginUsd,
  };
}
