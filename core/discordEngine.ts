import type { UnifiedBrainOutput } from "@/core/unifiedBrain";
import type { SmartFibContext } from "@/lib/market/engines/smart-fib/SmartFibTypes";

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

export type SmartFibDiscordPayload = {
  symbol: string;
  timeframe: string;
  direction: "LONG" | "SHORT";
  zone: string;
  entry: number;
  SL: number;
  TP1: number;
  TP2?: number;
  TP3?: number;
  mapState: string;
  invalidation: number;
  atr: number;
  range: number;
  confidence: number;
  alignmentStatus: string;
  reason: string;
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

// SMART FIB DISCORD PAYLOAD
export function buildSmartFibDiscordPayload(input: {
  symbol: string;
  smartFibContext: SmartFibContext;
  alignmentStatus: string;
  currentPrice: number;
}): SmartFibDiscordPayload | null {
  const { symbol, smartFibContext, alignmentStatus, currentPrice } = input;
  
  // Only send if Smart Fib has a valid executable setup
  if (!smartFibContext.enabled || !smartFibContext.tradeLevels || !smartFibContext.activeFibLevels.length) {
    return null;
  }

  if (smartFibContext.mapState !== "LONG_MAP" && smartFibContext.mapState !== "SHORT_MAP") {
    return null;
  }

  const direction = smartFibContext.mapState === "LONG_MAP" ? "LONG" : "SHORT";
  const levels = smartFibContext.tradeLevels;
  
  // Find which zone entry is closest to
  const sniperZones = smartFibContext.activeFibLevels.filter(l => l.level === 0.882 || l.level === 0.941);
  const reactionZones = smartFibContext.activeFibLevels.filter(l => l.level === 0.618 || l.level === 0.65);
  
  let zoneUsed = "CUSTOM";
  if (sniperZones.some(z => Math.abs(z.price - levels.entry) < 0.01)) {
    zoneUsed = "SNIPER_ZONE";
  } else if (reactionZones.some(z => Math.abs(z.price - levels.entry) < 0.01)) {
    zoneUsed = "REACTION_ZONE";
  }

  const invalidationLevel = direction === "LONG" ? smartFibContext.swingLow || levels.sl : smartFibContext.swingHigh || levels.sl;
  const confidence = alignmentStatus === "EXECUTABLE_ALIGNMENT" ? 92 : alignmentStatus === "REACTION_ONLY" ? 78 : 65;

  return {
    symbol,
    timeframe: smartFibContext.timeframe,
    direction,
    zone: zoneUsed,
    entry: levels.entry,
    SL: levels.sl,
    TP1: levels.tp1,
    TP2: levels.tp2,
    TP3: levels.tp3,
    mapState: smartFibContext.mapState,
    invalidation: invalidationLevel,
    atr: smartFibContext.atr || 0,
    range: smartFibContext.activeRange || 0,
    confidence,
    alignmentStatus,
    reason: `Smart Fib ${smartFibContext.mapState} setup at ${zoneUsed} - current price ${currentPrice.toFixed(2)}`,
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

// SMART FIB DISCORD SEND
export async function sendSmartFibDiscordSignal(input: {
  webhook: string;
  payload: SmartFibDiscordPayload;
  cooldownMs?: number;
}): Promise<{ sent: boolean; reason: string }> {
  if (!input.webhook) return { sent: false, reason: "Missing webhook." };
  if (!input.payload) return { sent: false, reason: "Missing payload." };
  
  const key = `${input.payload.symbol}-${input.payload.timeframe}-${input.payload.direction}-${input.payload.entry}`;
  const now = Date.now();
  const cooldownMs = input.cooldownMs ?? 120_000; // 2 min cooldown for Smart Fib
  const last = signalCooldown.get(key) || 0;
  if (now - last < cooldownMs) return { sent: false, reason: "Cooldown active." };

  const { payload } = input;
  const embed = {
    username: "WOLVRENE Smart Fib",
    embeds: [{
      title: `Smart Fib ${payload.direction} Signal`,
      color: payload.direction === "LONG" ? 0x00ff00 : 0xff0000,
      fields: [
        { name: "Symbol", value: payload.symbol, inline: true },
        { name: "Timeframe", value: payload.timeframe, inline: true },
        { name: "Setup", value: payload.mapState, inline: true },
        { name: "Zone", value: payload.zone, inline: true },
        { name: "Alignment", value: payload.alignmentStatus, inline: true },
        { name: "Entry", value: `${payload.entry.toFixed(2)}`, inline: true },
        { name: "SL", value: `${payload.SL.toFixed(2)}`, inline: true },
        { name: "TP1", value: `${payload.TP1.toFixed(2)}`, inline: true },
        { name: "TP2", value: payload.TP2 ? `${payload.TP2.toFixed(2)}` : "N/A", inline: true },
        { name: "TP3", value: payload.TP3 ? `${payload.TP3.toFixed(2)}` : "N/A", inline: true },
        { name: "Range", value: `${payload.range.toFixed(2)}`, inline: true },
        { name: "ATR", value: `${payload.atr.toFixed(4)}`, inline: true },
        { name: "Confidence", value: `${payload.confidence}%`, inline: true },
        { name: "Invalidation", value: `${payload.invalidation.toFixed(2)}`, inline: false },
        { name: "Reason", value: payload.reason, inline: false },
      ],
      timestamp: new Date().toISOString(),
    }],
  };

  try {
    const res = await fetch(input.webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(embed),
    });
    
    if (!res.ok) return { sent: false, reason: `HTTP ${res.status}` };
    signalCooldown.set(key, now);
    return { sent: true, reason: "Smart Fib signal sent." };
  } catch (error) {
    return { sent: false, reason: `Error: ${error instanceof Error ? error.message : "Unknown"}` };
  }
}
