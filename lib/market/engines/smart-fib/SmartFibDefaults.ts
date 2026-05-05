export const SMART_FIB_DEFAULTS = {
  // Pivot Detection
  pivotLeft: 5,
  pivotRight: 5,
  minSwingRangeAtr: 0.5,
  minSwingRangePercent: 0.001,
  maxMapAgeBars: 200,
  protectDominantMap: true,
  enableFallback: true,

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
    { value: 0.236, name: "Early Reaction", show: true },
    { value: 0.382, name: "TP Layer", show: true },
    { value: 0.5, name: "Mid Target", show: true },
    { value: 0.618, name: "Early 0.618", show: true },
    { value: 0.65, name: "Early 0.65", show: true },
    { value: 0.786, name: "Deep Reaction", show: true },
    { value: 0.882, name: "Sniper Gold", show: true },
    { value: 0.941, name: "Second Gold", show: true },
    { value: 1.0, name: "Swing Edge", show: true },
    { value: 1.236, name: "Extended", show: false },
    { value: 1.272, name: "Extended", show: false },
    { value: 1.348, name: "Extended", show: false },
    { value: 1.424, name: "Extended", show: false },
    { value: 1.618, name: "Extended", show: false },
  ],
};