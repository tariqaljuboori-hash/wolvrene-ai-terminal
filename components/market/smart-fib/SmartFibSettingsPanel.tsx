"use client";

import { useState } from "react";
import { SMART_FIB_DEFAULTS } from "@/lib/market/engines/smart-fib/SmartFibDefaults";

interface SmartFibSettingsPanelProps {
  settings: typeof SMART_FIB_DEFAULTS;
  onSettingsChange: (settings: Partial<typeof SMART_FIB_DEFAULTS>) => void;
  onReset: () => void;
}

export default function SmartFibSettingsPanel({
  settings,
  onSettingsChange,
  onReset
}: SmartFibSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState("swing");

  const tabs = [
    { id: "swing", label: "Swing Detection" },
    { id: "fib", label: "Fib Levels" },
    { id: "invalidation", label: "Invalidation" },
  ];

  return (
    <div className="bg-gray-900 border border-orange-500/20 rounded-lg p-4 max-h-96 overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-orange-400">Smart Fib Settings</h3>
        <button
          onClick={onReset}
          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
        >
          Reset Defaults
        </button>
      </div>

      <div className="flex flex-wrap gap-1 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1 rounded text-sm ${
              activeTab === tab.id
                ? "bg-orange-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {activeTab === "swing" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={settings.pivotLeft}
                onChange={(e) => onSettingsChange({ pivotLeft: parseInt(e.target.value) })}
                className="w-16 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
              />
              <label className="text-sm text-gray-300">Pivot Left</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={settings.pivotRight}
                onChange={(e) => onSettingsChange({ pivotRight: parseInt(e.target.value) })}
                className="w-16 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
              />
              <label className="text-sm text-gray-300">Pivot Right</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                value={settings.minSwingRangeAtr}
                onChange={(e) => onSettingsChange({ minSwingRangeAtr: parseFloat(e.target.value) })}
                className="w-16 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
              />
              <label className="text-sm text-gray-300">Min Range (ATR)</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.protectDominantMap}
                onChange={(e) => onSettingsChange({ protectDominantMap: e.target.checked })}
                className="w-4 h-4"
              />
              <label className="text-sm text-gray-300">Protect Dominant Map</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.enableFallback}
                onChange={(e) => onSettingsChange({ enableFallback: e.target.checked })}
                className="w-4 h-4"
              />
              <label className="text-sm text-gray-300">Enable Fallback</label>
            </div>
          </div>
        )}

        {activeTab === "fib" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.showFib}
                onChange={(e) => onSettingsChange({ showFib: e.target.checked })}
                className="w-4 h-4"
              />
              <label className="text-sm text-gray-300">Show Fib Levels</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.enableBoxes}
                onChange={(e) => onSettingsChange({ enableBoxes: e.target.checked })}
                className="w-4 h-4"
              />
              <label className="text-sm text-gray-300">Enable Boxes</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={settings.minVisualLevelSpacingPx}
                onChange={(e) => onSettingsChange({ minVisualLevelSpacingPx: parseInt(e.target.value) })}
                className="w-16 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
              />
              <label className="text-sm text-gray-300">Min Level Spacing (px)</label>
            </div>
          </div>
        )}

        {activeTab === "invalidation" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <select
                value={settings.invalidationMode}
                onChange={(e) => onSettingsChange({ invalidationMode: e.target.value as any })}
                className="px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
              >
                <option value="ATR_BUFFER">ATR Buffer</option>
                <option value="PERCENT_BUFFER">Percent Buffer</option>
                <option value="TICK_BUFFER">Tick Buffer</option>
              </select>
              <label className="text-sm text-gray-300">Invalidation Mode</label>
            </div>
            {settings.invalidationMode === "ATR_BUFFER" && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={settings.invalidationAtrBuffer}
                  onChange={(e) => onSettingsChange({ invalidationAtrBuffer: parseFloat(e.target.value) })}
                  className="w-16 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
                />
                <label className="text-sm text-gray-300">ATR Buffer</label>
              </div>
            )}
            {settings.invalidationMode === "PERCENT_BUFFER" && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.001"
                  value={settings.invalidationPercentBuffer}
                  onChange={(e) => onSettingsChange({ invalidationPercentBuffer: parseFloat(e.target.value) })}
                  className="w-16 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
                />
                <label className="text-sm text-gray-300">Percent Buffer</label>
              </div>
            )}
            {settings.invalidationMode === "TICK_BUFFER" && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={settings.invalidationTickBuffer}
                  onChange={(e) => onSettingsChange({ invalidationTickBuffer: parseFloat(e.target.value) })}
                  className="w-16 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
                />
                <label className="text-sm text-gray-300">Tick Buffer</label>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}