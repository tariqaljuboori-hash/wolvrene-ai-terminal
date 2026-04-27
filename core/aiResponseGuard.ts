import type { SanitizedBrainPayload } from "@/core/aiPayload";

export type WolvreneStructuredResponse = {
  summary: string;
  reasoning: string[];
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

function normalizeRawResponse(raw: string, payload: SanitizedBrainPayload): WolvreneStructuredResponse {
  return {
    summary: raw.slice(0, 220) || "Brain-aligned explanation generated.",
    reasoning: [payload.whyDecision || payload.whyNoTrade || "No additional reasoning from provider."],
    decision: payload.phase,
    nextAction: payload.strategyProfile.nextAction,
    warnings: [payload.riskReason].filter(Boolean),
    invalidation: payload.invalidationReason,
    confidenceNote: `Confidence is ${payload.confidence}% from UnifiedWolvreneBrain.`,
  };
}

export function guardWolvreneAIResponse(response: unknown, payload: SanitizedBrainPayload): WolvreneStructuredResponse {
  const parsed = typeof response === "string" ? normalizeRawResponse(response, payload) : (response as WolvreneStructuredResponse | null);
  if (!parsed || typeof parsed.summary !== "string") return fallback(payload);
  const body = JSON.stringify(parsed).toLowerCase();
  if (containsBannedLanguage(body)) return fallback(payload);
  if (payload.phase === "SCANNING" && /(enter|buy|sell now|execute)/i.test(body) && !/wait|blocked|confirm/i.test(body)) return fallback(payload);
  if (payload.direction === "LONG" && /\bshort\b/i.test(body)) return fallback(payload);
  if (payload.direction === "SHORT" && /\blong\b/i.test(body)) return fallback(payload);
  return {
    summary: parsed.summary || fallback(payload).summary,
    reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning.slice(0, 6) : fallback(payload).reasoning,
    decision: parsed.decision || payload.phase,
    nextAction: parsed.nextAction || payload.strategyProfile.nextAction,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.slice(0, 6) : [payload.riskReason],
    invalidation: parsed.invalidation || payload.invalidationReason,
    confidenceNote: parsed.confidenceNote || `Confidence is ${payload.confidence}% from UnifiedWolvreneBrain.`,
  };
}
