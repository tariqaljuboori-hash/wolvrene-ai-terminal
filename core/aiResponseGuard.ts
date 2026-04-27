import type { SanitizedBrainPayload } from "@/core/aiPayload";

export type WolvreneStructuredResponse = {
  summary: string;
  reasoning: string[];
  scenarios?: string[];
  decision: string;
  nextAction: string;
  warnings: string[];
  invalidation: string;
  confidenceNote: string;
};

const SAFE_PREFIX = "The brain does not support that action right now.";

function fallback(payload: SanitizedBrainPayload): WolvreneStructuredResponse {
  return {
    summary: `${SAFE_PREFIX} Current phase is ${payload.phase}.`,
    reasoning: [
      payload.whyDecision || payload.whyNoTrade || "No execution signal is confirmed.",
      payload.riskReason,
    ].filter(Boolean),
    decision: payload.phase,
    nextAction: payload.strategyProfile.nextAction,
    warnings: [payload.riskReason],
    invalidation: payload.invalidationReason,
    confidenceNote: `Direction is ${payload.direction || "WAIT"} with confidence ${payload.confidence}%.`,
  };
}

function containsBannedLanguage(text: string): boolean {
  const banned = ["guaranteed", "guarantee", "sure win", "100%", "all in", "max leverage"];
  const lower = text.toLowerCase();
  return banned.some((w) => lower.includes(w));
}

function inferPressure(payload: SanitizedBrainPayload): "bullish pressure" | "bearish pressure" | "neutral compression" {
  const structure = payload.debug.structureScore;
  const liquidity = payload.debug.liquidityScore;
  const trigger = payload.debug.triggerScore;
  if (structure >= 65 && trigger >= 60 && payload.direction === "LONG") return "bullish pressure";
  if (structure >= 65 && trigger >= 60 && payload.direction === "SHORT") return "bearish pressure";
  if (Math.abs(structure - liquidity) <= 8 && trigger < 58) return "neutral compression";
  return payload.direction === "LONG" ? "bullish pressure" : payload.direction === "SHORT" ? "bearish pressure" : "neutral compression";
}

function inferEnvironment(payload: SanitizedBrainPayload): string {
  if (payload.institutionalContext.behavior === "COMPRESSION") return "compression";
  if (payload.institutionalContext.behavior === "DISPLACEMENT") return "expansion";
  if (payload.institutionalContext.behavior === "FAKE_BREAKOUT") return "trap-prone range";
  if (payload.institutionalContext.behavior === "LIQUIDITY_SWEEP") return "liquidity sweep environment";
  if (payload.phase === "SCANNING") return "range-to-trend transition";
  return "trend development";
}

function inferTrappedSide(payload: SanitizedBrainPayload): string {
  if (payload.institutionalContext.behavior === "FAKE_BREAKOUT") return "late breakout participants";
  if (payload.direction === "LONG") return "late shorts";
  if (payload.direction === "SHORT") return "late longs";
  return "both sides until displacement confirms";
}

function buildScenarioLines(payload: SanitizedBrainPayload): string[] {
  const primaryConfirm = payload.strategyProfile.missingConfirmations.length
    ? `confirm via ${payload.strategyProfile.missingConfirmations[0].toLowerCase()} improvement`
    : "confirm via clean displacement + volume expansion";
  const primary = `Primary Scenario: Market continues ${payload.direction || "neutral"} bias if ${primaryConfirm}; invalidates on ${payload.invalidationReason.toLowerCase()}.`;
  const alternative = `Alternative Scenario: IF breakout fails and reclaim is rejected, THEN expectation shifts to rotational range behavior until trigger quality improves.`;
  const trap = `Trap Scenario: High-risk fake breakout around ${payload.institutionalContext.behavior.toLowerCase().replaceAll("_", " ")} conditions; vulnerable side is ${inferTrappedSide(payload)}.`;
  return [primary, alternative, trap];
}

function buildFallbackReasoning(payload: SanitizedBrainPayload): string[] {
  const pressure = inferPressure(payload);
  const environment = inferEnvironment(payload);
  const trappedSide = inferTrappedSide(payload);
  const missing = payload.strategyProfile.missingConfirmations?.length
    ? `Missing confirmations: ${payload.strategyProfile.missingConfirmations.join(", ")}.`
    : "Confirmation stack is currently complete.";
  const executionGap =
    payload.phase === "EXECUTE"
      ? "Execution gating is active, but risk and invalidation discipline still control participation."
      : `Not executable yet because phase is ${payload.phase} and quality/risk gates are not fully aligned.`;
  const manageSpecific =
    payload.phase === "MANAGE"
      ? "Manage mode requires reclaim/displacement plus volume expansion to continue; avoid trusting weak candles or low-volume breaks."
      : "For execution upgrade, wait for break/reclaim/displacement with real volume expansion.";
  const lines: string[] = [];
  lines.push(`Market is in ${environment} with ${pressure}; behavior suggests ${payload.institutionalContext.behavior.toLowerCase().replaceAll("_", " ")} dynamics.`);
  lines.push(`Structure/liquidity/trigger alignment is ${payload.debug.structureScore}/${payload.debug.liquidityScore}/${payload.debug.triggerScore}, which points to ${missing.toLowerCase()}`);
  lines.push(`Likely trapped side: ${trappedSide}. Trap risk is ${payload.institutionalContext.trapRisk}%, so fake breakout behavior must be assumed until displacement confirms.`);
  lines.push(`${executionGap} ${missing}`);
  lines.push(`Risk context: ${payload.riskEngine.noTradeRiskReason || payload.riskReason}. Invalidation remains ${payload.invalidationReason}.`);
  lines.push(`${manageSpecific} Bias flips only if structure + trigger quality rotate decisively against current read.`);
  return lines.filter(Boolean).slice(0, 6);
}

function normalizeRawResponse(raw: string, payload: SanitizedBrainPayload): WolvreneStructuredResponse {
  const fallbackReasoning = buildFallbackReasoning(payload);
  return {
    summary: raw.slice(0, 220) || "Brain-aligned explanation generated.",
    reasoning: fallbackReasoning,
    scenarios: buildScenarioLines(payload),
    decision: payload.phase,
    nextAction: payload.strategyProfile.nextAction,
    warnings: [payload.riskReason].filter(Boolean),
    invalidation: payload.invalidationReason,
    confidenceNote: `Confidence is ${payload.confidence}% from UnifiedWolvreneBrain.`,
  };
}

export function guardWolvreneAIResponse(response: unknown, payload: SanitizedBrainPayload): WolvreneStructuredResponse {
  const parsed = typeof response === "string" ? normalizeRawResponse(response, payload) : (response as WolvreneStructuredResponse | null);
  const fallbackReasoning = buildFallbackReasoning(payload);
  if (!parsed || typeof parsed.summary !== "string") return fallback(payload);
  const body = JSON.stringify(parsed).toLowerCase();
  if (containsBannedLanguage(body)) return fallback(payload);
  if (/no context|cannot analyze|no data provided|payload empty/i.test(body)) {
    parsed.summary = `Context is available from UnifiedWolvreneBrain. ${payload.phase} phase analysis is active.`;
    parsed.reasoning = fallbackReasoning;
    parsed.decision = payload.phase;
    parsed.nextAction = payload.strategyProfile.nextAction;
  }
  if (payload.phase === "SCANNING" && /(enter|buy|sell now|execute)/i.test(body) && !/wait|blocked|confirm/i.test(body)) return fallback(payload);
  if (payload.direction === "LONG" && /\bshort\b/i.test(body)) return fallback(payload);
  if (payload.direction === "SHORT" && /\blong\b/i.test(body)) return fallback(payload);
  const safeReasoning = Array.isArray(parsed.reasoning) ? parsed.reasoning.filter(Boolean) : [];
  const weakReasoning = safeReasoning.length < 2 || safeReasoning.every((line) => line.length < 60);
  const finalReasoning = weakReasoning ? fallbackReasoning : safeReasoning.slice(0, 6);
  const safeScenarios = Array.isArray(parsed.scenarios) ? parsed.scenarios.filter(Boolean).slice(0, 3) : [];
  const finalScenarios = safeScenarios.length === 3 ? safeScenarios : buildScenarioLines(payload);
  return {
    summary: parsed.summary || fallback(payload).summary,
    reasoning: finalReasoning,
    scenarios: finalScenarios,
    decision: parsed.decision || payload.phase,
    nextAction: parsed.nextAction || payload.managementPlaybook.nextCheckpoint || payload.strategyProfile.nextAction,
    warnings: Array.isArray(parsed.warnings) && parsed.warnings.length ? parsed.warnings.slice(0, 6) : [payload.riskReason],
    invalidation: parsed.invalidation || payload.invalidationReason || payload.tradeThesis.invalidation,
    confidenceNote: parsed.confidenceNote || `Confidence is ${payload.confidence}% from UnifiedWolvreneBrain.`,
  };
}
