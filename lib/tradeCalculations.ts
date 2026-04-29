export type TradeSide = "LONG" | "SHORT";

export function clampLeverage(
  value: number,
  min = 1,
  max = 125
): number {
  const safeValue = Number.isFinite(value) ? value : 1;
  return Math.max(min, Math.min(max, safeValue));
}

export function calcBaseSizeFromUsd(
  usd: number,
  price: number
): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (!Number.isFinite(usd) || usd <= 0) return 0;

  return usd / price;
}

export function calcOrderMarginUsd(
  size: number,
  price: number,
  leverage: number
): number {
  if (!Number.isFinite(size) || size <= 0) return 0;
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (!Number.isFinite(leverage) || leverage <= 0) return 0;

  return (size * price) / leverage;
}

export function calcOrderPnLUsd(
  entry: number,
  current: number,
  size: number,
  side: TradeSide
): number {
  if (!Number.isFinite(entry) || !Number.isFinite(current)) return 0;
  if (!Number.isFinite(size) || size <= 0) return 0;

  const diff =
    side === "LONG"
      ? current - entry
      : entry - current;

  return diff * size;
}

export function calcOrderRoiPct(
  entry: number,
  current: number,
  size: number,
  leverage: number,
  side: TradeSide
): number {
  const pnl = calcOrderPnLUsd(entry, current, size, side);
  const margin = calcOrderMarginUsd(size, entry, leverage);

  if (margin <= 0) return 0;

  return (pnl / margin) * 100;
}

export function normalizeOrderFinancials<
  T extends Record<string, any>
>(
  order: T
): T & {
  leverage: number;
  size: number;
  margin: number;
} {
  const entry = Number(
    order.entry ??
      order.entryPrice ??
      order.price ??
      0
  );

  const usd = Number(
    order.usd ??
      order.marginUsd ??
      order.amountUsd ??
      order.margin ??
      100
  );

  const leverage = clampLeverage(
    Number(order.leverage ?? 1)
  );

  const size =
    Number(order.size ?? order.qty ?? 0) ||
    calcBaseSizeFromUsd(usd * leverage, entry);

  const margin =
    Number(order.margin ?? order.marginUsd ?? 0) ||
    calcOrderMarginUsd(size, entry, leverage);

  return {
    ...order,
    leverage,
    size,
    margin,
  };
}