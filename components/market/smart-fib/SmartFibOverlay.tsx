"use client";

import { useEffect, useRef } from "react";
import type { SmartFibContext } from "@/lib/market/engines/smart-fib/SmartFibTypes";

interface SmartFibOverlayProps {
  context: SmartFibContext;
  chartContainer: HTMLElement | null;
}

export default function SmartFibOverlay({ context, chartContainer }: SmartFibOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!context.enabled || !chartContainer || !overlayRef.current) return;

    const overlay = overlayRef.current;
    overlay.innerHTML = '';

    // Draw fib lines
    if (context.activeFibLevels.length > 0) {
      context.activeFibLevels.forEach((level, index) => {
        const line = document.createElement('div');
        line.className = 'absolute w-full h-px bg-orange-500/50 pointer-events-none';
        line.style.top = `${50 - (index * 10)}%`; // Simplified positioning
        line.style.zIndex = '10';
        overlay.appendChild(line);
      });
    }

    // Draw boxes
    context.activeBoxes.forEach(box => {
      const boxDiv = document.createElement('div');
      boxDiv.className = `absolute border-2 pointer-events-none ${
        box.type === 'DEMAND' ? 'border-green-500/50 bg-green-500/10' : 'border-red-500/50 bg-red-500/10'
      }`;
      boxDiv.style.top = '30%';
      boxDiv.style.left = '20%';
      boxDiv.style.width = '60%';
      boxDiv.style.height = '20%';
      boxDiv.style.zIndex = '5';
      overlay.appendChild(boxDiv);
    });

  }, [context, chartContainer]);

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