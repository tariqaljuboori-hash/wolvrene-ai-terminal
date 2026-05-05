import { TF_SECONDS } from "@/lib/bitget";

export type DecisionSignalDirection = "LONG" | "SHORT" | null;
export type DecisionPhase = "SCANNING" | "SPAWNED" | "VALIDATED" | "EXECUTE" | "MANAGE" | "EXIT" | "FILTERED" | "NO_TRADE";

type StructureBias = "BULLISH" | "BEARISH" | "RANGING" | "WAITING";
type StructureEvent = "BOS_UP" | "BOS_DOWN" | "CHOCH_UP" | "CHOCH_DOWN" | "SWEEP_LOW" | "SWEEP_HIGH" | "RECLAIM" | "REJECTION" | "NONE";
type LiquidityBias = "BUY_SIDE_TAKEN" | "SELL_SIDE_TAKEN" | "BALANCED" | "WAITING";
type TriggerQuality = "NONE" | "WEAK" | "VALID" | "STRONG" | "SNIPER";
type TradeMode = "SCALP" | "SWING";
type TradeModeSelection = TradeMode | "AUTO";
type RiskState = "LOW" | "CONTROLLED" | "ELEVATED" | "HIGH" | "NO TRADE";

type DecisionSettings = {
  enabled: boolean;
  holdBars: number;
  executeConfidence: number;
  validateConfidence: number;
  spawnConfidence: number;
  cancelOnOppositeShift: boolean;
  requireTriggerForExecute: boolean;
  proSignalOnly: boolean;
};

type DecisionSignalPlan = {
  direction: DecisionSignalDirection;
  confidence: number;
  risk: RiskState;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  reason: string;
  state: string;
  markerTime: number | null;
};

type MarketStructureState = {
  bias: StructureBias;
  event: StructureEvent;
  score: number;
  summary: string;
  lastSwingHigh: number | null;
  lastSwingLow: number | null;
};

type LiquidityState = {
  bias: LiquidityBias;
  sweptHigh: boolean;
  sweptLow: boolean;
  trapDirection: DecisionSignalDirection;
  score: number;
  summary: string;
};

type TriggerValidationState = {
  quality: TriggerQuality;
  direction: DecisionSignalDirection;
  score: number;
  summary: string;
};

type ActiveExecutionTrade = {
  symbol: string;
  timeframe: string;
  status: string;
};

type InstitutionalPrecision = {
  preferredDirection: DecisionSignalDirection;
  structureDirection: DecisionSignalDirection;
  longVotes: number;
  shortVotes: number;
  hardConflict: boolean;
  triggerOpposesStructure: boolean;
  liquidityOpposesTrigger: boolean;
  precisionScore: number;
  institutionalGrade: "REJECT" | "A+" | "A" | "B" | "C";
  executeAllowed: boolean;
  eliteAllowed: boolean;
  reason: string;
};

export type DecisionPlan = {
  id: string;
  symbol: string;
  timeframe: string;
  mode: TradeMode;
  phase: DecisionPhase;
  direction: DecisionSignalDirection;
  confidence: number;
  quality: number;
  risk: RiskState;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  trigger: StructureEvent;
  structure: StructureBias;
  liquidity: LiquidityBias;
  triggerQuality: TriggerQuality;
  managementAction: "WAIT";
  proSignal: boolean;
  invalidation: number | null;
  action: string;
  reason: string;
  createdAt: number;
  expiresAt: number | null;
  markerTime: number | null;
  shouldMark: boolean;
};

export type DecisionEngineInput = {
  livePrice: number | null;
  lastClose: number | null;
  lastCandleTime?: number | null;
  selectedSymbol: string;
  timeframe: string;
  tradeModeSelection: TradeModeSelection;
  signalPlan: DecisionSignalPlan;
  structureState: MarketStructureState;
  liquidityState: LiquidityState;
  triggerValidation: TriggerValidationState;
  candlesVolatility: "LOW" | "NORMAL" | "HIGH";
  session: string;
  recentCandles: Array<{ high: number; low: number; open: number; close: number }>;
  decisionSettings: DecisionSettings;
  activeExecutionTrade: ActiveExecutionTrade | null;
  allowMultiTimeframeTrades: boolean;
  tradeRecalcCooldownCycles: number;
  
  // Smart Fib context
  smartFibMapState?: string;
  smartFibSetupType?: "LONG_MAP" | "SHORT_MAP" | "WAITING";
  smartFibSwingHigh?: number;
  smartFibSwingLow?: number;
  smartFibSwingHighIndex?: number;
  smartFibSwingLowIndex?: number;
  smartFibSwingHighTime?: number;
  smartFibSwingLowTime?: number;
  smartFibActiveRange?: number;
  smartFibRangeQuality?: "TOO_SMALL" | "COMPRESSED" | "GOOD";
  smartFibSwingQualityScore?: number;
  smartFibSwingSelectionReason?: string;
  smartFibSwingAgeCandles?: number;
  smartFibFibLevelCount?: number;
  smartFibCurrentZoneState?: "NONE" | "SILVER_WATCH" | "SILVER_ACTIVE" | "SNIPER_WATCH" | "SNIPER_ACTIVE" | "SNIPER_CONFLICT";
  smartFibClosestLevelDistance?: number;
  smartFibClosestLevelDistanceAtr?: number;
  smartFibClosestLevelPrice?: number;
  smartFibClosestLevelName?: string;
  smartFibClosestLevelZoneType?: "SNIPER" | "SILVER" | "SUPPORT" | "NONE";
  smartFibInvalidationPrice?: number;
};

type SmartFibEvaluation = {
  mapValid: boolean;
  swingQualityAcceptable: boolean;
  zoneState: "NONE" | "SILVER_WATCH" | "SILVER_ACTIVE" | "SNIPER_WATCH" | "SNIPER_ACTIVE" | "MAP_ONLY";
  directionAlign: boolean;
  directionConflict: boolean;
  priceNearImportantLevel: boolean;
  qualityBoost: number;
  blockedReason: string;
};

function evaluateSmartFibZone(input: DecisionEngineInput): SmartFibEvaluation {
  const result: SmartFibEvaluation = {
    mapValid: false,
    swingQualityAcceptable: false,
    zoneState: "NONE",
    directionAlign: false,
    directionConflict: false,
    priceNearImportantLevel: false,
    qualityBoost: 0,
    blockedReason: "",
  };

  // Check if Smart Fib map is valid
  if (
    !input.smartFibMapState ||
    input.smartFibMapState === "DISABLED" ||
    input.smartFibMapState === "WAITING_FOR_CANDLES" ||
    input.smartFibMapState === "WAITING_FOR_SWING_PAIR" ||
    input.smartFibMapState === "INVALIDATED"
  ) {
    result.blockedReason = `Smart Fib map not ready: ${input.smartFibMapState || "disabled"}`;
    return result;
  }

  // Check swing quality
  const minSwingQuality = 40;
  if (!input.smartFibSwingQualityScore || input.smartFibSwingQualityScore < minSwingQuality) {
    result.blockedReason = `Smart Fib swing quality too low: ${input.smartFibSwingQualityScore || 0} < ${minSwingQuality}`;
    return result;
  }

  result.mapValid = true;
  result.swingQualityAcceptable = true;

  // Check range quality
  if (input.smartFibRangeQuality === "COMPRESSED" || input.smartFibRangeQuality === "TOO_SMALL") {
    result.blockedReason = `Smart Fib range quality: ${input.smartFibRangeQuality}`;
    result.mapValid = false;
    return result;
  }

  // Evaluate zone state (this is already tracked in context, just use it)
  result.zoneState = input.smartFibCurrentZoneState || "NONE";

  // Check if price is actually near important levels
  result.priceNearImportantLevel =
    input.smartFibCurrentZoneState === "SNIPER_ACTIVE" ||
    input.smartFibCurrentZoneState === "SNIPER_WATCH" ||
    input.smartFibCurrentZoneState === "SILVER_ACTIVE" ||
    input.smartFibCurrentZoneState === "SILVER_WATCH";

  // If price is not near important levels, mark as MAP_ONLY (visual reference only)
  if (!result.priceNearImportantLevel && input.smartFibMapState !== "INVALIDATED") {
    result.zoneState = "MAP_ONLY";
  }

  // Check direction alignment with Smart Fib setup
  if (input.smartFibSetupType === "LONG_MAP") {
    result.directionAlign = true;
  } else if (input.smartFibSetupType === "SHORT_MAP") {
    result.directionAlign = true;
  }

  // Quality boost based on zone state (only if price is actually near level)
  if (result.priceNearImportantLevel) {
    if (input.smartFibCurrentZoneState === "SNIPER_ACTIVE") {
      result.qualityBoost = 24; // High priority zone
    } else if (input.smartFibCurrentZoneState === "SNIPER_WATCH") {
      result.qualityBoost = 16; // Medium priority watch zone
    } else if (input.smartFibCurrentZoneState === "SILVER_ACTIVE") {
      result.qualityBoost = 14; // Silver reaction confirmed
    } else if (input.smartFibCurrentZoneState === "SILVER_WATCH") {
      result.qualityBoost = 8; // Silver watch zone
    }
  } else {
    // Price far from levels: no boost, treat as MAP_ONLY
    result.qualityBoost = 0;
  }

  return result;
}

function getInstitutionalPrecision(input: DecisionEngineInput): InstitutionalPrecision {
  const mark = input.livePrice || input.lastClose || input.signalPlan.entry || 0;
  const sample = input.recentCandles.slice(-80);
  const last = sample[sample.length - 1];
  const impulseRange = last ? Math.max(last.high - last.low, mark * 0.0001) : mark * 0.002;
  const body = last ? Math.abs(last.close - last.open) : 0;
  const bodyRatio = impulseRange ? body / impulseRange : 0;

  const structureDirection: DecisionSignalDirection =
    input.structureState.event === "BOS_UP" || input.structureState.event === "CHOCH_UP" || input.structureState.event === "SWEEP_LOW"
      ? "LONG"
      : input.structureState.event === "BOS_DOWN" || input.structureState.event === "CHOCH_DOWN" || input.structureState.event === "SWEEP_HIGH"
      ? "SHORT"
      : input.structureState.bias === "BULLISH"
      ? "LONG"
      : input.structureState.bias === "BEARISH"
      ? "SHORT"
      : null;

  const triggerDirection = input.triggerValidation.direction;
  const liquidityDirection = input.liquidityState.trapDirection;
  const signalDirection = input.signalPlan.direction;
  const votes = [structureDirection, triggerDirection, liquidityDirection, signalDirection].filter(Boolean) as Exclude<DecisionSignalDirection, null>[];
  const longVotes = votes.filter((v) => v === "LONG").length;
  const shortVotes = votes.filter((v) => v === "SHORT").length;
  const preferredDirection: DecisionSignalDirection = longVotes > shortVotes ? "LONG" : shortVotes > longVotes ? "SHORT" : triggerDirection || liquidityDirection || structureDirection || signalDirection;

  const structureOpposesPreferred = Boolean(
    preferredDirection === "LONG" && input.structureState.bias === "BEARISH" && input.structureState.event !== "CHOCH_UP" && input.structureState.event !== "SWEEP_LOW"
  ) || Boolean(
    preferredDirection === "SHORT" && input.structureState.bias === "BULLISH" && input.structureState.event !== "CHOCH_DOWN" && input.structureState.event !== "SWEEP_HIGH"
  );

  const triggerOpposesStructure = Boolean(
    triggerDirection && structureDirection && triggerDirection !== structureDirection && input.triggerValidation.quality !== "SNIPER"
  );

  const liquidityOpposesTrigger = Boolean(
    liquidityDirection && triggerDirection && liquidityDirection !== triggerDirection && input.triggerValidation.quality !== "SNIPER"
  );

  const hardConflict = Boolean(preferredDirection && (structureOpposesPreferred || triggerOpposesStructure || liquidityOpposesTrigger));
  const sessionWeight = input.session.includes("New York") ? 10 : input.session.includes("London") ? 8 : input.session.includes("Asia") ? 4 : 1;
  const volatilityWeight = input.candlesVolatility === "NORMAL" ? 6 : input.candlesVolatility === "LOW" ? 2 : -7;
  const triggerWeight = input.triggerValidation.quality === "SNIPER" ? 22 : input.triggerValidation.quality === "STRONG" ? 17 : input.triggerValidation.quality === "VALID" ? 11 : input.triggerValidation.quality === "WEAK" ? 2 : -8;
  const structureWeight = input.structureState.bias === "BULLISH" || input.structureState.bias === "BEARISH" ? 9 : input.structureState.bias === "RANGING" ? -4 : -8;
  const liquidityWeight = liquidityDirection && preferredDirection === liquidityDirection ? 12 : input.liquidityState.sweptHigh || input.liquidityState.sweptLow ? 4 : 0;
  const impulseWeight = bodyRatio > 0.62 ? 6 : bodyRatio > 0.42 ? 3 : -2;
  const alignmentScore = longVotes === shortVotes ? 0 : Math.abs(longVotes - shortVotes) * 8;
  const conflictPenalty = hardConflict ? -34 : triggerOpposesStructure || liquidityOpposesTrigger ? -18 : 0;
  const precisionScore = Math.max(0, Math.min(100, 45 + sessionWeight + volatilityWeight + triggerWeight + structureWeight + liquidityWeight + impulseWeight + alignmentScore + conflictPenalty));

  const institutionalGrade = hardConflict || precisionScore < 55
    ? "REJECT"
    : precisionScore >= 88 && input.triggerValidation.quality !== "NONE"
    ? "A+"
    : precisionScore >= 76
    ? "A"
    : precisionScore >= 64
    ? "B"
    : "C";

  const executeAllowed = Boolean(preferredDirection && !hardConflict && precisionScore >= 76 && input.triggerValidation.quality !== "NONE");
  const eliteAllowed = Boolean(executeAllowed && precisionScore >= 86 && (input.triggerValidation.quality === "STRONG" || input.triggerValidation.quality === "SNIPER"));
  const reason = hardConflict
    ? "Institutional filter blocked the signal because structure, liquidity, and trigger are not aligned."
    : `Institutional ${institutionalGrade} · precision ${precisionScore}% · votes L:${longVotes}/S:${shortVotes} · session weight ${sessionWeight}`;

  return {
    preferredDirection,
    structureDirection,
    longVotes,
    shortVotes,
    hardConflict,
    triggerOpposesStructure,
    liquidityOpposesTrigger,
    precisionScore,
    institutionalGrade,
    executeAllowed,
    eliteAllowed,
    reason,
  };
}

export function buildRawDecisionPlan(input: DecisionEngineInput): { institutionalPrecision: InstitutionalPrecision; rawDecisionPlan: DecisionPlan } {
  const institutionalPrecision = getInstitutionalPrecision(input);
  const smartFibEval = evaluateSmartFibZone(input);
  const mark = input.livePrice || input.lastClose || input.signalPlan.entry || 0;
  const time = typeof input.lastCandleTime === "number" ? input.lastCandleTime : Math.floor(Date.now() / 1000);

  const structureDirection: DecisionSignalDirection =
    input.triggerValidation.direction || input.liquidityState.trapDirection ||
    (input.structureState.event === "BOS_UP" || input.structureState.event === "CHOCH_UP" || input.structureState.event === "SWEEP_LOW"
      ? "LONG"
      : input.structureState.event === "BOS_DOWN" || input.structureState.event === "CHOCH_DOWN" || input.structureState.event === "SWEEP_HIGH"
      ? "SHORT"
      : input.structureState.bias === "BULLISH"
      ? "LONG"
      : input.structureState.bias === "BEARISH"
      ? "SHORT"
      : null);

  const direction = institutionalPrecision.preferredDirection || input.triggerValidation.direction || input.signalPlan.direction || structureDirection;
  const directionalAgreement = Boolean(direction && input.signalPlan.direction && structureDirection && input.signalPlan.direction === structureDirection && !institutionalPrecision.hardConflict);
  const oppositeShift = Boolean(
    direction === "LONG" && (input.structureState.event === "BOS_DOWN" || input.structureState.event === "CHOCH_DOWN" || input.structureState.event === "SWEEP_HIGH")
  ) || Boolean(
    direction === "SHORT" && (input.structureState.event === "BOS_UP" || input.structureState.event === "CHOCH_UP" || input.structureState.event === "SWEEP_LOW")
  );

  const triggerScore = input.structureState.event === "NONE" ? 0 : input.structureState.event.includes("CHOCH") ? 18 : input.structureState.event.includes("BOS") ? 16 : input.structureState.event.includes("SWEEP") ? 14 : 10;
  const agreementBoost = directionalAgreement ? 12 : structureDirection && input.signalPlan.direction && structureDirection !== input.signalPlan.direction ? -18 : 0;
  const liquidityBoost = input.liquidityState.trapDirection && direction === input.liquidityState.trapDirection ? input.liquidityState.score : Math.max(0, input.liquidityState.score - 10);
  const triggerBoost = input.triggerValidation.direction && direction === input.triggerValidation.direction ? input.triggerValidation.score : Math.max(0, input.triggerValidation.score - 12);
  const volatilityAdjust = input.candlesVolatility === "HIGH" ? -8 : input.candlesVolatility === "LOW" ? -3 : 4;
  const institutionalBoost = Math.round((institutionalPrecision.precisionScore - 60) * 0.45);
  const conflictPenalty = institutionalPrecision.hardConflict ? -42 : institutionalPrecision.triggerOpposesStructure || institutionalPrecision.liquidityOpposesTrigger ? -22 : 0;
  const smartFibBoost = smartFibEval.mapValid && smartFibEval.swingQualityAcceptable ? smartFibEval.qualityBoost : 0;
  const proSignal = Boolean(direction && institutionalPrecision.eliteAllowed && (directionalAgreement || input.liquidityState.trapDirection === direction || input.triggerValidation.quality === "SNIPER" || smartFibEval.zoneState === "SNIPER_ACTIVE"));
  const quality = Math.round(Math.max(0, Math.min(100, input.signalPlan.confidence + input.structureState.score + triggerScore + liquidityBoost + triggerBoost + agreementBoost + volatilityAdjust + institutionalBoost + conflictPenalty + smartFibBoost - 32)));
  const activeTradeBlocking = Boolean(
    input.activeExecutionTrade &&
      input.activeExecutionTrade.symbol === input.selectedSymbol &&
      ["OPEN", "TP1_HIT", "TP2_HIT", "RUNNER", "BREAKEVEN", "CLOSING"].includes(input.activeExecutionTrade.status) &&
      (!input.allowMultiTimeframeTrades || input.activeExecutionTrade.timeframe === input.timeframe)
  );
  const cooldownBlocking = input.tradeRecalcCooldownCycles > 0;

  const phase: DecisionPhase = !input.decisionSettings.enabled
    ? input.signalPlan.state === "NO TRADE" || input.signalPlan.state === "WAITING" ? "SCANNING" : "SPAWNED"
    : activeTradeBlocking
    ? "MANAGE"
    : cooldownBlocking
    ? "SCANNING"
    : !mark || !direction
    ? "SCANNING"
    : institutionalPrecision.hardConflict
    ? "FILTERED"
    : oppositeShift && input.decisionSettings.cancelOnOppositeShift
    ? "FILTERED"
    : quality >= Math.max(input.decisionSettings.executeConfidence, 86) && institutionalPrecision.executeAllowed && (!input.decisionSettings.requireTriggerForExecute || input.triggerValidation.quality === "VALID" || input.triggerValidation.quality === "STRONG" || input.triggerValidation.quality === "SNIPER") && (!input.decisionSettings.proSignalOnly || proSignal)
    ? "EXECUTE"
    : quality >= Math.max(input.decisionSettings.validateConfidence, 72) && !institutionalPrecision.hardConflict
    ? "VALIDATED"
    : quality >= Math.max(input.decisionSettings.spawnConfidence, 58) && institutionalPrecision.institutionalGrade !== "REJECT"
    ? "SPAWNED"
    : "NO_TRADE";

  const riskDistance = Math.max(
    input.signalPlan.entry && input.signalPlan.sl ? Math.abs(input.signalPlan.entry - input.signalPlan.sl) : 0,
    mark * 0.0022
  );
  const entry = input.signalPlan.entry || input.smartFibClosestLevelPrice || mark;
  const sl = input.signalPlan.sl || input.smartFibInvalidationPrice || (direction === "LONG" ? entry - riskDistance : entry + riskDistance);
  const tp1 = input.signalPlan.tp1 || (direction === "LONG" ? entry + riskDistance * 1.25 : entry - riskDistance * 1.25);
  const tp2 = input.signalPlan.tp2 || (direction === "LONG" ? entry + riskDistance * 2.0 : entry - riskDistance * 2.0);
  const tp3 = input.signalPlan.tp3 || (direction === "LONG" ? entry + riskDistance * 3.0 : entry - riskDistance * 3.0);
  const invalidation = direction === "LONG" ? Math.min(sl, input.structureState.lastSwingLow || sl) : Math.max(sl, input.structureState.lastSwingHigh || sl);

  const smartFibInfo = smartFibEval.mapValid ? ` · Smart Fib ${smartFibEval.zoneState}` : "";
  const action = phase === "EXECUTE"
    ? `ENTER NOW ${direction}: institutional ${institutionalPrecision.institutionalGrade} alignment confirmed${smartFibInfo}. Use pro-signal risk control.`
    : phase === "VALIDATED"
    ? `WAIT RETEST ${direction}: setup validated${smartFibInfo}, but precision filter wants cleaner continuation/retest.`
    : phase === "SPAWNED"
    ? `EARLY WATCH ${direction}: idea spawned${smartFibInfo}, not mature enough for execution.`
    : phase === "FILTERED"
    ? `FILTERED: ${institutionalPrecision.reason}${smartFibEval.mapValid ? ` · ${smartFibEval.blockedReason}` : ""}`
    : "Scan only. No institutional-grade decision yet.";

  const smartFibReason = smartFibEval.mapValid 
    ? `Smart Fib zone ${smartFibEval.zoneState} · quality ${Math.round((input.smartFibSwingQualityScore || 0))}% · range ${input.smartFibRangeQuality || "UNKNOWN"}`
    : smartFibEval.blockedReason;
  const reason = [institutionalPrecision.reason, smartFibReason, input.structureState.summary, input.liquidityState.summary, input.triggerValidation.summary, input.signalPlan.reason, proSignal ? "Elite pro signal conditions detected." : "Waiting for stronger institutional alignment."].filter(Boolean).join(" ");
  const id = `${input.timeframe}-${direction || "WAIT"}-${phase}-${time}`;

  return {
    institutionalPrecision,
    rawDecisionPlan: {
      id,
      symbol: input.selectedSymbol,
      timeframe: input.timeframe,
      mode:
        input.tradeModeSelection === "AUTO"
          ? (["1m", "3m", "5m", "15m"].includes(input.timeframe) ? "SCALP" : "SWING")
          : input.tradeModeSelection,
      phase,
      direction,
      confidence: input.signalPlan.confidence,
      quality,
      risk: input.signalPlan.risk,
      entry,
      sl,
      tp1,
      tp2,
      tp3,
      trigger: input.structureState.event,
      structure: input.structureState.bias,
      liquidity: input.liquidityState.bias,
      triggerQuality: input.triggerValidation.quality,
      managementAction: "WAIT",
      proSignal,
      invalidation,
      action,
      reason,
      createdAt: Date.now(),
      expiresAt: input.decisionSettings.holdBars > 0 ? Date.now() + input.decisionSettings.holdBars * (TF_SECONDS[input.timeframe] || 300) * 1000 : null,
      markerTime: input.signalPlan.markerTime || time,
      shouldMark: !institutionalPrecision.hardConflict && (phase === "VALIDATED" || phase === "EXECUTE" || (phase === "SPAWNED" && quality >= 68)),
    },
  };
}

