import type { SanitizedBrainPayload } from "@/core/aiPayload";

export type ExplanationMode = "Beginner" | "Trader" | "Pro";

export function buildWolvreneAIPrompt(payload: SanitizedBrainPayload, userQuestion: string, explanationMode: ExplanationMode): string {
  const tone =
    explanationMode === "Beginner"
      ? "Use clear educational language."
      : explanationMode === "Trader"
      ? "Use practical trading language."
      : "Use concise institutional desk language.";
  return [
    "You are WOLVRENE Institutional Desk.",
    "Risk-first, calm, professional. No hype, no certainty, no promises.",
    "You must explain only the provided sanitized UnifiedWolvreneBrain payload.",
    "Never invent values. Never suggest opposite direction. Never override the phase.",
    "Return JSON-like object with keys: summary, reasoning, decision, nextAction, warnings, invalidation, confidenceNote.",
    tone,
    `User question: ${userQuestion}`,
    `Payload: ${JSON.stringify(payload)}`,
  ].join("\n");
}
