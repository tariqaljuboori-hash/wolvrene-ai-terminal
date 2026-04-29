import type { UnifiedBrainOutput } from "@/core/unifiedBrain";

const signalCooldown = new Map<string, number>();

export type DiscordSignalPayload = {
  symbol: string;
  direction: "LONG" | "SHORT";
  entry: number;
  SL: number;
  TP1: number;
  TP2: number;
  TP3: number;
  strategy: string;
  qualityGrade: "A+" | "A" | "B" | "C";
  entryGrade: "A+" | "A" | "B" | "C" | "Reject";
  confidence: number;
  reason: string;
  invalidation: string;
};

export function buildDiscordSignalPayload(input: { symbol: string; brain: UnifiedBrainOutput }): DiscordSignalPayload | null {
  const { brain, symbol } = input;
  if (brain.phase !== "EXECUTE" || !brain.direction || !brain.decision.entry || !brain.decision.sl || !brain.decision.tp1 || !brain.decision.tp2 || !brain.decision.tp3) return null;
  if (!(brain.entryGrade === "A+" || brain.entryGrade === "A")) return null;
  if (!(brain.qualityGrade === "A+" || brain.qualityGrade === "A")) return null;
  return {
    symbol,
    direction: brain.direction,
    entry: brain.decision.entry,
    SL: brain.decision.sl,
    TP1: brain.decision.tp1,
    TP2: brain.decision.tp2,
    TP3: brain.decision.tp3,
    strategy: brain.strategyProfile.name,
    qualityGrade: brain.qualityGrade,
    entryGrade: brain.entryGrade,
    confidence: brain.confidence,
    reason: brain.whyDecision || brain.reason,
    invalidation: brain.invalidationReason,
  };
}

export async function sendDiscordSignal(input: {
  webhook: string;
  payload: DiscordSignalPayload;
  cooldownMs?: number;
}): Promise<{ sent: boolean; reason: string }> {
  if (!input.webhook) return { sent: false, reason: "Missing webhook." };
  const key = `${input.payload.symbol}-${input.payload.direction}-${input.payload.entry}-${input.payload.strategy}`;
  const now = Date.now();
  const cooldownMs = input.cooldownMs ?? 90_000;
  const last = signalCooldown.get(key) || 0;
  if (now - last < cooldownMs) return { sent: false, reason: "Cooldown active." };
  const res = await fetch(input.webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "WOLVRENE Institutional Desk",
      content: `WOLVRENE EXECUTE ${input.payload.symbol} ${input.payload.direction} | Entry ${input.payload.entry} | SL ${input.payload.SL} | TP1 ${input.payload.TP1} | TP2 ${input.payload.TP2} | TP3 ${input.payload.TP3} | ${input.payload.strategy} | Quality ${input.payload.qualityGrade} | EntryGrade ${input.payload.entryGrade} | ${input.payload.confidence}%`,
    }),
  });
  if (!res.ok) return { sent: false, reason: `HTTP ${res.status}` };
  signalCooldown.set(key, now);
  return { sent: true, reason: "Signal sent." };
}