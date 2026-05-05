"use client";

import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import type { SmartFibContext } from "@/lib/market/engines/smart-fib/SmartFibTypes";

interface SmartFibOverlayProps {
  context: SmartFibContext;
  chartApi: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
}

export default function SmartFibOverlay({ context, chartApi, candleSeries }: SmartFibOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
  //   if (!context.enabled || !chartApi || !candleSeries || !overlayRef.current) return;

  //   const overlay = overlayRef.current;
  //   overlay.innerHTML = '';

  //   // Only draw if we have an active map
  //   if (context.mapState === "WAITING" || !context.activeFibLevels.length) return;

  //   // Draw fib lines (if enabled)
  //   if (context.settings?.showFib !== false) {
  //     context.activeFibLevels.forEach((levelPrice) => {
  //     const y = candleSeries.priceToCoordinate(levelPrice);
  //     if (typeof y !== "number") return;

  //     const line = document.createElement('div');
  //     line.className = 'absolute w-full h-px bg-orange-500/60 pointer-events-none z-10';
  //     line.style.top = `${y}px`;
  //     line.style.borderTop = '1px solid rgba(255, 138, 0, 0.8)';
  //     line.style.boxShadow = '0 0 4px rgba(255, 138, 0, 0.3)';

  //     // Add level label
  //     const level = getFibLevelName(levelPrice, context);
  //     if (level) {
  //       const label = document.createElement('div');
  //       label.className = 'absolute right-0 top-0 text-xs font-bold text-orange-300 pointer-events-none z-20';
  //       label.style.transform = 'translateY(-50%)';
  //       label.textContent = `${level.name} ${levelPrice.toFixed(2)}`;
  //       label.style.background = 'rgba(0, 0, 0, 0.8)';
  //       label.style.padding = '2px 4px';
  //       label.style.borderRadius = '2px';
  //       line.appendChild(label);
  //     }

  //     overlay.appendChild(line);
  //   });
  //   }

  //   // Draw swing markers
  //   if (context.swingHigh) {
  //     const y = candleSeries.priceToCoordinate(context.swingHigh);
  //     if (typeof y === "number") {
  //       const marker = document.createElement('div');
  //       marker.className = 'absolute w-2 h-2 bg-red-500 rounded-full pointer-events-none z-20';
  //       marker.style.top = `${y}px`;
  //       marker.style.left = '10px';
  //       marker.style.transform = 'translateY(-50%)';
  //       marker.title = `Swing High: ${context.swingHigh.toFixed(2)}`;
  //       overlay.appendChild(marker);
  //     }
  //   }

  //   if (context.swingLow) {
  //     const y = candleSeries.priceToCoordinate(context.swingLow);
  //     if (typeof y === "number") {
  //       const marker = document.createElement('div');
  //       marker.className = 'absolute w-2 h-2 bg-green-500 rounded-full pointer-events-none z-20';
  //       marker.style.top = `${y}px`;
  //       marker.style.left = '10px';
  //       marker.style.transform = 'translateY(-50%)';
  //       marker.title = `Swing Low: ${context.swingLow.toFixed(2)}`;
  //       overlay.appendChild(marker);
  //     }
  //   }

  //   // Draw boxes with proper coordinate mapping (if enabled)
  //   if (context.settings?.enableBoxes !== false && context.settings?.showBoxes !== false) {
  //     context.activeBoxes.forEach(box => {
  //     const topY = candleSeries.priceToCoordinate(box.high);
  //     const bottomY = candleSeries.priceToCoordinate(box.low);
  //     if (typeof topY !== "number" || typeof bottomY !== "number") return;

  //     // Get visible time range for box positioning
  //     const timeScale = chartApi.timeScale();
  //     const visibleRange = timeScale.getVisibleRange();
  //     if (!visibleRange) return;

  //     // Position box from swing point to right edge (extend right)
  //     const startTime = context.setupType === "LONG_MAP" 
  //       ? (context.swingLowIndex || 0) 
  //       : (context.swingHighIndex || 0);
  //     const startX = timeScale.timeToCoordinate(startTime);
  //     const endX = timeScale.timeToCoordinate(visibleRange.to);

  //     if (typeof startX !== "number" || typeof endX !== "number") return;

  //     const width = endX - startX;
  //     const height = Math.abs(bottomY - topY);

  //     const boxDiv = document.createElement('div');
  //     boxDiv.className = `absolute border-2 pointer-events-none z-5 ${
  //       box.type === 'DEMAND' ? 'border-green-500/40 bg-green-500/10' : 'border-red-500/40 bg-red-500/10'
  //     }`;
  //     boxDiv.style.top = `${Math.min(topY, bottomY)}px`;
  //     boxDiv.style.left = `${startX}px`;
  //     boxDiv.style.width = `${width}px`;
  //     boxDiv.style.height = `${height}px`;
  //     overlay.appendChild(boxDiv);
  //   });

  //   // Draw trade visuals only for executable signals (if enabled)
  //   if (context.settings?.showTradeVisuals !== false && context.currentSignal?.executable && context.tradeLevels) {
  //     const { entry, sl, tp1, tp2, tp3 } = context.tradeLevels;

  //     // Entry line
  //     if (entry) {
  //       const y = candleSeries.priceToCoordinate(entry);
  //       if (typeof y === "number") {
  //         const line = document.createElement('div');
  //         line.className = 'absolute w-full h-px bg-blue-500/80 pointer-events-none z-15';
  //         line.style.top = `${y}px`;
  //         line.style.borderTop = '2px solid rgba(59, 130, 246, 0.9)';
  //         line.style.boxShadow = '0 0 6px rgba(59, 130, 246, 0.5)';

  //         const label = document.createElement('div');
  //         label.className = 'absolute left-0 top-0 text-xs font-bold text-blue-300 pointer-events-none z-20';
  //         label.style.transform = 'translateY(-50%)';
  //         label.textContent = `ENTRY ${entry.toFixed(2)}`;
  //         label.style.background = 'rgba(0, 0, 0, 0.9)';
  //         label.style.padding = '2px 4px';
  //         label.style.borderRadius = '2px';
  //         line.appendChild(label);

  //         overlay.appendChild(line);
  //       }
  //     }

  //     // SL line
  //     if (sl) {
  //       const y = candleSeries.priceToCoordinate(sl);
  //       if (typeof y === "number") {
  //         const line = document.createElement('div');
  //         line.className = 'absolute w-full h-px bg-red-500/80 pointer-events-none z-15';
  //         line.style.top = `${y}px`;
  //         line.style.borderTop = '2px solid rgba(239, 68, 68, 0.9)';
  //         line.style.boxShadow = '0 0 6px rgba(239, 68, 68, 0.5)';

  //         const label = document.createElement('div');
  //         label.className = 'absolute right-0 top-0 text-xs font-bold text-red-300 pointer-events-none z-20';
  //         label.style.transform = 'translateY(-50%)';
  //         label.textContent = `SL ${sl.toFixed(2)}`;
  //         label.style.background = 'rgba(0, 0, 0, 0.9)';
  //         label.style.padding = '2px 4px';
  //         label.style.borderRadius = '2px';
  //         line.appendChild(label);

  //         overlay.appendChild(line);
  //       }
  //     }

  //     // TP lines
  //     [tp1, tp2, tp3].forEach((tp, index) => {
  //       if (!tp) return;
  //       const y = candleSeries.priceToCoordinate(tp);
  //       if (typeof y === "number") {
  //         const line = document.createElement('div');
  //         line.className = 'absolute w-full h-px bg-green-500/80 pointer-events-none z-15';
  //         line.style.top = `${y}px`;
  //         line.style.borderTop = '2px solid rgba(34, 197, 94, 0.9)';
  //         line.style.boxShadow = '0 0 6px rgba(34, 197, 94, 0.5)';

  //         const label = document.createElement('div');
  //         label.className = 'absolute right-0 top-0 text-xs font-bold text-green-300 pointer-events-none z-20';
  //         label.style.transform = 'translateY(-50%)';
  //         label.textContent = `TP${index + 1} ${tp.toFixed(2)}`;
  //         label.style.background = 'rgba(0, 0, 0, 0.9)';
  //         label.style.padding = '2px 4px';
  //         label.style.borderRadius = '2px';
  //         line.appendChild(label);

  //         overlay.appendChild(line);
  //       }
  //     });
  //   }
  }, [context, chartApi, candleSeries]);

  if (!context.enabled) return null;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 pointer-events-none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 100,
      }}
    />
  );
}

function getFibLevelName(price: number, context: SmartFibContext) {
  if (!context.swingHigh || !context.swingLow || !context.activeRange) return null;

  const range = context.activeRange;
  const isLongMap = context.setupType === "LONG_MAP";
  const base = isLongMap ? context.swingLow : context.swingHigh;

  const levels = [
    { value: 0, name: "0.0" },
    { value: 0.236, name: "0.236" },
    { value: 0.382, name: "0.382" },
    { value: 0.5, name: "0.5" },
    { value: 0.618, name: "0.618" },
    { value: 0.65, name: "0.65" },
    { value: 0.786, name: "0.786" },
    { value: 0.882, name: "0.882 SNIPER" },
    { value: 0.941, name: "0.941 GOLD" },
    { value: 1.0, name: "1.0" },
    { value: 1.236, name: "1.236" },
    { value: 1.272, name: "1.272" },
    { value: 1.348, name: "1.348" },
    { value: 1.424, name: "1.424" },
    { value: 1.618, name: "1.618" },
  ];

  for (const level of levels) {
    const expectedPrice = isLongMap
      ? base + (range * level.value)
      : base - (range * level.value);
    if (Math.abs(expectedPrice - price) < 0.01) {
      return level;
    }
  }

  return null;
}