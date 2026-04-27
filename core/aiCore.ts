import { buildWolvreneAIPrompt, type ExplanationMode } from "@/core/aiPromptBuilder";
import { guardWolvreneAIResponse, type WolvreneStructuredResponse } from "@/core/aiResponseGuard";
import type { SanitizedBrainPayload } from "@/core/aiPayload";

type AskInput = {
  question: string;
  payload: SanitizedBrainPayload;
  mode: ExplanationMode;
  requestId: number;
  history: Array<{ role: "user" | "assistant"; text: string }>;
};

const requestCache = new Map<string, WolvreneStructuredResponse>();

export function getAICacheKey(input: Pick<AskInput, "question" | "payload">): string {
  return `${input.question.trim().toLowerCase()}::${input.payload.phase}::${input.payload.direction || "WAIT"}::${input.payload.confidence}::${input.payload.strategyProfile.name}`;
}

export async function askWolvreneAICore(input: AskInput): Promise<{ structured: WolvreneStructuredResponse; requestId: number; fromCache: boolean }> {
  const cacheKey = getAICacheKey(input);
  const cached = requestCache.get(cacheKey);
  if (cached) return { structured: cached, requestId: input.requestId, fromCache: true };

  const prompt = buildWolvreneAIPrompt(input.payload, input.question, input.mode);
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: input.question,
      prompt,
      payload: input.payload,
      mode: input.mode,
      messages: input.history.slice(-10),
    }),
  });
  const data = await res.json().catch(() => ({}));
  const raw = data?.answer ?? data?.structured ?? "";
  const structured = guardWolvreneAIResponse(raw, input.payload);
  requestCache.set(cacheKey, structured);
  return { structured, requestId: input.requestId, fromCache: false };
}

export function buildAIFailureFallback(payload: SanitizedBrainPayload): WolvreneStructuredResponse {
  return {
    summary: "AI bridge unavailable. Brain state remains active.",
    reasoning: [payload.whyDecision || payload.whyNoTrade || "No execution decision."],
    decision: payload.phase,
    nextAction: payload.strategyProfile.nextAction,
    warnings: [payload.riskReason],
    invalidation: payload.invalidationReason,
    confidenceNote: "Confidence is based only on UnifiedWolvreneBrain.",
  };
}
