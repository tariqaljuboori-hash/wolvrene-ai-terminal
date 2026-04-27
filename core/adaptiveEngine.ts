import type { UnifiedBrainOutput } from "@/core/unifiedBrain";
import type { StrategyPerformance } from "@/core/performanceEngine";

export type AdaptiveWeights = {
  strategyWeight: number;
  sessionWeight: number;
  timeframeWeight: number;
  volatilityWeight: number;
};

export function deriveAdaptiveWeights(input: {
  performance: StrategyPerformance[];
  brain: UnifiedBrainOutput;
}): AdaptiveWeights {
  const strategy = input.performance.find((p) => p.strategyName === input.brain.strategyProfile.name);
  const aPlusWin = strategy?.winRateByQualityGrade?.["A+"] ?? 0;
  const aWin = strategy?.winRateByQualityGrade?.["A"] ?? 0;
  const qualityBoost = aPlusWin >= 55 || aWin >= 55 ? 1.06 : aPlusWin <= 40 && aWin <= 40 ? 0.92 : 1;
  const strategyWeight = !strategy ? 1 : strategy.winRate >= 60 ? 1.08 * qualityBoost : strategy.winRate <= 40 ? 0.88 * qualityBoost : qualityBoost;
  const sessionWin = strategy?.winRateBySession?.[strategy?.bestSession || ""] ?? 50;
  const sessionWeight = !strategy ? 1 : strategy.worstSession !== "N/A" && input.brain.debug.sessionQuality < 58 ? 0.88 : sessionWin >= 58 ? 1.02 : 0.96;
  const timeframeWeight = input.brain.mode === "SCALP" ? 0.98 : 1.02;
  const volatilityWeight = input.brain.debug.volatilityRegime === "HIGH" ? 0.85 : input.brain.debug.volatilityRegime === "LOW" ? 0.95 : 1;
  return {
    strategyWeight: Number(strategyWeight.toFixed(3)),
    sessionWeight: Number(sessionWeight.toFixed(3)),
    timeframeWeight: Number(timeframeWeight.toFixed(3)),
    volatilityWeight: Number(volatilityWeight.toFixed(3)),
  };
}

export function applyAdaptiveConfidence(baseConfidence: number, weights: AdaptiveWeights): number {
  return Math.max(0, Math.min(100, Math.round(baseConfidence * weights.strategyWeight * weights.sessionWeight * weights.volatilityWeight)));
}
