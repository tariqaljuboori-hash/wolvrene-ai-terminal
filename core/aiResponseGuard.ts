import type { LiveContext, SanitizedBrainPayload, SelectedTradeContext } from "@/core/aiPayload";
import type { AIIntent } from "@/core/aiPromptBuilder";

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
const GENERIC_PATTERNS = [/market is/i, /wait for confirmation/i, /no active setup/i, /brain phase/i];

type GuardInput = {
  payload: SanitizedBrainPayload;
  intent: AIIntent;
  selectedTradeContext: SelectedTradeContext;
  liveContext: LiveContext;
  userQuestion: string;
};

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

function hasSelectedTrade(selectedTradeContext: SelectedTradeContext): boolean {
  return Boolean(selectedTradeContext.side && Number.isFinite(selectedTradeContext.entry));
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
  lines.push(`Structure/liquidity/trigger scores from payload: ${payload.debug.structureScore}/${payload.debug.liquidityScore}/${payload.debug.triggerScore}; ${missing.toLowerCase()}`);
  lines.push(`Likely trapped side: ${trappedSide}. Trap risk is ${payload.institutionalContext.trapRisk}%, so fake breakout behavior must be assumed until displacement confirms.`);
  lines.push(`${executionGap} ${missing}`);
  lines.push(`Risk context: ${payload.riskEngine.noTradeRiskReason || payload.riskReason}. Invalidation remains ${payload.invalidationReason}.`);
  lines.push(`${manageSpecific} Bias flips only if structure + trigger quality rotate decisively against current read.`);
  return lines.filter(Boolean).slice(0, 6);
}

function normalizeRawResponse(raw: string, payload: SanitizedBrainPayload): WolvreneStructuredResponse {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsedJson = JSON.parse(trimmed) as Partial<WolvreneStructuredResponse>;
      if (typeof parsedJson.summary === "string") {
        return {
          summary: parsedJson.summary,
          reasoning: Array.isArray(parsedJson.reasoning) ? parsedJson.reasoning.filter(Boolean).map((item) => String(item)) : buildFallbackReasoning(payload),
          scenarios: Array.isArray(parsedJson.scenarios) ? parsedJson.scenarios.filter(Boolean).map((item) => String(item)).slice(0, 3) : buildScenarioLines(payload),
          decision: typeof parsedJson.decision === "string" ? parsedJson.decision : payload.phase,
          nextAction: typeof parsedJson.nextAction === "string" ? parsedJson.nextAction : payload.strategyProfile.nextAction,
          warnings: Array.isArray(parsedJson.warnings) ? parsedJson.warnings.filter(Boolean).map((item) => String(item)) : [payload.riskReason].filter(Boolean),
          invalidation: typeof parsedJson.invalidation === "string" ? parsedJson.invalidation : payload.invalidationReason,
          confidenceNote: typeof parsedJson.confidenceNote === "string" ? parsedJson.confidenceNote : `Confidence is ${payload.confidence}% from UnifiedWolvreneBrain.`,
        };
      }
    } catch {
      // fallback to non-JSON handling below
    }
  }
  const fallbackReasoning = buildFallbackReasoning(payload);
  return {
    summary: trimmed.replace(/^\{+/, "").slice(0, 220) || "Live context analyzed with current Wolvrene state.",
    reasoning: fallbackReasoning,
    scenarios: buildScenarioLines(payload),
    decision: payload.phase,
    nextAction: payload.strategyProfile.nextAction,
    warnings: [payload.riskReason].filter(Boolean),
    invalidation: payload.invalidationReason,
    confidenceNote: `Confidence is ${payload.confidence}% from UnifiedWolvreneBrain.`,
  };
}

function buildIntentFallback(input: GuardInput): WolvreneStructuredResponse {
  const { payload, intent, selectedTradeContext, liveContext, userQuestion } = input;
  const baseReasoning = buildFallbackReasoning(payload);
  const tradeAware = hasSelectedTrade(selectedTradeContext);
  const riskText = selectedTradeContext.riskState || payload.riskEngine.maxRiskState || payload.risk;
  const tradeLine = tradeAware
    ? `Selected trade is ${selectedTradeContext.side} ${selectedTradeContext.status} at ${selectedTradeContext.entry}; mark ${selectedTradeContext.markPrice ?? "N/A"}, PnL ${selectedTradeContext.pnlUsd ?? "N/A"} USD (${selectedTradeContext.pnlPct ?? "N/A"}%).`
    : "No active trade is open. Current state is waiting / watching.";
  const nextAction = payload.nextConfirmation || payload.strategyProfile.nextAction;

  if (intent === "MANAGE_TRADE") {
    return {
      summary: tradeAware
        ? "Trade management view aligned to selected trade context."
        : "No selected trade to manage; management remains in monitoring mode.",
      reasoning: tradeAware
        ? [
            `Selected ${selectedTradeContext.side} is currently ${selectedTradeContext.pnlUsd ?? 0} PnL / ${selectedTradeContext.pnlPct ?? 0}% ROI, mark is ${selectedTradeContext.markPrice ?? "N/A"} vs entry ${selectedTradeContext.entry ?? "N/A"}.`,
            `SL is at ${selectedTradeContext.sl ?? "N/A"} and TP count is ${selectedTradeContext.tpCount}.`,
            `Management playbook says ${payload.managementPlaybook.action}: ${payload.managementPlaybook.reason}.`,
            `Distance to SL/TP1: ${selectedTradeContext.distanceToSL ?? "N/A"} / ${selectedTradeContext.distanceToTP1 ?? "N/A"}.`,
            `Invalidation: ${payload.invalidationReason}.`,
          ]
        : [`Management playbook: ${payload.managementPlaybook.action}.`, ...baseReasoning.slice(0, 3)],
      scenarios: buildScenarioLines(payload),
      decision: payload.managementPlaybook.action,
      nextAction: payload.managementPlaybook.nextCheckpoint || nextAction,
      warnings: [payload.riskReason, payload.riskEngine.noTradeRiskReason].filter(Boolean),
      invalidation: payload.invalidationReason,
      confidenceNote: `Confidence ${payload.confidence}% · Risk state ${riskText}.`,
    };
  }

  if (intent === "RISK_CHECK") {
    return {
      summary: "Risk check generated from risk engine and selected trade context.",
      reasoning: [
        `Risk state: ${riskText}. Trap risk is ${payload.institutionalContext.trapRisk}%.`,
        tradeLine,
        `Risk/Reward status: ${payload.riskEngine.riskRewardValid ? "valid" : "not valid"} (${payload.riskEngine.riskRewardRatio}).`,
        `Protection focus: invalidation ${payload.invalidationReason}.`,
      ],
      scenarios: buildScenarioLines(payload),
      decision: "PROTECT",
      nextAction,
      warnings: [payload.riskReason, payload.riskEngine.noTradeRiskReason].filter(Boolean),
      invalidation: payload.invalidationReason,
      confidenceNote: `Environment is ${riskText === "HIGH" ? "dangerous" : riskText === "NORMAL" ? "neutral" : "safer"} for risk.`,
    };
  }

  if (intent === "BEST_ENTRY") {
    const hasExecutableLevels = payload.phase === "EXECUTE" && [payload.entry, payload.sl, payload.tp1].every((value) => Number.isFinite(value));
    return {
      summary: hasExecutableLevels
        ? "Executable setup exists; entry explanation uses UnifiedWolvreneBrain levels."
        : "Entry is not ready yet; missing confirmations block execution.",
      reasoning: hasExecutableLevels
        ? [
            `Phase ${payload.phase} with entry ${payload.entry}, SL ${payload.sl}, TP1 ${payload.tp1}.`,
            `Setup quality ${payload.qualityScore} (${payload.qualityGrade}) with ${payload.confirmationCount} confirmations.`,
            `Invalidation: ${payload.invalidationReason}.`,
          ]
        : [
            `Phase is ${payload.phase}; no executable setup should be fabricated.`,
            `Missing confirmations: ${(payload.strategyProfile.missingConfirmations || []).join(", ") || "none listed"}.`,
            `Best area to watch: ${payload.tradeThesis.entryLogic || "wait for liquidity reclaim/displacement confirmation."}`,
          ],
      scenarios: buildScenarioLines(payload),
      decision: hasExecutableLevels ? "YES" : payload.phase === "EXECUTE" || payload.phase === "VALIDATED" ? "WAIT" : "NO",
      nextAction,
      warnings: [payload.entryReason, payload.riskReason].filter(Boolean),
      invalidation: payload.invalidationReason,
      confidenceNote: `Entry grade ${payload.entryGrade} · confidence ${payload.confidence}%.`,
    };
  }

  if (intent === "SESSION_OUTLOOK") {
    return {
      summary: `Session outlook for ${liveContext.session} on ${liveContext.timeframe} ${liveContext.mode}.`,
      reasoning: [
        `Current session: ${liveContext.session}, volatility ${liveContext.volatility}, trend ${liveContext.candleTrend}.`,
        `Liquidity/trap read: ${payload.institutionalContext.behavior} with trap risk ${payload.institutionalContext.trapRisk}%.`,
        `Watch next: ${payload.nextConfirmation}.`,
      ],
      scenarios: buildScenarioLines(payload),
      decision: payload.phase,
      nextAction,
      warnings: [payload.riskReason],
      invalidation: payload.invalidationReason,
      confidenceNote: `Direction ${payload.direction || "WAIT"} · confidence ${payload.confidence}%.`,
    };
  }

  if (intent === "CUSTOM") {
    return {
      summary: "Custom question answered from sanitized context.",
      reasoning: [`Question: ${userQuestion}`, ...baseReasoning.slice(0, 4)],
      scenarios: buildScenarioLines(payload),
      decision: payload.phase,
      nextAction,
      warnings: [payload.riskReason],
      invalidation: payload.invalidationReason,
      confidenceNote: `Confidence is ${payload.confidence}% from UnifiedWolvreneBrain.`,
    };
  }

  return {
    summary: "Market analysis aligned to UnifiedWolvreneBrain context.",
    reasoning: baseReasoning,
    scenarios: buildScenarioLines(payload),
    decision: payload.phase,
    nextAction,
    warnings: [payload.riskReason],
    invalidation: payload.invalidationReason,
    confidenceNote: `Confidence is ${payload.confidence}% from UnifiedWolvreneBrain.`,
  };
}

function responseLooksGeneric(parsed: WolvreneStructuredResponse): boolean {
  const summary = parsed.summary || "";
  return GENERIC_PATTERNS.filter((rx) => rx.test(summary)).length >= 2;
}

export function guardWolvreneAIResponse(response: unknown, input: GuardInput): WolvreneStructuredResponse {
  const { payload, intent, selectedTradeContext } = input;
  const parsed = typeof response === "string" ? normalizeRawResponse(response, payload) : (response as WolvreneStructuredResponse | null);
  const fallbackReasoning = buildFallbackReasoning(payload);
  if (!parsed || typeof parsed.summary !== "string") return buildIntentFallback(input);
  const body = JSON.stringify(parsed).toLowerCase();
  if (containsBannedLanguage(body)) return buildIntentFallback(input);
  if (/no context|cannot analyze|no data provided|payload empty/i.test(body)) {
    parsed.summary = `Context is available from UnifiedWolvreneBrain. ${payload.phase} phase analysis is active.`;
    parsed.reasoning = fallbackReasoning;
    parsed.decision = payload.phase;
    parsed.nextAction = payload.strategyProfile.nextAction;
  }
  if (payload.phase === "SCANNING" && /(enter|buy|sell now|execute)/i.test(body) && !/wait|blocked|confirm/i.test(body)) return buildIntentFallback(input);
  if (payload.direction === "LONG" && /\bshort\b/i.test(body)) return buildIntentFallback(input);
  if (payload.direction === "SHORT" && /\blong\b/i.test(body)) return buildIntentFallback(input);
  if (responseLooksGeneric(parsed)) return buildIntentFallback(input);
  if (parsed.summary.trim().startsWith("{")) return buildIntentFallback(input);
  if (hasSelectedTrade(selectedTradeContext) && /(wait|no trade)/i.test(parsed.decision || "") && !/(pnl|entry|mark|sl|tp|trade|position)/i.test(body)) {
    return buildIntentFallback(input);
  }
  if ((intent === "MANAGE_TRADE" || intent === "RISK_CHECK") && hasSelectedTrade(selectedTradeContext)) {
    const tradeSpecific = /(pnl|entry|mark|sl|tp|distance|trade|position)/i.test(body);
    if (!tradeSpecific) return buildIntentFallback(input);
  }
  if (intent === "BEST_ENTRY") {
    const hasExecutableLevels = payload.phase === "EXECUTE" && [payload.entry, payload.sl, payload.tp1].every((value) => Number.isFinite(value));
    if (!hasExecutableLevels && /(entry\s*[:=]\s*\d+|sl\s*[:=]\s*\d+|tp\s*[:=]\s*\d+)/i.test(body)) return buildIntentFallback(input);
  }
  if (intent === "SESSION_OUTLOOK" && !/(session|volatility|liquidity|london|new york|asia)/i.test(body)) {
    return buildIntentFallback(input);
  }
  const safeReasoning = Array.isArray(parsed.reasoning) ? parsed.reasoning.filter(Boolean) : [];
  const cleanedReasoning = safeReasoning.filter((line) => !/no additional reasoning from provider|no context/i.test(line));
  const weakReasoning = cleanedReasoning.length < 2 || cleanedReasoning.every((line) => line.length < 60);
  const finalReasoning = weakReasoning ? fallbackReasoning : cleanedReasoning.slice(0, 6);
  const safeScenarios = Array.isArray(parsed.scenarios) ? parsed.scenarios.filter(Boolean).slice(0, 3) : [];
  const finalScenarios = safeScenarios.length === 3 ? safeScenarios : buildScenarioLines(payload);
  return {
    summary: parsed.summary || fallback(payload).summary,
    reasoning: finalReasoning,
    scenarios: finalScenarios,
    decision: parsed.decision || payload.phase,
    nextAction: parsed.nextAction || payload.managementPlaybook.nextCheckpoint || payload.nextConfirmation || payload.strategyProfile.nextAction,
    warnings: Array.isArray(parsed.warnings) && parsed.warnings.length ? parsed.warnings.slice(0, 6) : [payload.riskReason],
    invalidation: parsed.invalidation || payload.invalidationReason || payload.tradeThesis.invalidation,
    confidenceNote: parsed.confidenceNote || `Confidence is ${payload.confidence}% from UnifiedWolvreneBrain.`,
  };
}
