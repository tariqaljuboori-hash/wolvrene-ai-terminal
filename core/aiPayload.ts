import type { UnifiedBrainOutput } from "@/core/unifiedBrain";

export type SanitizedBrainPayload = {
  phase: UnifiedBrainOutput["phase"];
  direction: UnifiedBrainOutput["direction"];
  confidence: number;
  risk: string;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  whyDecision: string;
  whyNoTrade: string;
  riskReason: string;
  entryReason: string;
  managementReason: string;
  invalidationReason: string;
  institutionalContext: UnifiedBrainOutput["institutionalContext"];
  strategyProfile: UnifiedBrainOutput["strategyProfile"];
  tradeThesis: UnifiedBrainOutput["tradeThesis"];
  managementPlaybook: UnifiedBrainOutput["managementPlaybook"];
  riskEngine: UnifiedBrainOutput["riskEngine"];
  entryGrade: UnifiedBrainOutput["entryGrade"];
  debug: {
    aiPayloadSanitized: true;
    aiContextSource: "UnifiedWolvreneBrain";
    strategyBlockedReason: string;
    riskRewardCheck: string;
    institutionalVoiceEnabled: true;
    aiUsesCandles: false;
    aiUsesIndicators: false;
    aiUsesLocalDecisionLogic: false;
    aiRateProtected: true;
    aiContradictionGuard: true;
  };
};

export function buildSanitizedBrainPayload(brain: UnifiedBrainOutput): SanitizedBrainPayload {
  return {
    phase: brain.phase,
    direction: brain.direction,
    confidence: brain.confidence,
    risk: brain.riskFirewall.state,
    entry: brain.decision.entry,
    sl: brain.decision.sl,
    tp1: brain.decision.tp1,
    tp2: brain.decision.tp2,
    tp3: brain.decision.tp3,
    whyDecision: brain.whyDecision,
    whyNoTrade: brain.whyNoTrade,
    riskReason: brain.riskReason,
    entryReason: brain.entryReason,
    managementReason: brain.managementReason,
    invalidationReason: brain.invalidationReason,
    institutionalContext: brain.institutionalContext,
    strategyProfile: brain.strategyProfile,
    tradeThesis: brain.tradeThesis,
    managementPlaybook: brain.managementPlaybook,
    riskEngine: brain.riskEngine,
    entryGrade: brain.entryGrade,
    debug: {
      aiPayloadSanitized: true,
      aiContextSource: "UnifiedWolvreneBrain",
      strategyBlockedReason: brain.debug.strategyBlockedReason,
      riskRewardCheck: brain.debug.riskRewardCheck,
      institutionalVoiceEnabled: true,
      aiUsesCandles: false,
      aiUsesIndicators: false,
      aiUsesLocalDecisionLogic: false,
      aiRateProtected: true,
      aiContradictionGuard: true,
    },
  };
}
