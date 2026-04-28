import { classifyStrategy, type StrategyProfile } from "@/core/strategyLevel";
import { applyAdaptiveConfidence, type AdaptiveWeights } from "@/core/adaptiveEngine";
import { scoreSignalQuality, type SignalQualityGrade } from "@/core/signalQualityEngine";

export type UnifiedMode = "SCALP" | "SWING";
export type UnifiedPhase = "SCANNING" | "WATCH" | "VALIDATED" | "EXECUTE" | "MANAGE" | "EXIT";

type ActiveTradeLike = {
  status: string;
  side: "LONG" | "SHORT";
  symbol: string;
  timeframe: string;
  entry?: number;
  sl?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  openedAt?: number;
};

type SignalPlanLike = {
  state: string;
  direction: "LONG" | "SHORT" | null;
  confidence: number;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  reason: string;
};

type DecisionPlanLike = {
  phase: string;
  direction: "LONG" | "SHORT" | null;
  quality: number;
  entry: number | null;
  sl: number | null;
  invalidation?: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  reason: string;
};

type TradeMarkerLike = {
  symbol?: string;
  timeframe?: string;
  openedAt?: number;
  result?: string;
  pnl?: number;
  closedAt?: number;
};

type CandleSummaryLike = {
  volatility: "LOW" | "NORMAL" | "HIGH";
  trend: "BULLISH" | "BEARISH" | "MIXED" | "WAITING";
  impulse: "BULLISH" | "BEARISH" | "NONE";
};

export type UnifiedBrainContext = {
  symbol: string;
  selectedMode: UnifiedMode;
  selectedTimeframe: string;
  session: string;
  livePrice: number | null;
  activeTrade: ActiveTradeLike | null;
  tradeMarkers: TradeMarkerLike[];
  draftUsd: string;
  candlesSummary: CandleSummaryLike;
  structureScore: number;
  liquidityScore: number;
  triggerScore: number;
  learningWins?: number;
  learningLosses?: number;
  signalPlan: SignalPlanLike;
  decisionPlan: DecisionPlanLike;
};

export type UnifiedBrainOutput = {
  mode: UnifiedMode;
  timeframe: string;
  phase: UnifiedPhase;
  direction: "LONG" | "SHORT" | null;
  confidence: number;
  signalPlan: SignalPlanLike;
  decision: DecisionPlanLike & { phase: UnifiedPhase };
  marketRegime: "TRENDING" | "RANGING" | "CHOPPY" | "HIGH_VOL" | "LOW_VOL";
  mlState: {
    mlLongProb: number;
    mlShortProb: number;
    expectedWinRate: number;
    tradeQualityScore: number;
  };
  portfolio: {
    baseBalance: number;
    equity: number;
    freeMargin: number;
    drawdownPct: number;
  };
  riskFirewall: {
    state: "NORMAL" | "RISK" | "DANGER" | "PAUSED";
    canTrade: boolean;
    maxRiskPct: number;
    reason: string;
  };
  finalDecision: {
    action: "ALLOW_TRADE" | "BLOCK_TRADE" | "REDUCE_SIZE" | "WAIT" | "PAUSE_SYSTEM";
    reason: string;
  };
  adaptiveSizing: {
    margin: number;
    maxRiskUsd: number;
  };
  institutionalContext: {
    behavior: "LIQUIDITY_SWEEP" | "FAKE_BREAKOUT" | "RECLAIM" | "DISPLACEMENT" | "COMPRESSION" | "NEUTRAL";
    trapRisk: number;
    sweepSide: "BUY_SIDE" | "SELL_SIDE" | "NONE";
    reclaimDetected: boolean;
    displacementDetected: boolean;
    compressionDetected: boolean;
  };
  symbolStrength: number;
  relativeMomentum: number;
  watchlistRank: number;
  managementAction: "HOLD" | "PROTECT_BE" | "TRAIL" | "SCALE_OUT" | "EARLY_EXIT" | "EXIT";
  strategyProfile: StrategyProfile;
  tradeThesis: {
    summary: string;
    entryLogic: string;
    invalidation: string;
    targetLogic: string;
    riskNotes: string;
    managementPlan: string;
    nextConfirmation: string;
  };
  riskEngine: {
    maxRiskState: "NORMAL" | "RISK" | "DANGER" | "PAUSED";
    riskRewardValid: boolean;
    riskRewardRatio: number;
    volatilityAdjustedSL: string;
    dynamicPositionWarning: string;
    overLeverageWarning: string;
    noTradeRiskReason: string;
  };
  managementPlaybook: {
    action: "HOLD" | "PROTECT_BE" | "TRAIL" | "SCALE_OUT" | "EARLY_EXIT" | "EXIT";
    reason: string;
    protectBE: boolean;
    trailSL: boolean;
    scaleOut: boolean;
    earlyExit: boolean;
    exitReason: string;
    nextCheckpoint: string;
  };
  entryGrade: "A+" | "A" | "B" | "C" | "Reject";
  adaptiveWeights: AdaptiveWeights;
  qualityScore: number;
  qualityGrade: SignalQualityGrade;
  confirmationCount: number;
  mtfAlignment: boolean;
  fakeoutFlag: boolean;
  whyDecision: string;
  whyNoTrade: string;
  invalidationReason: string;
  riskReason: string;
  entryReason: string;
  managementReason: string;
  debug: {
    mode: UnifiedMode;
    timeframe: string;
    direction: "LONG" | "SHORT" | null;
    phase: UnifiedPhase;
    confidence: number;
    structureScore: number;
    liquidityScore: number;
    triggerScore: number;
    riskPenalty: number;
    learningAdjustment: number;
    signalBlocked: boolean;
    conflictReason: string;
    volatilityRegime: "LOW" | "NORMAL" | "HIGH";
    sessionQuality: number;
    managementAction: string;
    institutionalBehavior: string;
    activeTradeOverride: boolean;
    blockedReason: string;
    aiContextSource: "UnifiedWolvreneBrain";
    strategyProfile: StrategyProfile;
    entryGrade: "A+" | "A" | "B" | "C" | "Reject";
    riskRewardCheck: string;
    strategyBlockedReason: string;
    aiContradictionGuard: true;
    promptMode: "Beginner" | "Trader" | "Pro";
    aiPayloadSanitized: true;
    aiRateProtected: true;
    institutionalVoiceEnabled: true;
    aiUsesCandles: false;
    aiUsesIndicators: false;
    aiUsesLocalDecisionLogic: false;
    executionState: "idle" | "pending" | "executed" | "managing" | "closed";
    tradeLogged: boolean;
    performanceUpdated: boolean;
    adaptiveWeights: AdaptiveWeights;
    discordSent: boolean;
    blockedReasonCode: string;
  };
  hardTradeOverride: boolean;
  reason: string;
};

const SCALP_TIMEFRAMES = ["1m", "3m", "5m", "15m"] as const;
const SWING_TIMEFRAMES = ["15m", "30m", "1H", "4H", "1D"] as const;

function normalizePhase(phase: string): UnifiedPhase {
  if (phase === "EXECUTE") return "EXECUTE";
  if (phase === "MANAGE") return "MANAGE";
  if (phase === "VALIDATED") return "VALIDATED";
  if (phase === "EXIT") return "EXIT";
  if (phase === "SPAWNED" || phase === "WATCH") return "WATCH";
  return "SCANNING";
}

export function runUnifiedBrain(context: UnifiedBrainContext): UnifiedBrainOutput {
  const allowed = context.selectedMode === "SCALP" ? SCALP_TIMEFRAMES : SWING_TIMEFRAMES;
  const timeframe = allowed.includes(context.selectedTimeframe as never) ? context.selectedTimeframe : allowed[0];
  const active = context.activeTrade && ["OPEN", "TP1_HIT", "TP2_HIT", "RUNNER", "BREAKEVEN", "CLOSING"].includes(context.activeTrade.status);

  const basePhase = normalizePhase(context.decisionPlan.phase);
  const modeTriggerFloor = context.selectedMode === "SCALP" ? 62 : 52;
  const modeStructureFloor = context.selectedMode === "SCALP" ? 54 : 62;
  const modeLiquidityFloor = context.selectedMode === "SCALP" ? 52 : 58;
  const aligned =
    context.structureScore >= modeStructureFloor &&
    context.liquidityScore >= modeLiquidityFloor &&
    context.triggerScore >= modeTriggerFloor;
  const lowLiquidity = context.liquidityScore < modeLiquidityFloor;
  const weakTrigger = context.triggerScore < modeTriggerFloor;
  const structureConflict = context.structureScore < modeStructureFloor;
  const extremeVolatility = context.candlesSummary.volatility === "HIGH";
  const blockedReason = !aligned
    ? structureConflict
      ? "Structure conflict."
      : lowLiquidity
      ? "Low liquidity."
      : weakTrigger
      ? "Weak trigger quality."
      : "Signal conflict."
    : extremeVolatility
    ? "Extreme volatility regime."
    : "";
  const phase: UnifiedPhase = active ? "MANAGE" : !aligned ? "SCANNING" : basePhase;
  const direction = active ? context.activeTrade!.side : (context.decisionPlan.direction || context.signalPlan.direction);
  const sessionScore = context.session.includes("London") || context.session.includes("New York") ? 72 : context.session.includes("Asia") ? 56 : 50;
  const modeProfile = context.selectedMode === "SCALP" ? 65 : 72;
  const riskPenalty =
    (context.candlesSummary.volatility === "HIGH" ? 12 : 4) +
    (active ? 6 : 0) +
    (!aligned ? 20 : 0);
  const rawConfidence = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        context.structureScore * 0.24 +
          context.liquidityScore * 0.2 +
          context.triggerScore * 0.24 +
          sessionScore * 0.12 +
          modeProfile * 0.12 +
          Math.max(context.decisionPlan.quality, context.signalPlan.confidence) * 0.08 -
          riskPenalty
      )
    )
  );
  const totalLearning = (context.learningWins || 0) + (context.learningLosses || 0);
  const learningEdge = totalLearning > 0 ? ((context.learningWins || 0) - (context.learningLosses || 0)) / totalLearning : 0;
  const learningAdjustment = Math.max(-8, Math.min(8, Math.round(learningEdge * 8)));
  const confidenceCap =
    weakTrigger || structureConflict || lowLiquidity
      ? 64
      : extremeVolatility
      ? 68
      : active
      ? 72
      : sessionScore < 58
      ? 70
      : 92;
  const baseConfidence = Math.max(0, Math.min(confidenceCap, rawConfidence + learningAdjustment));
  const confidence = baseConfidence;
  const marketRegime: UnifiedBrainOutput["marketRegime"] =
    context.candlesSummary.volatility === "HIGH"
      ? "HIGH_VOL"
      : context.candlesSummary.volatility === "LOW"
      ? "LOW_VOL"
      : phase === "SCANNING"
      ? "RANGING"
      : "TRENDING";
  const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
  const trendFeature = context.candlesSummary.trend === "BULLISH" ? 1 : context.candlesSummary.trend === "BEARISH" ? -1 : 0;
  const momentumFeature = context.candlesSummary.impulse === "BULLISH" ? 1 : context.candlesSummary.impulse === "BEARISH" ? -1 : 0;
  const volatilityFeature = context.candlesSummary.volatility === "HIGH" ? 1 : context.candlesSummary.volatility === "LOW" ? -1 : 0;
  const longLogit = 0.7 * trendFeature + 0.6 * momentumFeature - 0.35 * volatilityFeature + confidence / 120;
  const shortLogit = -0.7 * trendFeature - 0.6 * momentumFeature - 0.35 * volatilityFeature + confidence / 120;
  const mlLongProb = Math.round(sigmoid(longLogit) * 100);
  const mlShortProb = Math.round(sigmoid(shortLogit) * 100);
  const tradeQualityScore = Math.round(Math.max(0, Math.min(100, confidence * 0.7 + Math.max(mlLongProb, mlShortProb) * 0.3)));
  const mlState = {
    mlLongProb,
    mlShortProb,
    expectedWinRate: Math.round((Math.max(mlLongProb, mlShortProb) + confidence) / 2),
    tradeQualityScore,
  };
  const closedTradePnL = context.tradeMarkers
    .filter((marker) => marker.result && Number.isFinite(marker.pnl))
    .reduce((sum, marker) => sum + Number(marker.pnl || 0), 0);
  const baseBalance = 10000;
  const equity = baseBalance + closedTradePnL;
  const openMargin = 0;
  const freeMargin = Math.max(0, equity - openMargin);
  const peakEquity = Math.max(baseBalance, equity);
  const drawdownPct = peakEquity > 0 ? Math.max(0, ((peakEquity - equity) / peakEquity) * 100) : 0;
  const portfolio = { baseBalance, equity, freeMargin, drawdownPct };
  const closed = context.tradeMarkers.filter((marker) => Boolean(marker.result));
  const recent = closed.slice(0, 12);
  let losingStreak = 0;
  for (const marker of recent) {
    if (Number(marker.pnl || 0) < 0) losingStreak += 1;
    else break;
  }
  const dailyPnL = closed
    .filter((marker) => marker.closedAt && Date.now() - Number(marker.closedAt) <= 24 * 60 * 60 * 1000)
    .reduce((sum, marker) => sum + Number(marker.pnl || 0), 0);
  const dailyLossPct = portfolio.equity > 0 ? Math.max(0, (-dailyPnL / portfolio.equity) * 100) : 0;
  const pauseByDrawdown = portfolio.drawdownPct >= 10;
  const pauseByLoss = dailyLossPct >= 4;
  const pauseByStreak = losingStreak >= 7;
  const riskState: "NORMAL" | "RISK" | "DANGER" | "PAUSED" =
    pauseByDrawdown || pauseByLoss || pauseByStreak ? "PAUSED" : losingStreak >= 5 ? "DANGER" : losingStreak >= 3 ? "RISK" : "NORMAL";
  const riskFirewall = {
    state: riskState,
    canTrade: riskState !== "PAUSED",
    maxRiskPct: riskState === "RISK" ? 0.6 : riskState === "DANGER" ? 0.35 : 1,
    reason: pauseByDrawdown
      ? "Drawdown firewall active (>10%)."
      : pauseByLoss
      ? "Daily loss firewall active (>4%)."
      : pauseByStreak
      ? "Loss-streak firewall active (>=7)."
      : "Risk firewall clear.",
  } as const;
  const finalDecision =
    !riskFirewall.canTrade
      ? { action: "PAUSE_SYSTEM" as const, reason: riskFirewall.reason }
      : tradeQualityScore < 45
      ? { action: "BLOCK_TRADE" as const, reason: "ML quality collapsed below threshold." }
      : context.candlesSummary.volatility === "HIGH"
      ? { action: "REDUCE_SIZE" as const, reason: "Extreme volatility: reduce size and wait for confirmation." }
      : phase === "EXECUTE"
      ? { action: "ALLOW_TRADE" as const, reason: "Confluence and risk checks are valid." }
      : { action: "WAIT" as const, reason: "Waiting for execution-grade phase." };
  const price = context.livePrice || context.signalPlan.entry || context.decisionPlan.entry || 0;
  const rr = context.decisionPlan.entry && context.decisionPlan.sl && context.decisionPlan.tp1
    ? Math.abs(context.decisionPlan.tp1 - context.decisionPlan.entry) / Math.max(Math.abs(context.decisionPlan.entry - context.decisionPlan.sl), 0.00001)
    : 0;
  const riskRewardValid = rr >= 1.2;
  const activeTrade = context.activeTrade;
  const tpProgress = activeTrade && activeTrade.entry && activeTrade.tp1 && price
    ? Math.max(0, Math.min(1.5, Math.abs((price - activeTrade.entry) / Math.max(Math.abs(activeTrade.tp1 - activeTrade.entry), 0.00001))))
    : 0;
  const timeInTradeMin = activeTrade?.openedAt ? Math.max(0, Math.floor((Date.now() - activeTrade.openedAt) / 60000)) : 0;
  const managementAction: UnifiedBrainOutput["managementAction"] = !active
    ? "EXIT"
    : activeTrade?.status === "TP1_HIT"
    ? "SCALE_OUT"
    : activeTrade?.status === "TP2_HIT" || activeTrade?.status === "RUNNER"
    ? "TRAIL"
    : activeTrade?.status === "BREAKEVEN"
    ? "PROTECT_BE"
    : tpProgress > 1.2 || timeInTradeMin > 120
    ? "EARLY_EXIT"
    : "HOLD";
  const institutionalContext: UnifiedBrainOutput["institutionalContext"] = {
    behavior: structureConflict
      ? "FAKE_BREAKOUT"
      : context.triggerScore >= 72
      ? "DISPLACEMENT"
      : context.liquidityScore >= 70 && context.structureScore < 58
      ? "LIQUIDITY_SWEEP"
      : context.liquidityScore >= 62
      ? "RECLAIM"
      : context.triggerScore < 52
      ? "COMPRESSION"
      : "NEUTRAL",
    trapRisk: Math.max(0, Math.min(100, Math.round((100 - context.liquidityScore) * 0.5 + (100 - context.structureScore) * 0.25 + (extremeVolatility ? 20 : 0)))),
    sweepSide: context.structureScore > context.liquidityScore ? "SELL_SIDE" : context.liquidityScore > context.structureScore ? "BUY_SIDE" : "NONE",
    reclaimDetected: context.liquidityScore >= 62 && context.triggerScore >= 55,
    displacementDetected: context.triggerScore >= 72,
    compressionDetected: context.triggerScore < 52,
  };
  const symbolStrength = Math.max(0, Math.min(100, Math.round((context.structureScore + context.liquidityScore + context.triggerScore) / 3)));
  const relativeMomentum = Math.max(-100, Math.min(100, Math.round((context.candlesSummary.trend === "BULLISH" ? 40 : context.candlesSummary.trend === "BEARISH" ? -40 : 0) + (context.candlesSummary.impulse === "BULLISH" ? 30 : context.candlesSummary.impulse === "BEARISH" ? -30 : 0))));
  const watchlistRank = Math.max(1, Math.min(10, Math.ceil((100 - symbolStrength) / 10)));
  const managementReason =
    active && context.activeTrade
      ? context.activeTrade.status === "BREAKEVEN"
        ? "PROTECT_BE"
        : context.activeTrade.status === "RUNNER" || context.activeTrade.status === "TP2_HIT"
        ? "TRAIL"
        : context.activeTrade.status === "TP1_HIT"
        ? "SCALE_OUT"
        : context.activeTrade.status === "CLOSING"
        ? "EARLY_EXIT"
        : "MANAGE"
      : "EXIT";
  const baseMargin = Math.max(10, Number(context.draftUsd) || 100);
  const confidenceFactor = Math.max(0.35, Math.min(1.6, confidence / 100));
  const mlFactor = Math.max(0.4, Math.min(1.4, tradeQualityScore / 100));
  const drawdownFactor = Math.max(0.25, 1 - portfolio.drawdownPct / 20);
  const volFactor = context.candlesSummary.volatility === "HIGH" ? 0.6 : context.candlesSummary.volatility === "LOW" ? 1.1 : 1;
  const systemFactor = finalDecision.action === "REDUCE_SIZE" ? 0.6 : finalDecision.action === "BLOCK_TRADE" || finalDecision.action === "PAUSE_SYSTEM" ? 0 : 1;
  const adaptiveSizing = {
    margin: Math.max(10, Math.round(baseMargin * confidenceFactor * mlFactor * drawdownFactor * volFactor * systemFactor)),
    maxRiskUsd: portfolio.equity * (riskFirewall.maxRiskPct / 100),
  };
  const strategyProfile = classifyStrategy({
    phase,
    direction,
    mode: context.selectedMode,
    structureScore: context.structureScore,
    liquidityScore: context.liquidityScore,
    triggerScore: context.triggerScore,
    sessionQuality: sessionScore,
    volatility: context.candlesSummary.volatility,
    riskRewardRatio: rr,
    invalidation: context.decisionPlan.invalidation || context.decisionPlan.sl || null,
    hardTradeOverride: Boolean(active),
    activeTradeSide: context.activeTrade?.side || null,
    institutionalBehavior: institutionalContext.behavior,
  });
  const volumeScore = context.candlesSummary.volatility === "LOW" ? 48 : context.candlesSummary.volatility === "HIGH" ? 52 : 72;
  const fakeoutFlag = context.triggerScore < 55 && context.candlesSummary.volatility === "HIGH";
  const mtfAlignment = direction
    ? (direction === "LONG" && context.candlesSummary.trend !== "BEARISH") || (direction === "SHORT" && context.candlesSummary.trend !== "BULLISH")
    : false;
  const quality = scoreSignalQuality({
    structureScore: context.structureScore,
    liquidityScore: context.liquidityScore,
    triggerScore: context.triggerScore,
    volumeScore,
    sessionScore,
    volatilityRegime: context.candlesSummary.volatility,
    conflictFlags: {
      structureConflict,
      liquidityConflict: lowLiquidity,
      triggerConflict: weakTrigger,
      fakeout: fakeoutFlag,
    },
    phase,
  });
  const managementPlaybook = {
    action: managementAction,
    reason: managementReason,
    protectBE: managementAction === "PROTECT_BE" || managementAction === "TRAIL",
    trailSL: managementAction === "TRAIL",
    scaleOut: managementAction === "SCALE_OUT",
    earlyExit: managementAction === "EARLY_EXIT",
    exitReason: managementAction === "EXIT" || managementAction === "EARLY_EXIT" ? "Thesis weak or management cycle complete." : "",
    nextCheckpoint: active ? "Re-check at next candle close or TP event." : "Wait for validated execution window.",
  } as const;
  const entryGrade: UnifiedBrainOutput["entryGrade"] =
    phase === "SCANNING" || !riskRewardValid || !context.decisionPlan.sl
      ? "Reject"
      : context.structureScore >= 70 && context.liquidityScore >= 70 && context.triggerScore >= 72 && sessionScore >= 70 && context.candlesSummary.volatility !== "HIGH" && !active
      ? "A+"
      : context.structureScore >= 64 && context.liquidityScore >= 62 && context.triggerScore >= 64
      ? "A"
      : context.structureScore >= 56 && context.liquidityScore >= 56 && context.triggerScore >= 56
      ? "B"
      : "C";
  const riskEngine = {
    maxRiskState: riskState,
    riskRewardValid,
    riskRewardRatio: Number(rr.toFixed(2)),
    volatilityAdjustedSL: context.candlesSummary.volatility === "HIGH" ? "Use wider invalidation or skip execution." : "Standard invalidation sizing.",
    dynamicPositionWarning: adaptiveSizing.margin < Number(context.draftUsd || 0) ? "Position size reduced by risk model." : "Position size is within risk model allowance.",
    overLeverageWarning: adaptiveSizing.margin <= 0 ? "Execution blocked by risk controls." : "",
    noTradeRiskReason: !riskRewardValid ? "Risk/reward below minimum threshold." : riskFirewall.reason,
  };
  const tradeThesis = {
    summary: phase === "EXECUTE" ? "Execution conditions aligned with institutional confluence." : "No active execution thesis yet.",
    entryLogic: context.decisionPlan.entry ? `Entry anchored near ${context.decisionPlan.entry} with ${context.selectedMode} profile.` : "No entry zone confirmed.",
    invalidation: context.decisionPlan.sl ? `Invalidate if SL reference ${context.decisionPlan.sl} is breached.` : "No invalidation confirmed.",
    targetLogic: context.decisionPlan.tp1 ? `Targets staged through TP1 ${context.decisionPlan.tp1}, TP2 ${context.decisionPlan.tp2 || "--"}, TP3 ${context.decisionPlan.tp3 || "--"}.` : "No target ladder yet.",
    riskNotes: riskEngine.noTradeRiskReason,
    managementPlan: managementPlaybook.reason,
    nextConfirmation: strategyProfile.nextAction,
  };

  const adaptiveWeights: AdaptiveWeights = {
    strategyWeight: 1,
    sessionWeight: sessionScore < 58 ? 0.92 : 1,
    timeframeWeight: context.selectedMode === "SCALP" ? 0.98 : 1.02,
    volatilityWeight: context.candlesSummary.volatility === "HIGH" ? 0.85 : context.candlesSummary.volatility === "LOW" ? 0.95 : 1,
  };
  const finalConfidence = applyAdaptiveConfidence(baseConfidence, adaptiveWeights);
  const tfSec = context.selectedTimeframe === "1m" ? 60 : context.selectedTimeframe === "3m" ? 180 : context.selectedTimeframe === "5m" ? 300 : context.selectedTimeframe === "15m" ? 900 : context.selectedTimeframe === "30m" ? 1800 : context.selectedTimeframe === "1H" ? 3600 : context.selectedTimeframe === "4H" ? 14400 : 86400;
  const cooldownMs = tfSec * 6 * 1000;
  const lastExecution = context.tradeMarkers.find((m) => m.symbol === context.symbol && m.timeframe === context.selectedTimeframe && !m.result);
  const lastOpenedMs = lastExecution?.openedAt ? (Number(lastExecution.openedAt) < 1_000_000_000_000 ? Number(lastExecution.openedAt) * 1000 : Number(lastExecution.openedAt)) : 0;
  const cooldownActive = Boolean(lastOpenedMs && Date.now() - lastOpenedMs < cooldownMs);
  const signalQualityBlocked =
    phase === "EXECUTE" &&
    (!riskRewardValid ||
      context.triggerScore < 52 ||
      context.candlesSummary.volatility === "HIGH" ||
      !mtfAlignment ||
      cooldownActive ||
      quality.qualityGrade === "C" ||
      quality.confirmationCount < quality.requiredConfirmations ||
      Boolean(blockedReason) ||
      Boolean(active));
  const outputPhase: UnifiedPhase = signalQualityBlocked ? "SCANNING" : phase;
  const executionState: UnifiedBrainOutput["debug"]["executionState"] = active ? "managing" : outputPhase === "EXECUTE" ? "pending" : outputPhase === "EXIT" ? "closed" : "idle";

  return {
    mode: context.selectedMode,
    timeframe,
    phase: outputPhase,
    direction,
    confidence: finalConfidence,
    signalPlan: context.signalPlan,
    decision: {
      ...context.decisionPlan,
      phase: outputPhase,
      direction,
    },
    marketRegime,
    mlState,
    portfolio,
    riskFirewall,
    finalDecision,
    adaptiveSizing,
    institutionalContext,
    symbolStrength,
    relativeMomentum,
    watchlistRank,
    managementAction,
    strategyProfile,
    tradeThesis,
    riskEngine,
    managementPlaybook,
    entryGrade,
    adaptiveWeights,
    qualityScore: quality.qualityScore,
    qualityGrade: quality.qualityGrade,
    confirmationCount: quality.confirmationCount,
    mtfAlignment,
    fakeoutFlag,
    whyDecision: outputPhase === "EXECUTE" ? "Aligned structure, liquidity, and trigger with acceptable risk." : "",
    whyNoTrade: outputPhase === "SCANNING" ? blockedReason || (cooldownActive ? "Signal cooldown active for this symbol/timeframe." : "") || quality.blockedReason || riskEngine.noTradeRiskReason || "No clean setup yet." : "",
    invalidationReason: context.decisionPlan.sl ? `Invalidate if price reaches SL reference ${context.decisionPlan.sl}.` : "No invalidation level.",
    riskReason: riskFirewall.reason,
    entryReason: outputPhase === "EXECUTE" ? `Entry allowed in ${context.selectedMode} profile with confidence ${finalConfidence}%.` : "Entry blocked until validation.",
    managementReason,
    debug: {
      mode: context.selectedMode,
      timeframe,
      direction,
      phase: outputPhase,
      confidence: finalConfidence,
      structureScore: context.structureScore,
      liquidityScore: context.liquidityScore,
      triggerScore: context.triggerScore,
      riskPenalty,
      learningAdjustment,
      signalBlocked: Boolean(blockedReason),
      conflictReason: blockedReason,
      volatilityRegime: context.candlesSummary.volatility,
      sessionQuality: sessionScore,
      managementAction,
      institutionalBehavior: institutionalContext.behavior,
      activeTradeOverride: Boolean(active),
      blockedReason,
      aiContextSource: "UnifiedWolvreneBrain",
      strategyProfile,
      entryGrade,
      riskRewardCheck: riskRewardValid ? "PASS" : "FAIL",
      strategyBlockedReason: strategyProfile.blockedReason,
      aiContradictionGuard: true,
      promptMode: "Trader",
      aiPayloadSanitized: true,
      aiRateProtected: true,
      institutionalVoiceEnabled: true,
      aiUsesCandles: false,
      aiUsesIndicators: false,
      aiUsesLocalDecisionLogic: false,
      executionState,
      tradeLogged: false,
      performanceUpdated: false,
      adaptiveWeights,
      discordSent: false,
      blockedReasonCode: quality.blockedReason ? "QUALITY_BLOCK" : blockedReason ? "CORE_BLOCK" : "",
    },
    hardTradeOverride: Boolean(active),
    reason:
      active
        ? "Active trade override enabled: managing existing trade, new signals blocked."
        : blockedReason || context.decisionPlan.reason || context.signalPlan.reason || "Scanning fallback: no clean decision.",
  };
}
