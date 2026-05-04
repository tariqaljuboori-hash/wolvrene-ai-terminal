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
    { id: "swing", label: "Swing Engine" },
    { id: "fib", label: "Fib Map" },
    { id: "levels", label: "Fib Levels" },
    { id: "power", label: "Level Power" },
    { id: "boxes", label: "Box Engine" },
    { id: "ema", label: "EMA Confluence" },
    { id: "htf", label: "HTF Alignment" },
    { id: "entry", label: "Entry Decision" },
    { id: "trade", label: "Trade Visual" },
    { id: "dashboard", label: "Dashboard" },
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
                ? "bg-orange-500 text-black"
                : "bg-gray-700 hover:bg-gray-600 text-gray-300"
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
                value={settings.swingPivotLeft}
                onChange={(e) => onSettingsChange({ swingPivotLeft: parseInt(e.target.value) })}
                className="w-16 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
              />
              <label className="text-sm text-gray-300">Swing Pivot Left</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={settings.swingPivotRight}
                onChange={(e) => onSettingsChange({ swingPivotRight: parseInt(e.target.value) })}
                className="w-16 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
              />
              <label className="text-sm text-gray-300">Swing Pivot Right</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.showSwingLabels}
                onChange={(e) => onSettingsChange({ showSwingLabels: e.target.checked })}
                className="w-4 h-4"
              />
              <label className="text-sm text-gray-300">Show Swing Labels</label>
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
              <label className="text-sm text-gray-300">Show Fib Lines</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.invalidateOnSwingBreak}
                onChange={(e) => onSettingsChange({ invalidateOnSwingBreak: e.target.checked })}
                className="w-4 h-4"
              />
              <label className="text-sm text-gray-300">Invalidate on Swing Break</label>
            </div>
          </div>
        )}

        {activeTab === "levels" && (
          <div className="space-y-2">
            {settings.fibLevels.map((level, index) => (
              <div key={level.value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={level.show}
                  onChange={(e) => {
                    const newLevels = [...settings.fibLevels];
                    newLevels[index] = { ...newLevels[index], show: e.target.checked };
                    onSettingsChange({ fibLevels: newLevels });
                  }}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-300 w-16">{level.value}</span>
                <span className="text-sm text-gray-400">{level.name}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === "power" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <select
                value={settings.touchMode}
                onChange={(e) => onSettingsChange({ touchMode: e.target.value as any })}
                className="px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
              >
                <option value="Exact Touch">Exact Touch</option>
                <option value="ATR Tolerance">ATR Tolerance</option>
                <option value="Percent Tolerance">Percent Tolerance</option>
                <option value="Tick Tolerance">Tick Tolerance</option>
              </select>
              <label className="text-sm text-gray-300">Touch Mode</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                value={settings.touchAtrTol}
                onChange={(e) => onSettingsChange({ touchAtrTol: parseFloat(e.target.value) })}
                className="w-16 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
              />
              <label className="text-sm text-gray-300">ATR Tolerance</label>
            </div>
          </div>
        )}

        {activeTab === "boxes" && (
          <div className="space-y-2">
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
                value={settings.maxBoxes}
                onChange={(e) => onSettingsChange({ maxBoxes: parseInt(e.target.value) })}
                className="w-16 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
              />
              <label className="text-sm text-gray-300">Max Boxes</label>
            </div>
          </div>
        )}

        {activeTab === "ema" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.showEma}
                onChange={(e) => onSettingsChange({ showEma: e.target.checked })}
                className="w-4 h-4"
              />
              <label className="text-sm text-gray-300">Show EMA</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.enableEmaConfluence}
                onChange={(e) => onSettingsChange({ enableEmaConfluence: e.target.checked })}
                className="w-4 h-4"
              />
              <label className="text-sm text-gray-300">Enable EMA Confluence</label>
            </div>
          </div>
        )}

        {activeTab === "htf" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.enableHTF}
                onChange={(e) => onSettingsChange({ enableHTF: e.target.checked })}
                className="w-4 h-4"
              />
              <label className="text-sm text-gray-300">Enable HTF Alignment</label>
            </div>
          </div>
        )}

        {activeTab === "entry" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.enableSniperEntries}
                onChange={(e) => onSettingsChange({ enableSniperEntries: e.target.checked })}
                className="w-4 h-4"
              />
              <label className="text-sm text-gray-300">Enable Sniper Entries</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={settings.minScoreSniper}
                onChange={(e) => onSettingsChange({ minScoreSniper: parseInt(e.target.value) })}
                className="w-16 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
              />
              <label className="text-sm text-gray-300">Min Sniper Score</label>
            </div>
          </div>
        )}

        {activeTab === "trade" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.showTradeVisuals}
                onChange={(e) => onSettingsChange({ showTradeVisuals: e.target.checked })}
                className="w-4 h-4"
              />
              <label className="text-sm text-gray-300">Show Trade Visuals</label>
            </div>
          </div>
        )}

        {activeTab === "dashboard" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.showDashboard}
                onChange={(e) => onSettingsChange({ showDashboard: e.target.checked })}
                className="w-4 h-4"
              />
              <label className="text-sm text-gray-300">Show Dashboard</label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}