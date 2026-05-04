import type { SmartFibContext } from "./SmartFibTypes";

export function buildSmartFibContextBridge(context: SmartFibContext): any {
  return {
    enabled: context.enabled,
    mapState: context.mapState,
    setupType: context.setupType,
    swingHigh: context.swingHigh,
    swingLow: context.swingLow,
    swingHighIndex: context.swingHighIndex,
    swingLowIndex: context.swingLowIndex,
    activeRange: context.activeRange,
    activeFibLevels: context.activeFibLevels,
    strongestLevels: context.strongestLevels,
    sniperLevels: context.sniperLevels,
    secondGoldLevels: context.secondGoldLevels,
    activeBoxes: context.activeBoxes.map(box => ({
      type: box.type,
      high: box.high,
      low: box.low,
      strength: box.strength,
      touches: box.touches,
      quality: box.quality,
    })),
    bestDemandBox: context.bestDemandBox ? {
      type: context.bestDemandBox.type,
      high: context.bestDemandBox.high,
      low: context.bestDemandBox.low,
      strength: context.bestDemandBox.strength,
      touches: context.bestDemandBox.touches,
      quality: context.bestDemandBox.quality,
    } : undefined,
    bestSupplyBox: context.bestSupplyBox ? {
      type: context.bestSupplyBox.type,
      high: context.bestSupplyBox.high,
      low: context.bestSupplyBox.low,
      strength: context.bestSupplyBox.strength,
      touches: context.bestSupplyBox.touches,
      quality: context.bestSupplyBox.quality,
    } : undefined,
    lastTouchedLevel: context.lastTouchedLevel,
    lastReactionQuality: context.lastReactionQuality,
    bestLevelQuality: context.bestLevelQuality,
    entryCandidates: context.entryCandidates,
    currentSignal: context.currentSignal,
    activeTrade: context.activeTrade,
    tradeLevels: context.tradeLevels,
    invalidation: context.invalidation,
    htfAlignment: context.htfAlignment,
    emaConfluence: context.emaConfluence,
    dashboardSummary: context.dashboardSummary,
    lastSignals: context.lastSignals.slice(-5), // Last 5 signals
  };
}