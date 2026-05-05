import type { SmartFibContext } from "./SmartFibTypes";

export function buildSmartFibContextBridge(context: SmartFibContext, currentPrice?: number): any {
  return {
    enabled: context.enabled,
    symbol: context.symbol,
    timeframe: context.timeframe,
    mapState: context.mapState,
    setupType: context.setupType,
    swingHigh: context.swingHigh,
    swingLow: context.swingLow,
    swingHighIndex: context.swingHighIndex,
    swingLowIndex: context.swingLowIndex,
    swingHighPivot: context.swingHighPivot,
    swingLowPivot: context.swingLowPivot,
    activeRange: context.activeRange,
    activeFibLevels: context.activeFibLevels,
    confirmedPivots: context.confirmedPivots,
    activeMap: context.activeMap,
    mapCandidates: context.mapCandidates,
    invalidationReason: context.invalidationReason,
    reanchorReason: context.reanchorReason,
    fallbackReason: context.fallbackReason,
    atr: context.atr,
    rangeQuality: context.rangeQuality,
    activeBoxes: context.activeBoxes.map(box => ({
      type: box.type,
      high: box.high,
      low: box.low,
      strength: box.strength,
      touches: box.touches,
      retests: box.retests,
      quality: box.quality,
    })),
    currentSignal: context.currentSignal,
    tradeLevels: context.tradeLevels,
    dashboardSummary: context.dashboardSummary,
    lastSignals: context.lastSignals.slice(-5), // Last 5 signals
    settings: context.settings,
    // New: execution readiness
    isExecutable: context.enabled && 
      (context.mapState === "LONG_MAP" || context.mapState === "SHORT_MAP") &&
      context.tradeLevels !== undefined,
    mapDirection: context.setupType === "LONG_MAP" ? "LONG" : 
                 context.setupType === "SHORT_MAP" ? "SHORT" : 
                 null,
  };
}