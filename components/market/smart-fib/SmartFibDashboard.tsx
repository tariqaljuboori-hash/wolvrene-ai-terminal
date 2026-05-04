"use client";

import type { SmartFibContext } from "@/lib/market/engines/smart-fib/SmartFibTypes";

interface SmartFibDashboardProps {
  context: SmartFibContext;
}

export default function SmartFibDashboard({ context }: SmartFibDashboardProps) {
  return (
    <div className="bg-gray-900 border border-orange-500/20 rounded-lg p-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-gray-400">Enabled:</span>
          <span className={`ml-2 font-bold ${context.enabled ? "text-green-400" : "text-red-400"}`}>{context.enabled ? "YES" : "NO"}</span>
        </div>
        <div>
          <span className="text-gray-400">Map State:</span>
          <span className="ml-2 text-orange-400 font-bold">{context.mapState}</span>
        </div>
        <div>
          <span className="text-gray-400">Setup:</span>
          <span className="ml-2 text-orange-400">{context.setupType}</span>
        </div>
        <div>
          <span className="text-gray-400">Swing High:</span>
          <span className="ml-2 text-white">{context.swingHigh?.toFixed(2) || 'N/A'}</span>
        </div>
        <div>
          <span className="text-gray-400">Swing Low:</span>
          <span className="ml-2 text-white">{context.swingLow?.toFixed(2) || 'N/A'}</span>
        </div>
        <div>
          <span className="text-gray-400">Active Range:</span>
          <span className="ml-2 text-white">{context.activeRange?.toFixed(2) || 'N/A'}</span>
        </div>
        <div>
          <span className="text-gray-400">Fib Levels:</span>
          <span className="ml-2 text-white">{context.activeFibLevels.length}</span>
        </div>
        <div>
          <span className="text-gray-400">Boxes:</span>
          <span className="ml-2 text-white">{context.activeBoxes.length}</span>
        </div>
        <div>
          <span className="text-gray-400">Last Signals:</span>
          <span className="ml-2 text-white">{context.lastSignals.length}</span>
        </div>
        <div className="col-span-2">
          <span className="text-gray-400">Status:</span>
          <span className="ml-2 text-yellow-400">{context.dashboardSummary}</span>
        </div>
      </div>
    </div>
  );
}