export const SMART_FIB_DEFAULTS = {
  // Pivot Detection
  pivotLeft: 25,
  pivotRight: 6,
  minSwingRangeAtr: 0.4,
  minSwingRangePercent: 0.001,
  maxMapAgeBars: 200,
  protectDominantMap: false,
  enableFallback: true,
  smartFibSwingSelectionMode: "LATEST_VALID" as "LATEST_VALID" | "DOMINANT_PROTECTED",

  // Invalidation
  invalidationMode: "ATR_BUFFER" as "ATR_BUFFER" | "PERCENT_BUFFER" | "TICK_BUFFER",
  invalidationAtrBuffer: 0.1,
  invalidationPercentBuffer: 0.001,
  invalidationTickBuffer: 0.01,

  // Visual Settings
  showFib: true,
  enableBoxes: true,
  showBoxes: true,
  showTradeVisuals: true,
  minVisualLevelSpacingPx: 20,
  cooldownBars: 5,

  // Fib Levels
  fibLevels: [
    { value: 0.0, name: "Swing Edge", show: true },
    { value: 0.236, name: "Fib 0.236", show: true },
    { value: 0.382, name: "Fib 0.382", show: true },
    { value: 0.5, name: "Fib 0.5", show: true },
    { value: 0.618, name: "SILVER 0.618", show: true },
    { value: 0.65, name: "SILVER 0.65", show: true },
    { value: 0.786, name: "Fib 0.786", show: true },
    { value: 0.882, name: "SNIPER GOLD 0.882", show: true },
    { value: 0.941, name: "SNIPER EXTREME 0.941", show: true },
    { value: 1.0, name: "Swing Edge", show: true },
    { value: 1.236, name: "Extended 1.236", show: false },
    { value: 1.272, name: "Extended 1.272", show: false },
    { value: 1.348, name: "Extended 1.348", show: false },
    { value: 1.424, name: "Extended 1.424", show: false },
    { value: 1.618, name: "Extended 1.618", show: false },
  ],
};