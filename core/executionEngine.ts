import type { UnifiedBrainOutput } from "@/core/unifiedBrain";

export type ExecutionState = "idle" | "pending" | "executed" | "managing" | "closed";

type ActiveTradeLike = {
  side: "LONG" | "SHORT";
  status: string;
};

export type ExecutionEvaluation = {
  state: ExecutionState;
  canExecute: boolean;
  blockedReason: string;
  allowScaleIn: boolean;
};

export function evaluateExecutionReadiness(input: {
  brain: UnifiedBrainOutput;
  activeTrade: ActiveTradeLike | null;
  allowScaleIn?: boolean;
}): ExecutionEvaluation {
  const { brain, activeTrade } = input;
  const allowScaleIn = Boolean(input.allowScaleIn);
  const hasLevels = Boolean(brain.decision.entry && brain.decision.sl && brain.decision.tp1 && brain.decision.tp2 && brain.decision.tp3);
  const gradeAllowed = brain.entryGrade === "A+" || brain.entryGrade === "A";
  const qualityAllowed = brain.qualityGrade === "A+" || brain.qualityGrade === "A";
  const confidenceAllowed = brain.confidence >= 80;
  const adaptiveApproved = brain.adaptiveWeights.strategyWeight >= 0.9 && brain.adaptiveWeights.volatilityWeight >= 0.85;
  const riskAllowed = brain.riskEngine.riskRewardValid && brain.finalDecision.action !== "BLOCK_TRADE" && brain.finalDecision.action !== "PAUSE_SYSTEM";
  const invalidationKnown = Boolean(brain.decision.invalidation || brain.decision.sl);
  const openTrade = Boolean(activeTrade && ["OPEN", "TP1_HIT", "TP2_HIT", "RUNNER", "BREAKEVEN", "CLOSING"].includes(activeTrade.status));
  const oppositeActive = Boolean(activeTrade?.side && brain.direction && activeTrade.side !== brain.direction);

  if (openTrade && !allowScaleIn) return { state: "managing", canExecute: false, blockedReason: "Active trade already open.", allowScaleIn };
  if (oppositeActive) return { state: "managing", canExecute: false, blockedReason: "Opposite active trade exists.", allowScaleIn };
  if (brain.phase !== "EXECUTE") return { state: "idle", canExecute: false, blockedReason: `Phase ${brain.phase} does not allow execution.`, allowScaleIn };
  if (!brain.direction) return { state: "idle", canExecute: false, blockedReason: "Missing direction.", allowScaleIn };
  if (!hasLevels) return { state: "idle", canExecute: false, blockedReason: "Missing entry/SL/TP levels.", allowScaleIn };
  if (!invalidationKnown) return { state: "idle", canExecute: false, blockedReason: "Missing invalidation.", allowScaleIn };
  if (!gradeAllowed) return { state: "idle", canExecute: false, blockedReason: `Entry grade ${brain.entryGrade} below A threshold.`, allowScaleIn };
  if (!qualityAllowed) return { state: "idle", canExecute: false, blockedReason: `Quality grade ${brain.qualityGrade} below A threshold.`, allowScaleIn };
  if (!confidenceAllowed) return { state: "idle", canExecute: false, blockedReason: `Confidence ${brain.confidence}% below threshold.`, allowScaleIn };
  if (!adaptiveApproved) return { state: "idle", canExecute: false, blockedReason: "Adaptive weights not approved for execution.", allowScaleIn };
  if (!riskAllowed) return { state: "idle", canExecute: false, blockedReason: brain.riskEngine.noTradeRiskReason || brain.finalDecision.reason, allowScaleIn };
  return { state: openTrade ? "pending" : "executed", canExecute: true, blockedReason: "", allowScaleIn };
}
