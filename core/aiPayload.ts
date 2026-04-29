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
  nextConfirmation: string;
  institutionalContext: UnifiedBrainOutput["institutionalContext"];
  strategyProfile: UnifiedBrainOutput["strategyProfile"];
  tradeThesis: UnifiedBrainOutput["tradeThesis"];
  managementPlaybook: UnifiedBrainOutput["managementPlaybook"];
  riskEngine: UnifiedBrainOutput["riskEngine"];
  entryGrade: UnifiedBrainOutput["entryGrade"];
  qualityScore: number;
  qualityGrade: string;
  confirmationCount: number;
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
    structureScore: number;
    liquidityScore: number;
    triggerScore: number;
    blockedReason: string;
    institutionalBehavior: string;
  };
};

export type SelectedTradeContext = {
  side: "LONG" | "SHORT" | null;
  entry: number | null;
  markPrice: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  tpCount: number;
  distanceToSL: number | null;
  distanceToTP1: number | null;
  timeInTrade: number | null;
  status: string;
  currentAction: string;
  riskState: string;
};

export type LiveContext = {
  symbol: string;
  mode: string;
  timeframe: string;
  livePrice: number | null;
  session: string;
  direction: string | null;
  confidence: number;
  volatility: string;
  funding: string;
  volumeState: string;
  marketState: string;
  ordersCount: number;
  alertsCount: number;
  candleTrend: string;
};

export type AICommandPayload = {
  intent: string;
  brainContext: SanitizedBrainPayload;
  selectedTradeContext: SelectedTradeContext;
  activeTradeContext: SelectedTradeContext;
  liveContext: LiveContext;
  signalContext: {
    phase: string;
    direction: string | null;
    confidence: number;
    qualityScore: number;
    qualityGrade: string;
    entryGrade: string;
    confirmationCount: number;
    blockedReason: string;
    invalidationReason: string;
    nextConfirmation: string;
  };
  riskContext: {
    risk: string;
    riskReason: string;
    riskEngine: SanitizedBrainPayload["riskEngine"];
  };
  managementPlaybook: {
    action: string;
    reason: string;
    protectBE: boolean;
    trailSL: boolean;
    scaleOut: boolean;
    earlyExit: boolean;
    exitReason: string;
    nextCheckpoint: string;
  };
};

export function buildSanitizedBrainPayload(brain: UnifiedBrainOutput): SanitizedBrainPayload {
  const safePhase = brain.phase ?? "SCANNING";
  const safeDirection = brain.direction ?? null;
  const safeConfidence = Number.isFinite(brain.confidence) ? brain.confidence : 0;
  const safeDecision = brain.decision || ({} as UnifiedBrainOutput["decision"]);
  const safeRiskFirewall = brain.riskFirewall || ({ state: "NORMAL" } as UnifiedBrainOutput["riskFirewall"]);
  const safeInstitutionalContext = brain.institutionalContext || ({
    behavior: "NEUTRAL",
    trapRisk: 0,
    sweepSide: "NONE",
    reclaimDetected: false,
    displacementDetected: false,
    compressionDetected: false,
  } as UnifiedBrainOutput["institutionalContext"]);
  const safeStrategyProfile = brain.strategyProfile || ({
    name: "No Trade / Wait",
    type: "WAIT",
    direction: safeDirection,
    quality: 0,
    requiredConfirmations: [],
    missingConfirmations: [],
    invalidationLogic: "No invalidation logic yet.",
    nextAction: "Wait for confirmation.",
    blockedReason: "Strategy not available.",
  } as UnifiedBrainOutput["strategyProfile"]);
  const safeTradeThesis = brain.tradeThesis || ({
    summary: "No active trade thesis.",
    entryLogic: "No entry logic available.",
    invalidation: "No invalidation available.",
    targetLogic: "No target logic available.",
    riskNotes: "Risk context unavailable.",
    managementPlan: "No management plan available.",
    nextConfirmation: "Wait for confirmation.",
  } as UnifiedBrainOutput["tradeThesis"]);
  const safeRiskEngine = brain.riskEngine || ({
    maxRiskState: "NORMAL",
    riskRewardValid: false,
    riskRewardRatio: 0,
    volatilityAdjustedSL: "No volatility adjustment available.",
    dynamicPositionWarning: "Position guidance unavailable.",
    overLeverageWarning: "",
    noTradeRiskReason: "Risk engine data unavailable.",
  } as UnifiedBrainOutput["riskEngine"]);
  const safeManagementPlaybook = brain.managementPlaybook || ({
    action: "EXIT",
    reason: "No active management playbook.",
    protectBE: false,
    trailSL: false,
    scaleOut: false,
    earlyExit: false,
    exitReason: "No active trade.",
    nextCheckpoint: "Wait for setup.",
  } as UnifiedBrainOutput["managementPlaybook"]);
  const safeDebug = brain.debug || ({} as UnifiedBrainOutput["debug"]);

  return {
    phase: safePhase,
    direction: safeDirection,
    confidence: safeConfidence,
    risk: safeRiskFirewall.state || "NORMAL",
    entry: safeDecision.entry ?? null,
    sl: safeDecision.sl ?? null,
    tp1: safeDecision.tp1 ?? null,
    tp2: safeDecision.tp2 ?? null,
    tp3: safeDecision.tp3 ?? null,
    whyDecision: brain.whyDecision || "",
    whyNoTrade: brain.whyNoTrade || "Brain is scanning. No confirmed setup yet.",
    riskReason: brain.riskReason || "Risk engine is evaluating conditions.",
    entryReason: brain.entryReason || "Entry is blocked until validation.",
    managementReason: brain.managementReason || "No active management action.",
    invalidationReason: brain.invalidationReason || "No invalidation available.",
    nextConfirmation: safeTradeThesis.nextConfirmation || safeStrategyProfile.nextAction || "Wait for confirmation.",
    institutionalContext: safeInstitutionalContext,
    strategyProfile: safeStrategyProfile,
    tradeThesis: safeTradeThesis,
    managementPlaybook: safeManagementPlaybook,
    riskEngine: safeRiskEngine,
    entryGrade: brain.entryGrade || "Reject",
    qualityScore: Number.isFinite(brain.qualityScore) ? brain.qualityScore : 0,
    qualityGrade: brain.qualityGrade || "N/A",
    confirmationCount: Number.isFinite(brain.confirmationCount) ? brain.confirmationCount : 0,
    debug: {
      aiPayloadSanitized: true,
      aiContextSource: "UnifiedWolvreneBrain",
      strategyBlockedReason: safeDebug.strategyBlockedReason || "",
      riskRewardCheck: safeDebug.riskRewardCheck || "UNKNOWN",
      institutionalVoiceEnabled: true,
      aiUsesCandles: false,
      aiUsesIndicators: false,
      aiUsesLocalDecisionLogic: false,
      aiRateProtected: true,
      aiContradictionGuard: true,
      structureScore: Number.isFinite(safeDebug.structureScore) ? safeDebug.structureScore : 0,
      liquidityScore: Number.isFinite(safeDebug.liquidityScore) ? safeDebug.liquidityScore : 0,
      triggerScore: Number.isFinite(safeDebug.triggerScore) ? safeDebug.triggerScore : 0,
      blockedReason: safeDebug.blockedReason || "",
      institutionalBehavior: safeDebug.institutionalBehavior || safeInstitutionalContext.behavior,
    },
  };
}

export function hasValidAIPayload(payload: SanitizedBrainPayload): boolean {
  return Boolean(
    payload &&
      typeof payload.phase === "string" &&
      typeof payload.confidence === "number" &&
      payload.strategyProfile &&
      payload.riskEngine &&
      payload.managementPlaybook
  );
}