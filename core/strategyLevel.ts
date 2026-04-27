type UnifiedMode = "SCALP" | "SWING";
type UnifiedPhase = "SCANNING" | "WATCH" | "VALIDATED" | "EXECUTE" | "MANAGE" | "EXIT";

export type StrategyProfile = {
  name: "Liquidity Sweep Reversal" | "Breakout Continuation" | "Reclaim Setup" | "Compression Expansion" | "Trap / Fakeout Avoidance" | "No Trade / Wait";
  type: "REVERSAL" | "CONTINUATION" | "RECLAIM" | "EXPANSION" | "DEFENSIVE" | "WAIT";
  direction: "LONG" | "SHORT" | null;
  quality: number;
  requiredConfirmations: string[];
  missingConfirmations: string[];
  invalidationLogic: string;
  nextAction: string;
  blockedReason: string;
};

type StrategyInput = {
  phase: UnifiedPhase;
  direction: "LONG" | "SHORT" | null;
  mode: UnifiedMode;
  structureScore: number;
  liquidityScore: number;
  triggerScore: number;
  sessionQuality: number;
  volatility: "LOW" | "NORMAL" | "HIGH";
  riskRewardRatio: number;
  invalidation: number | null;
  hardTradeOverride: boolean;
  activeTradeSide: "LONG" | "SHORT" | null;
  institutionalBehavior: "LIQUIDITY_SWEEP" | "FAKE_BREAKOUT" | "RECLAIM" | "DISPLACEMENT" | "COMPRESSION" | "NEUTRAL";
};

export function classifyStrategy(input: StrategyInput): StrategyProfile {
  const confirmations = [
    { key: "structure alignment", pass: input.structureScore >= 58 },
    { key: "liquidity context", pass: input.liquidityScore >= 56 },
    { key: "trigger quality", pass: input.triggerScore >= 56 },
    { key: "acceptable session quality", pass: input.sessionQuality >= 58 },
    { key: "acceptable volatility regime", pass: input.volatility !== "HIGH" },
    { key: "valid risk/reward", pass: input.riskRewardRatio >= 1.2 },
    { key: "clear invalidation", pass: Boolean(input.invalidation) },
  ];
  const requiredConfirmations = confirmations.map((c) => c.key);
  const missingConfirmations = confirmations.filter((c) => !c.pass).map((c) => c.key);
  const quality = Math.max(
    0,
    Math.min(100, Math.round((input.structureScore + input.liquidityScore + input.triggerScore + input.sessionQuality) / 4))
  );
  const blockedReason = input.hardTradeOverride
    ? "Active trade override is enabled."
    : missingConfirmations.length
    ? `Missing confirmations: ${missingConfirmations.join(", ")}.`
    : "";

  const base = {
    direction: input.direction,
    quality,
    requiredConfirmations,
    missingConfirmations,
    invalidationLogic: input.invalidation ? `Invalidate thesis if price reaches ${input.invalidation}.` : "No clean invalidation level yet.",
    nextAction: blockedReason
      ? "Wait for missing confirmations before any execution."
      : input.phase === "EXECUTE"
      ? "Follow execution plan and respect invalidation."
      : "Wait for confirmation and keep risk tight.",
    blockedReason,
  } as const;

  if (!input.direction || input.phase === "SCANNING" || blockedReason) {
    return {
      name: "No Trade / Wait",
      type: "WAIT",
      ...base,
    };
  }
  if (input.institutionalBehavior === "LIQUIDITY_SWEEP") {
    return { name: "Liquidity Sweep Reversal", type: "REVERSAL", ...base };
  }
  if (input.institutionalBehavior === "RECLAIM") {
    return { name: "Reclaim Setup", type: "RECLAIM", ...base };
  }
  if (input.institutionalBehavior === "DISPLACEMENT") {
    return { name: "Breakout Continuation", type: "CONTINUATION", ...base };
  }
  if (input.institutionalBehavior === "COMPRESSION") {
    return { name: "Compression Expansion", type: "EXPANSION", ...base };
  }
  if (input.institutionalBehavior === "FAKE_BREAKOUT") {
    return { name: "Trap / Fakeout Avoidance", type: "DEFENSIVE", ...base };
  }
  return { name: "No Trade / Wait", type: "WAIT", ...base };
}
