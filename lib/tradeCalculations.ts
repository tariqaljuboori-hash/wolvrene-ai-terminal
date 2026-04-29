export function clampLeverage(value: number, min = 1, max = 125) {
  return Math.max(min, Math.min(max, value || 1));
}

export function calcBaseSizeFromUsd(usd: number, price: number) {
  if (!price || price <= 0) return 0;
  return usd / price;
}

export function calcOrderMarginUsd(size: number, price: number, leverage: number) {
  if (!leverage) return 0;
  return (size * price) / leverage;
}

export function calcOrderPnLUsd(entry: number, current: number, size: number, side: "LONG" | "SHORT") {
  const diff = side === "LONG" ? current - entry : entry - current;
  return diff * size;
}

export function calcOrderRoiPct(
  entry: number,
  current: number,
  size: number,
  leverage: number,
  side: "LONG" | "SHORT"
) {
  const pnl = calcOrderPnLUsd(entry, current, size, side);
  const margin = calcOrderMarginUsd(size, entry, leverage);
  if (!margin) return 0;
  return (pnl / margin) * 100;
}

export function normalizeOrderFinancials(params: {
  usd: number;
  price: number;
  leverage: number;
}) {
  const leverage = clampLeverage(params.leverage);
  const size = calcBaseSizeFromUsd(params.usd * leverage, params.price);
  const margin = calcOrderMarginUsd(size, params.price, leverage);

  return {
    leverage,
    size,
    margin,
  };
}