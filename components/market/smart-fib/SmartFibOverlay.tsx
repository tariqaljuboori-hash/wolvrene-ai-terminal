"use client";

import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type {
  SmartFibContext,
  SmartFibLevel,
} from "@/lib/market/engines/smart-fib/SmartFibTypes";

interface SmartFibOverlayProps {
  context: SmartFibContext;
  chartApi: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
}

type DrawableFibLevel = SmartFibLevel & {
  y: number;
};

export default function SmartFibOverlay({
  context,
  chartApi,
  candleSeries,
}: SmartFibOverlayProps) {
  const shouldDraw =
    context.enabled &&
    chartApi &&
    candleSeries &&
    context.activeFibLevels.length > 0 &&
    (
      context.mapState === "LONG_MAP" ||
      context.mapState === "SHORT_MAP" ||
      context.mapState === "FALLBACK_ACTIVE" ||
      context.mapState === "COMPRESSED_LEVELS"
    );

  if (!shouldDraw || !candleSeries) {
    return null;
  }

  const drawableLevels = context.activeFibLevels
    .map((level) => {
      const y = candleSeries.priceToCoordinate(level.price);

      if (typeof y !== "number" || Number.isNaN(y)) {
        return null;
      }

      return {
        ...level,
        y,
      };
    })
    .filter(Boolean) as DrawableFibLevel[];

  if (!drawableLevels.length) {
    return null;
  }

  const side = context.setupType === "SHORT_MAP" ? "SHORT" : "LONG";

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      <div className="absolute left-3 top-3 rounded border border-orange-400/50 bg-black/80 px-3 py-2 text-[10px] font-bold text-orange-300">
        Smart Fib {context.mapState} · {drawableLevels.length} levels
      </div>

      {drawableLevels.map((level) => {
        const color = getFibLevelColor(level.level);
        const label = `${side} ${level.name || level.level} · ${level.price.toFixed(2)}`;

        return (
          <div
            key={`${context.symbol}-${context.timeframe}-${context.setupType}-${level.level}-${level.price}`}
            className="absolute left-0 right-0"
            style={{
              top: `${level.y}px`,
              height: "1px",
              background: color,
              boxShadow: `0 0 8px ${color}`,
            }}
          >
            <div
              className="absolute left-2 -translate-y-1/2 rounded px-2 py-[2px] text-[9px] font-bold"
              style={{
                top: 0,
                color,
                background: "rgba(0,0,0,0.72)",
                border: `1px solid ${color}`,
              }}
            >
              Fib {level.level}
            </div>

            <div
              className="absolute right-2 -translate-y-1/2 rounded px-2 py-[2px] text-[10px] font-bold"
              style={{
                top: 0,
                color,
                background: "rgba(0,0,0,0.78)",
                border: `1px solid ${color}`,
              }}
            >
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getFibLevelColor(level: number): string {
  if (level === 0.882 || level === 0.941) {
    return "rgba(255, 184, 0, 0.95)";
  }

  if (level === 0.618 || level === 0.65 || level === 0.786) {
    return "rgba(34, 197, 94, 0.95)";
  }

  if (level === 0.5) {
    return "rgba(59, 130, 246, 0.9)";
  }

  if (level === 1 || level === 0) {
    return "rgba(239, 68, 68, 0.9)";
  }

  return "rgba(148, 163, 184, 0.82)";
}