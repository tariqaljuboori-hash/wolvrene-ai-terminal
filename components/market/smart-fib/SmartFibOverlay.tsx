"use client";

import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type {
  SmartFibContext,
  SmartFibLevel,
} from "@/lib/market/engines/smart-fib/SmartFibTypes";

interface SmartFibOverlayProps {
  context: SmartFibContext;
  chartApi: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
  showAnchorMarkers?: boolean;
  showPanel?: boolean;
}

type DrawableFibLevel = SmartFibLevel & {
  y: number;
};

type DrawableAnchor = {
  type: "HIGH" | "LOW";
  price: number;
  y: number;
  index?: number;
  time?: number;
};

type DrawableCandle = {
  type: "HIGH" | "LOW";
  price: number;
  index: number;
  time?: number;
  x?: number;
};

export default function SmartFibOverlay({
  context,
  chartApi,
  candleSeries,
  showAnchorMarkers = false,
  showPanel = true,
}: SmartFibOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Draw candle markers on canvas
  useEffect(() => {
    if (!shouldDraw || !canvasRef.current || !chartApi || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const dpr = window.devicePixelRatio || 1;

    // Match canvas size to container
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    // Get candlestick coordinates
    const candleMarkers: DrawableCandle[] = [];

    if (context.swingHighIndex !== undefined && context.swingHighTime !== undefined) {
      candleMarkers.push({
        type: "HIGH",
        price: context.swingHigh || 0,
        index: context.swingHighIndex,
        time: context.swingHighTime,
      });
    }

    if (context.swingLowIndex !== undefined && context.swingLowTime !== undefined) {
      candleMarkers.push({
        type: "LOW",
        price: context.swingLow || 0,
        index: context.swingLowIndex,
        time: context.swingLowTime,
      });
    }

    // Calculate X positions for markers using visible bars
    const timeScale = chartApi.timeScale();
    const visibleRange = timeScale.getVisibleRange();
    if (visibleRange) {
      for (const marker of candleMarkers) {
        // Use logicalToCoordinate with the bar index
        // We estimate the x position based on visual range
        if (marker.index !== undefined) {
          // Calculate X based on logical index position
          const logicalX = timeScale.logicalToCoordinate(marker.index as any);
          if (logicalX !== null && typeof logicalX === "number") {
            marker.x = logicalX;
          }
        }
      }
    }

    // Draw vertical lines for swing high/low candles
    if (showAnchorMarkers) {
      for (const marker of candleMarkers) {
        if (marker.x === undefined) continue;

        const yPrice = candleSeries.priceToCoordinate(marker.price);
        if (yPrice === null || typeof yPrice !== "number") continue;

        // Vertical line
        const color = marker.type === "HIGH" ? "rgba(239, 68, 68, 0.7)" : "rgba(34, 197, 94, 0.7)";
        const lineWidth = 3;

        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(marker.x, 0);
        ctx.lineTo(marker.x, rect.height);
        ctx.stroke();
        ctx.setLineDash([]);

        // Top label area
        const labelText = marker.type === "HIGH" ? "SF High" : "SF Low";
        const priceText = marker.price.toFixed(2);
        const indexText = `#${marker.index}`;

        ctx.fillStyle = marker.type === "HIGH" ? "rgba(239, 68, 68, 0.9)" : "rgba(34, 197, 94, 0.9)";
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Draw label box at top
        const labelBoxPadding = 4;
        const labelHeight = 22;
        const labelY = 12;

        // Background
        ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        ctx.fillRect(
          marker.x - 45,
          labelY - labelHeight / 2,
          90,
          labelHeight
        );

        // Border
        ctx.strokeStyle = marker.type === "HIGH" ? "rgba(239, 68, 68, 1)" : "rgba(34, 197, 94, 1)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
          marker.x - 45,
          labelY - labelHeight / 2,
          90,
          labelHeight
        );

        // Text
        ctx.fillStyle = marker.type === "HIGH" ? "rgba(239, 68, 68, 1)" : "rgba(34, 197, 94, 1)";
        ctx.font = "bold 10px monospace";
        ctx.fillText(labelText, marker.x, labelY - 5);
        ctx.font = "9px monospace";
        ctx.fillText(priceText, marker.x, labelY + 5);

        // Bottom label with index
        const indexBoxHeight = 18;
        const indexY = rect.height - 10;

        ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        ctx.fillRect(
          marker.x - 35,
          indexY - indexBoxHeight / 2,
          70,
          indexBoxHeight
        );

        ctx.strokeStyle = marker.type === "HIGH" ? "rgba(239, 68, 68, 1)" : "rgba(34, 197, 94, 1)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
          marker.x - 35,
          indexY - indexBoxHeight / 2,
          70,
          indexBoxHeight
        );

        ctx.fillStyle = marker.type === "HIGH" ? "rgba(239, 68, 68, 1)" : "rgba(34, 197, 94, 1)";
        ctx.font = "bold 9px monospace";
        ctx.fillText(indexText, marker.x, indexY);
      }
    }
  }, [context, chartApi, candleSeries, shouldDraw, showAnchorMarkers]);

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
        index: context.swingHighIndex,
        time: context.swingHighTime,
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
        index: context.swingLowIndex,
        time: context.swingLowTime,
      });
    }
  }

  if (!drawableLevels.length && !drawableAnchors.length) {
    return null;
  }

  const mapType = context.setupType === "SHORT_MAP" ? "SHORT" : "LONG";

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {/* Canvas for vertical candle markers */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ display: "block" }}
      />

      {showPanel && (
        <div className="absolute left-3 top-3 rounded border border-orange-400/50 bg-black/90 px-3 py-2 text-[10px] font-bold text-orange-300 max-w-sm">
          {/* Header */}
          <div>
            Smart Fib {context.mapState} · Map: {mapType} · {drawableLevels.length} levels
            {context.swingQualityScore !== undefined && (
              <span className="ml-2 text-amber-300">Quality: {context.swingQualityScore.toFixed(0)}</span>
            )}
          </div>

          {/* Swing Anchors & Range */}
        {context.swingHighIndex !== undefined && context.swingLowIndex !== undefined && (
          <div className="mt-2 space-y-1 border-t border-orange-400/30 pt-2 text-[9px] text-gray-200">
            <div className="flex justify-between">
              <span>Swing High:</span>
              <span className="text-red-400 font-mono">#{context.swingHighIndex} @ {context.swingHigh?.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Swing Low:</span>
              <span className="text-green-400 font-mono">#{context.swingLowIndex} @ {context.swingLow?.toFixed(2)}</span>
            </div>
            {context.activeRange !== undefined && (
              <div className="flex justify-between">
                <span>Active Range:</span>
                <span className="text-blue-300 font-mono">{context.activeRange.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {/* Times & Pivots */}
        {context.swingHighTime !== undefined && context.swingLowTime !== undefined && (
          <div className="mt-2 space-y-1 border-t border-orange-400/30 pt-2 text-[9px] text-gray-300">
            <div className="flex justify-between">
              <span>High Time:</span>
              <span className="font-mono">{new Date(context.swingHighTime).toLocaleTimeString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Low Time:</span>
              <span className="font-mono">{new Date(context.swingLowTime).toLocaleTimeString()}</span>
            </div>
          </div>
        )}

        {/* ATR & Selection */}
        {(context.atr !== undefined || context.confirmedPivots.length > 0 || context.mapCandidates.length > 0) && (
          <div className="mt-2 space-y-1 border-t border-orange-400/30 pt-2 text-[9px] text-gray-300">
            {context.atr !== undefined && (
              <div className="flex justify-between">
                <span>ATR(14):</span>
                <span className="font-mono">{context.atr.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Confirmed Pivots:</span>
              <span className="font-mono text-yellow-300">{context.confirmedPivots.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Candidates:</span>
              <span className="font-mono text-yellow-300">{context.mapCandidates.length}</span>
            </div>
          </div>
        )}

        {/* Selection Details */}
        {(context.selectedCandidateSource || context.swingSelectionReason || context.swingAgeCandles !== undefined) && (
          <div className="mt-2 space-y-1 border-t border-orange-400/30 pt-2 text-[9px] text-gray-300">
            {context.selectedCandidateSource && (
              <div className="flex justify-between">
                <span>Selection:</span>
                <span className="text-amber-400 font-mono">{context.selectedCandidateSource}</span>
              </div>
            )}
            {context.swingAgeCandles !== undefined && (
              <div className="flex justify-between">
                <span>Age (candles):</span>
                <span className="font-mono">{context.swingAgeCandles}</span>
              </div>
            )}
            {context.swingSelectionReason && (
              <div className="text-[8px] text-gray-400 mt-1 break-words">
                Reason: {context.swingSelectionReason}
              </div>
            )}
          </div>
        )}

        {/* Map State */}
        {context.rangeQuality && (
          <div className="mt-2 border-t border-orange-400/30 pt-2 text-[9px]">
            <span>Range Quality: </span>
            <span className={
              context.rangeQuality === "COMPRESSED" ? "text-yellow-300" :
              context.rangeQuality === "TOO_SMALL" ? "text-red-300" :
              "text-green-300"
            }>
              {context.rangeQuality}
            </span>
          </div>
        )}
      </div>)}

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