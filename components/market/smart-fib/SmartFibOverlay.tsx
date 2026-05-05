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

type DrawableAnchor = {
  type: "HIGH" | "LOW";
  price: number;
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

  // Prepare swing anchors for visualization
  const drawableAnchors: DrawableAnchor[] = [];
  
  if (context.swingHigh !== undefined) {
    const yHigh = candleSeries.priceToCoordinate(context.swingHigh);
    if (typeof yHigh === "number" && !Number.isNaN(yHigh)) {
      drawableAnchors.push({
        type: "HIGH",
        price: context.swingHigh,
        y: yHigh,
      });
    }
  }

  if (context.swingLow !== undefined) {
    const yLow = candleSeries.priceToCoordinate(context.swingLow);
    if (typeof yLow === "number" && !Number.isNaN(yLow)) {
      drawableAnchors.push({
        type: "LOW",
        price: context.swingLow,
        y: yLow,
      });
    }
  }

  if (!drawableLevels.length && !drawableAnchors.length) {
    return null;
  }

  const mapType = context.setupType === "SHORT_MAP" ? "SHORT" : "LONG";

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      <div className="absolute left-3 top-3 rounded border border-orange-400/50 bg-black/80 px-3 py-2 text-[10px] font-bold text-orange-300">
        Smart Fib {context.mapState} · Map: {mapType} · {drawableLevels.length} levels
        {context.swingQualityScore !== undefined && (
          <span className="ml-2 text-amber-300">Quality: {context.swingQualityScore.toFixed(0)}</span>
        )}
      </div>

      {/* Swing Anchors */}
      {drawableAnchors.map((anchor) => (
        <div
          key={`${context.symbol}-${context.timeframe}-swing-${anchor.type}`}
          className="absolute left-0 right-0"
          style={{
            top: `${anchor.y}px`,
            height: "2px",
            background: anchor.type === "HIGH" ? "rgba(239, 68, 68, 0.6)" : "rgba(34, 197, 94, 0.6)",
            boxShadow: anchor.type === "HIGH" 
              ? "0 0 12px rgba(239, 68, 68, 0.8)" 
              : "0 0 12px rgba(34, 197, 94, 0.8)",
          }}
        >
          <div
            className="absolute left-2 -translate-y-1/2 rounded px-2 py-[2px] text-[9px] font-bold"
            style={{
              top: 0,
              color: anchor.type === "HIGH" ? "rgba(239, 68, 68, 1)" : "rgba(34, 197, 94, 1)",
              background: "rgba(0,0,0,0.8)",
              border: `1px solid ${anchor.type === "HIGH" ? "rgba(239, 68, 68, 1)" : "rgba(34, 197, 94, 1)"}`,
            }}
          >
            Swing {anchor.type}
          </div>

          <div
            className="absolute right-2 -translate-y-1/2 rounded px-2 py-[2px] text-[10px] font-bold"
            style={{
              top: 0,
              color: anchor.type === "HIGH" ? "rgba(239, 68, 68, 1)" : "rgba(34, 197, 94, 1)",
              background: "rgba(0,0,0,0.8)",
              border: `1px solid ${anchor.type === "HIGH" ? "rgba(239, 68, 68, 1)" : "rgba(34, 197, 94, 1)"}`,
            }}
          >
            {anchor.price.toFixed(2)}
          </div>
        </div>
      ))}

      {/* Fib Levels */}
      {drawableLevels.map((level) => {
        const color = getFibLevelColor(level.level, level.zoneType);
        const label = level.name || `Fib ${level.level}`;

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
              {level.level}
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
              {label} · {level.price.toFixed(2)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getFibLevelColor(level: number, zoneType?: string): string {
  // Sniper zones: Gold/Orange
  if (level === 0.882 || level === 0.941) {
    return "rgba(255, 184, 0, 0.95)";
  }

  // Silver/Reaction zones: Green
  if (level === 0.618 || level === 0.65 || level === 0.786) {
    return "rgba(34, 197, 94, 0.95)";
  }

  // Mid point: Blue
  if (level === 0.5) {
    return "rgba(59, 130, 246, 0.9)";
  }

  // Swing edges: Red
  if (level === 1 || level === 0) {
    return "rgba(239, 68, 68, 0.9)";
  }

  // Extended levels and others: Gray
  return "rgba(148, 163, 184, 0.82)";
}