"use client";
// WOLVRENE v37 UNIFIED PRECISION PATCH — PRIVATE VIP TERMINAL
// v36 base + unified settings persistence, USDT sizing, execute-only trade data, safer AI context, and cleaner live trade management.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  createChart,
  IChartApi,
  ISeriesApi,
  Time,
} from "lightweight-charts";
import { getBitgetCandles, getBitgetTickerStats, TF_SECONDS, TIMEFRAMES } from "@/lib/bitget";
import { createOrderFromPrice, formatPrice, profitPct, riskPct } from "@/lib/tradingMath";
import { loadJson, saveJson } from "@/lib/storage";
import { runUnifiedBrain } from "@/core/unifiedBrain";
import { buildRawDecisionPlan } from "@/core/decisionEngine";
import { buildSanitizedBrainPayload, hasValidAIPayload, type LiveContext, type SelectedTradeContext } from "@/core/aiPayload";
import { askWolvreneAICore, buildAIFailureFallback, getAICacheKey } from "@/core/aiCore";
import { guardWolvreneAIResponse, type WolvreneStructuredResponse } from "@/core/aiResponseGuard";
import type { AIIntent, ExplanationMode } from "@/core/aiPromptBuilder";
import { evaluateExecutionReadiness } from "@/core/executionEngine";
import { appendTradeLog, readTradeLog, type LoggedTrade } from "@/core/tradeLogger";
import { buildStrategyPerformance } from "@/core/performanceEngine";
import { deriveAdaptiveWeights } from "@/core/adaptiveEngine";
import { buildDiscordSignalPayload, sendDiscordSignal } from "@/core/discordEngine";
import {
  calcBaseSizeFromUsd,
  calcOrderMarginUsd,
  calcOrderPnLUsd,
  calcOrderRoiPct,
  clampLeverage,
  normalizeOrderFinancials,
} from "@/lib/tradeCalculations";
import MarketRadarPanel from "@/components/market/MarketRadarPanel";
import type { MarketIntelligence } from "@/lib/market/types";
import type {
  Candle,
  ChartSettings,
  Direction,
  DragTarget,
  JournalEntry,
  LineEditor,
  PriceAlert,
  TradeOrder,
} from "@/types/trading";
import SmartFibSettingsPanel from "@/components/market/smart-fib/SmartFibSettingsPanel";
import SmartFibDashboard from "@/components/market/smart-fib/SmartFibDashboard";
import SmartFibOverlay from "@/components/market/smart-fib/SmartFibOverlay";
import { SmartFibEngine } from "@/lib/market/engines/smart-fib/SmartFibEngine";
import type { SmartFibSignal } from "@/lib/market/engines/smart-fib/SmartFibTypes";
import { SMART_FIB_DEFAULTS } from "@/lib/market/engines/smart-fib/SmartFibDefaults";
import { buildSmartFibContextBridge } from "@/lib/market/engines/smart-fib/SmartFibContextBridge";
import type { SmartFibContext } from "@/lib/market/engines/smart-fib/SmartFibTypes";

const defaultSettings: ChartSettings = {
  bullColor: "#ffe629",
  bearColor: "#8e24aa",
  backgroundColor: "#000000",
  textColor: "#d1d5db",
  gridColor: "#222222",
  showGrid: true,
};

const card =
  "rounded-2xl border border-[rgba(255,139,0,0.22)] bg-[rgba(10,12,14,0.92)] shadow-[0_0_26px_rgba(255,138,0,0.06)] transition hover:border-[rgba(255,194,71,0.42)]";

const gold = "#d89b00";
const terminalPanel =
  "rounded-2xl border border-[rgba(255,139,0,0.34)] bg-[rgba(10,12,14,0.92)] shadow-[0_0_28px_rgba(255,138,0,0.08)]";

type AccessStatus = "checking" | "granted" | "locked";

const WOLVRENE_ACCESS_CONFIG = {
  whopLink: "https://whop.com/wolvrene-trade/?a=alpha-wolvrene",
  supportText: "If you already subscribed, login with the same email used on Whop.",
  };


type TradeSymbol = {
  symbol: string;
  label: string;
  icon: string;
};

const TRADE_SYMBOLS: TradeSymbol[] = [
  { symbol: "BTCUSDT", label: "BTCUSDT.P", icon: "₿" },
  { symbol: "ETHUSDT", label: "ETHUSDT.P", icon: "◆" },
  { symbol: "SOLUSDT", label: "SOLUSDT.P", icon: "◎" },
  { symbol: "XRPUSDT", label: "XRPUSDT.P", icon: "✕" },
  { symbol: "BNBUSDT", label: "BNBUSDT.P", icon: "⬡" },
  { symbol: "XAUTUSDT", label: "XAUTUSDT.P", icon: "Au" },
  { symbol: "CLUSDT", label: "CLUSDT.P", icon: "🛢" },
  { symbol: "XAGUSDT", label: "XAGUSDT.P", icon: "Ag" },
  { symbol: "TAOUSDT", label: "TAOUSDT.P", icon: "τ" },
  { symbol: "SUIUSDT", label: "SUIUSDT.P", icon: "S" },
];

const PRECISION_RULES = {
  minWatchQuality: 76,
  minExecuteQuality: 88,
  minMasterScore: 84,
  minEliteScore: 88,
  minMtfScore: 70,
  maxVisibleDecisionMarkers: 8,
  maxVisibleSignalMarkers: 18,
  maxSignalMemory: 50,
  candleHistory: 5000,
  journalLimit: 300,
};

type EliteJournalEntry = {
  id: string;
  time: string;
  symbol: string;
  timeframe: string;
  session?: string;
  setup?: string;
  side: "LONG" | "SHORT";
  entry: number;
  exit?: number;
  pnl?: number;
  roi?: number;
  score: number;
  result: "OPEN" | "WIN" | "LOSS" | "BE";
  reason: string;
  closedAt?: string;
  closeReason?: "TP_HIT" | "SL_HIT" | "BE" | "EARLY_EXIT" | "MANUAL";
};

type MTFState = {
  tf: string;
  bias: "LONG" | "SHORT" | "NEUTRAL";
  score: number;
};

type LearningStats = {
  total: number;
  wins: number;
  losses: number;
  bySession: Record<string, number>;
  bySymbol: Record<string, number>;
  bySetup: Record<string, number>;
};

type LiveTradeState = {
  active: boolean;
  symbol: string;
  timeframe: string;
  side: "LONG" | "SHORT";
  entry: number;
  sl: number;
  tp: number;
  openedAt: number;
  score: number;
};

type DynamicTradePlan = {
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  dynamicSL: number;
  protected: boolean;
  trailing: boolean;
  extensionAllowed: boolean;
  earlyRiskCut: boolean;
};

type ClosedEliteResult = {
  exit: number;
  pnl: number;
  roi: number;
  result: EliteJournalEntry["result"];
  closeReason: EliteJournalEntry["closeReason"];
};

type ChartCandle = {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
};

type SessionSniperState = {
  session: string;
  quality: number;
  mode: "BUILDING" | "EXPANSION" | "EXECUTION" | "REVERSAL" | "LOW_ACTIVITY";
  allowSignal: boolean;
  reason: string;
};
type RadarFinalSignalMode =
  | "LEGACY_MODE"
  | "RADAR_WAIT"
  | "RADAR_CONFIRMATION_REQUIRED"
  | "RADAR_VALIDATED"
  | "RADAR_APPROVED"
  | "RADAR_BLOCKED";

function normalizeRadarSymbol(symbol: string) {
  return symbol.replace(/\.P$/i, "").replace(/[-_](PERP|SWAP)$/i, "").trim().toUpperCase();
}

function readStoredAccessEmail() {
  if (typeof window === "undefined") return "";
  const raw = localStorage.getItem("wolvrene_access_email");
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : "";
  } catch {
    return raw;
  }
}

function readStoredAccessGranted() {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem("wolvrene_access_granted");
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    return parsed === true || parsed === "true";
  } catch {
    return raw === "true";
  }
}

function resolveEliteJournalClose(
  entry: EliteJournalEntry,
  markPrice: number,
  plan: DynamicTradePlan
): ClosedEliteResult | null {
  const isLong = entry.side === "LONG";
  const hitTP = isLong ? markPrice >= plan.tp1 : markPrice <= plan.tp1;
  const hitSL = isLong ? markPrice <= plan.dynamicSL : markPrice >= plan.dynamicSL;

  if (!hitTP && !hitSL && !plan.earlyRiskCut) return null;

  const exit = markPrice;
  const { pnl, roi } = calcJournalPnL(entry, exit);
  const isBE = Math.abs(exit - entry.entry) <= entry.entry * 0.0003;
  const result: EliteJournalEntry["result"] = hitTP ? "WIN" : isBE ? "BE" : "LOSS";
  const closeReason: EliteJournalEntry["closeReason"] = hitTP
    ? "TP_HIT"
    : isBE
    ? "BE"
    : plan.earlyRiskCut
    ? "EARLY_EXIT"
    : "SL_HIT";

  return { exit, pnl, roi, result, closeReason };
}

function storageGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function storageSet<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // local storage can fail in private mode or when quota is full
  }
}

function normalizeEpochMs(value: number | null | undefined) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return Date.now();
  return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
}

function toChartEpochSec(value: number | null | undefined) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return Math.floor(Date.now() / 1000);
  return numeric > 1_000_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
}

function toChartCandle(candle: Candle): ChartCandle {
  return {
    ...candle,
    time: candle.time as Time,
  };
}

function mergeCandleHistory(oldData: Candle[], freshData: Candle[]) {
  const map = new Map<number, Candle>();
  [...oldData, ...freshData].forEach((c) => {
    const t = Number(c?.time);
    if (
      Number.isFinite(t) &&
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close) &&
      c.open > 0 &&
      c.high > 0 &&
      c.low > 0 &&
      c.close > 0
    ) {
      map.set(t, c);
    }
  });

  return Array.from(map.values())
    .sort((a, b) => Number(a.time) - Number(b.time))
    .slice(-PRECISION_RULES.candleHistory);
}

function candleHistoryKey(symbol: string, tf: string) {
  return `wolvrene_history_${symbol}_${tf}`;
}

function eliteJournalKey() {
  return "wolvrene_elite_journal_v2";
}
function signalMarkersKey(symbol: string, tf: string) {
  return `wolvrene_signal_markers_${symbol}_${tf}`;
}
function activeExecutionTradeKey() {
  return "wolvrene_active_execution_trade_v1";
}
function tradeMarkersKey(symbol: string, tf: string, mode: TradeMode) {
  return `wolvrene_trade_markers_${symbol}_${tf}_${mode}`;
}
function learningStatsKey() {
  return "wolvrene_learning_stats_v35";
}

function defaultLearningStats(): LearningStats {
  return { total: 0, wins: 0, losses: 0, bySession: {}, bySymbol: {}, bySetup: {} };
}

function updateLearningStats(stats: LearningStats, win: boolean, session: string, symbol: string, setup: string): LearningStats {
  const next: LearningStats = {
    total: stats.total + 1,
    wins: stats.wins + (win ? 1 : 0),
    losses: stats.losses + (win ? 0 : 1),
    bySession: { ...stats.bySession },
    bySymbol: { ...stats.bySymbol },
    bySetup: { ...stats.bySetup },
  };

  next.bySession[session] = (next.bySession[session] || 0) + (win ? 1 : -1);
  next.bySymbol[symbol] = (next.bySymbol[symbol] || 0) + (win ? 1 : -1);
  next.bySetup[setup] = (next.bySetup[setup] || 0) + (win ? 1 : -1);
  return next;
}

function getLearningBoost(stats: LearningStats, session: string, symbol: string, setup: string) {
  const sessionBoost = Math.max(-6, Math.min(6, (stats.bySession[session] || 0) * 0.35));
  const symbolBoost = Math.max(-6, Math.min(6, (stats.bySymbol[symbol] || 0) * 0.3));
  const setupBoost = Math.max(-6, Math.min(6, (stats.bySetup[setup] || 0) * 0.4));
  return Math.round(sessionBoost + symbolBoost + setupBoost);
}

function getSessionSniperState(session: string): SessionSniperState {
  if (session.includes("New York")) {
    return {
      session,
      quality: 92,
      mode: "EXECUTION",
      allowSignal: true,
      reason: "New York execution window. Elite signals are allowed after AI + MTF confirmation.",
    };
  }

  if (session.includes("London")) {
    return {
      session,
      quality: 84,
      mode: "EXPANSION",
      allowSignal: true,
      reason: "London expansion window. Signals require strong confirmation.",
    };
  }

  if (session.includes("Asia")) {
    return {
      session,
      quality: 62,
      mode: "BUILDING",
      allowSignal: false,
      reason: "Asia is building liquidity. Watch only unless the score is exceptional.",
    };
  }

  return {
    session,
    quality: 45,
    mode: "LOW_ACTIVITY",
    allowSignal: false,
    reason: "Low activity window. Signal filter is strict.",
  };
}

function getLivePnL(trade: LiveTradeState, mark: number) {
  return trade.side === "LONG" ? mark - trade.entry : trade.entry - mark;
}

function shouldMoveToBE(trade: LiveTradeState, mark: number) {
  const risk = Math.max(Math.abs(trade.entry - trade.sl), trade.entry * 0.0001);
  return getLivePnL(trade, mark) >= risk;
}

function getTrailingSL(trade: LiveTradeState, mark: number, atr: number) {
  return trade.side === "LONG"
    ? Math.max(trade.sl, mark - atr * 1.4)
    : Math.min(trade.sl, mark + atr * 1.4);
}

function calcJournalPnL(entry: EliteJournalEntry, exit: number) {
  const pnl = entry.side === "LONG" ? exit - entry.entry : entry.entry - exit;
  const roi = (pnl / Math.max(entry.entry, 1)) * 100;
  return { pnl, roi };
}

function groupAccuracy(entries: EliteJournalEntry[], key: "symbol" | "timeframe" | "session") {
  return entries.reduce<Record<string, { total: number; wins: number }>>((acc, entry) => {
    const value = (entry[key] as string) || "Unknown";
    acc[value] = acc[value] || { total: 0, wins: 0 };
    acc[value].total += 1;
    if (entry.result === "WIN") acc[value].wins += 1;
    return acc;
  }, {});
}

function bestAccuracyLabel(group: Record<string, { total: number; wins: number }>) {
  return Object.entries(group)
    .sort((a, b) => (b[1].wins / Math.max(1, b[1].total)) - (a[1].wins / Math.max(1, a[1].total)))[0]?.[0] || "Waiting";
}

function buildAccuracyStats(journal: EliteJournalEntry[]) {
  const closed = journal.filter((j) => j.result !== "OPEN");
  const wins = closed.filter((j) => j.result === "WIN");
  const losses = closed.filter((j) => j.result === "LOSS");
  const breakeven = closed.filter((j) => j.result === "BE");
  const avg = (arr: EliteJournalEntry[]) => arr.length ? Math.round(arr.reduce((sum, j) => sum + j.score, 0) / arr.length) : 0;
  const bySymbol = groupAccuracy(closed, "symbol");
  const byTimeframe = groupAccuracy(closed, "timeframe");
  const bySession = groupAccuracy(closed, "session");

  return {
    total: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    winRate: closed.length ? Math.round((wins.length / closed.length) * 100) : 0,
    bySymbol,
    byTimeframe,
    bySession,
    bestSymbol: bestAccuracyLabel(bySymbol),
    bestTimeframe: bestAccuracyLabel(byTimeframe),
    bestSession: bestAccuracyLabel(bySession),
    avgWinningScore: avg(wins),
    avgLosingScore: avg(losses),
    noiseWarning: avg(losses) >= 85 && losses.length >= 3,
  };
}

function runEliteAIScore(input: {
  structureScore: number;
  liquidityScore: number;
  triggerScore: number;
  sessionScore: number;
  mtfScore: number;
  riskPenalty: number;
}) {
  const raw =
    input.structureScore * 0.25 +
    input.liquidityScore * 0.2 +
    input.triggerScore * 0.25 +
    input.sessionScore * 0.1 +
    input.mtfScore * 0.15 -
    input.riskPenalty * 0.15;

  return Math.max(0, Math.min(100, Math.round(raw)));
}

function runEliteBacktest(candles: Candle[], signals: SignalMarker[], symbol: string, selectedMode: "SCALP" | "SWING", selectedTimeframe: string) {
  const visible = signals.filter((s) => Number.isFinite(s.price) && s.confidence >= PRECISION_RULES.minWatchQuality);
  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let totalScore = 0;

  visible.forEach((signal) => {
    const structureScore = Math.max(0, Math.min(100, Math.round(signal.confidence * 0.9)));
    const liquidityScore = Math.max(0, Math.min(100, Math.round(signal.confidence * 0.85)));
    const triggerScore = Math.max(0, Math.min(100, Math.round(signal.confidence * 0.95)));
    const brain = runUnifiedBrain({
      symbol,
      selectedMode,
      selectedTimeframe,
      session: "Backtest",
      livePrice: signal.price,
      activeTrade: null,
      tradeMarkers: [],
      draftUsd: "100",
      candlesSummary: { volatility: "NORMAL", trend: signal.direction === "LONG" ? "BULLISH" : "BEARISH", impulse: signal.direction === "LONG" ? "BULLISH" : "BEARISH" },
      structureScore,
      liquidityScore,
      triggerScore,
      signalPlan: {
        state: signal.direction === "LONG" ? "WATCH LONG" : "WATCH SHORT",
        direction: signal.direction,
        confidence: signal.confidence,
        entry: signal.price,
        sl: null,
        tp1: null,
        tp2: null,
        tp3: null,
        reason: "Backtest signal",
      },
      decisionPlan: {
        phase: "EXECUTE",
        direction: signal.direction,
        quality: signal.confidence,
        entry: signal.price,
        sl: null,
        tp1: null,
        tp2: null,
        tp3: null,
        reason: "Backtest decision",
      },
    });
    if (brain.phase !== "EXECUTE" && brain.phase !== "VALIDATED" && brain.phase !== "WATCH") return;
    totalScore += signal.confidence;
    const idx = candles.findIndex((c) => Number(c.time) >= Number(signal.time));
    const future = idx >= 0 ? candles.slice(idx + 1, idx + 30) : [];
    if (!future.length) return;

    const entry = signal.price;
    const riskDistance = Math.max(entry * 0.004, 0.0001);
    const isLong = signal.direction === "LONG";
    const sl = isLong ? entry - riskDistance : entry + riskDistance;
    const tp1 = isLong ? entry + riskDistance : entry - riskDistance;
    const tp2 = isLong ? entry + riskDistance * 2 : entry - riskDistance * 2;
    const tp3 = isLong ? entry + riskDistance * 3 : entry - riskDistance * 3;
    let status: "OPEN" | "TP1_HIT" | "TP2_HIT" | "RUNNER" | "CLOSED_TP" | "CLOSED_SL" = "OPEN";
    let beActive = false;

    for (const candle of future) {
      const hitSL = isLong ? candle.low <= sl : candle.high >= sl;
      const hitTP1 = isLong ? candle.high >= tp1 : candle.low <= tp1;
      const hitTP2 = isLong ? candle.high >= tp2 : candle.low <= tp2;
      const hitTP3 = isLong ? candle.high >= tp3 : candle.low <= tp3;
      if (hitTP1) {
        status = "TP1_HIT";
        beActive = true;
      }
      if (hitTP2) status = "TP2_HIT";
      if (hitTP3) {
        status = "CLOSED_TP";
        break;
      }
      if (hitSL) {
        status = beActive ? "RUNNER" : "CLOSED_SL";
        break;
      }
    }

    if (status === "CLOSED_TP") wins += 1;
    else if (status === "RUNNER" || status === "TP1_HIT" || status === "TP2_HIT") breakevens += 1;
    else losses += 1;
  });

  const total = wins + losses + breakevens;
  return {
    totalSignals: visible.length,
    tested: total,
    wins,
    losses,
    breakevens,
    winRate: total ? Math.round((wins / total) * 100) : 0,
    profitFactor: losses ? Number((wins / losses).toFixed(2)) : wins > 0 ? Number(wins.toFixed(2)) : 0,
    avgScore: visible.length ? Math.round(totalScore / visible.length) : 0,
  };
}


const BITGET_GRANULARITY: Record<string, string> = {
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1H": "1H",
  "4H": "4H",
  "1D": "1D",
};

async function fetchBitgetCandlesForSymbol(timeframe: string, symbol: string): Promise<Candle[]> {
  const granularity = BITGET_GRANULARITY[timeframe] || timeframe || "5m";
  const url = `https://api.bitget.com/api/v2/mix/market/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=${granularity}&limit=1000`;
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  const rows = Array.isArray(json?.data) ? json.data : [];

  return rows
    .map((row: unknown[]) => ({
      time: Math.floor(Number(row?.[0]) / 1000),
      open: Number(row?.[1]),
      high: Number(row?.[2]),
      low: Number(row?.[3]),
      close: Number(row?.[4]),
    }))
    .filter((c: Candle) =>
      Number.isFinite(Number(c.time)) &&
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close) &&
      c.open > 0 &&
      c.high > 0 &&
      c.low > 0 &&
      c.close > 0
    )
    .sort((a: Candle, b: Candle) => Number(a.time) - Number(b.time));
}

async function fetchBitgetTickerForSymbol(symbol: string) {
  const res = await fetch(
    `https://api.bitget.com/api/v2/mix/market/ticker?symbol=${symbol}&productType=USDT-FUTURES`,
    { cache: "no-store" }
  );
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data[0] : json?.data;
}



type AIMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  time: string;
  structured?: WolvreneStructuredResponse;
};

type AITab = "chat" | "insights" | "trade" | "context" | "analytics" | "learning";

type SignalState = "WAITING" | "WATCH LONG" | "WATCH SHORT" | "CONFIRMED LONG" | "CONFIRMED SHORT" | "NO TRADE";
type RiskState = "LOW" | "CONTROLLED" | "ELEVATED" | "HIGH" | "NO TRADE";
type SignalDirection = "LONG" | "SHORT" | null;

type SignalPlan = {
  state: SignalState;
  direction: SignalDirection;
  confidence: number;
  risk: RiskState;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  reason: string;
  warning: string | null;
  markerTime: number | null;
  markerPrice: number | null;
  shouldMark: boolean;
};

type SignalMarker = {
  id: number;
  key: string;
  timeframe: string;
  time: number;
  price: number;
  state: SignalState;
  direction: Exclude<SignalDirection, null>;
  confidence: number;
};

type VisualMarkerKind = "STRUCTURE" | "BOS" | "CHOCH" | "SWEEP" | "TRIGGER" | "DECISION" | "LIQUIDITY";

type VisualIntelligenceMarker = {
  id: string;
  kind: VisualMarkerKind;
  label: string;
  time: number;
  price: number;
  direction: SignalDirection;
  strength: number;
};

type VisualLiquidityZone = {
  id: string;
  label: string;
  side: "BUY_SIDE" | "SELL_SIDE";
  price: number;
  time: number;
  active: boolean;
};

type SmartSignalMemory = {
  key: string;
  direction: SignalDirection;
  quality: number;
  phase: DecisionPhase;
  barTime: number | null;
  expiresAt: number;
};

type CandleSummary = {
  candles: number;
  trend: "BULLISH" | "BEARISH" | "MIXED" | "WAITING";
  lastClose: number;
  high: number;
  low: number;
  rangePct: number;
  avgBodyPct: number;
  volatility: "LOW" | "NORMAL" | "HIGH";
  impulse: "BULLISH" | "BEARISH" | "NONE";
};

type StructuredJournalEntry = {
  id: number;
  time: string;
  event: "ORDER_CREATED" | "TP_HIT" | "SL_HIT" | "PARTIAL_CLOSE" | "BE_MOVE" | "TRAIL_UPDATE" | "WARNING" | "SIGNAL_USED" | "MANUAL";
  symbol: string;
  timeframe: string;
  session: string;
  side?: Direction;
  entry?: number;
  exit?: number;
  pnl?: number;
  roi?: number;
  confidence?: number;
  note: string;
};

type LearningWeights = {
  session: Record<string, number>;
  timeframe: Record<string, number>;
  bias: Record<string, number>;
  wins: number;
  losses: number;
};

type TradeManagerSettings = {
  autoMoveBE: boolean;
  autoPartialClose: boolean;
  trailingEnabled: boolean;
  trailingRMultiple: number;
  structureWeaknessWarnings: boolean;
};

type ExternalAlertSettings = {
  discordWebhook: string;
  telegramWebhook: string;
  emailWebhook: string;
  enabled: boolean;
  discordSignalOnly: boolean;
  autoDiscordSignals: boolean;
  minSignalConfidence: number;
};

type StructureBias = "BULLISH" | "BEARISH" | "RANGING" | "WAITING";
type StructureEvent = "BOS_UP" | "BOS_DOWN" | "CHOCH_UP" | "CHOCH_DOWN" | "SWEEP_LOW" | "SWEEP_HIGH" | "RECLAIM" | "REJECTION" | "NONE";
type LiquidityBias = "BUY_SIDE_TAKEN" | "SELL_SIDE_TAKEN" | "BALANCED" | "WAITING";
type TriggerQuality = "NONE" | "WEAK" | "VALID" | "STRONG" | "SNIPER";
type ManagementAction = "WAIT" | "HOLD" | "PROTECT_BE" | "TRAIL" | "SCALE_OUT" | "EARLY_EXIT" | "CANCEL";
type DecisionPhase = "SCANNING" | "SPAWNED" | "VALIDATED" | "EXECUTE" | "MANAGE" | "EXIT" | "FILTERED" | "NO_TRADE";
type TradeMode = "SCALP" | "SWING";
type TradeModeSelection = TradeMode | "AUTO";
type ExecutionTradeStatus = "OPEN" | "TP1_HIT" | "TP2_HIT" | "RUNNER" | "BREAKEVEN" | "CLOSING" | "CLOSED_TP" | "CLOSED_SL" | "CLOSED_MANUAL" | "INVALIDATED";
type SmartExecutionTrade = {
  id: string;
  symbol: string;
  timeframe: string;
  mode: TradeMode;
  side: "LONG" | "SHORT";
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  size: number;
  leverage: number;
  margin: number;
  confidence: number;
  reason: string;
  openedAt: number;
  status: ExecutionTradeStatus;
  invalidation: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  partial1Done: boolean;
  partial2Done: boolean;
  maxDrawdown: number;
  bestExcursion: number;
};
type TradeChartMarker = {
  id: string;
  symbol: string;
  timeframe: string;
  mode: TradeMode;
  side: "LONG" | "SHORT";
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  confidence: number;
  entryGrade: string;
  reason: string;
  openedAt: number;
  closedAt?: number;
  result?: "WIN" | "LOSS" | "BE" | "INVALIDATED";
  pnl?: number;
  closeReason?: string;
};

type MarketStructureState = {
  bias: StructureBias;
  lastSwingHigh: number | null;
  lastSwingLow: number | null;
  previousSwingHigh: number | null;
  previousSwingLow: number | null;
  event: StructureEvent;
  sweep: "HIGH" | "LOW" | null;
  score: number;
  summary: string;
};

type LiquidityState = {
  bias: LiquidityBias;
  sweptHigh: boolean;
  sweptLow: boolean;
  trapDirection: SignalDirection;
  buySideLevel: number | null;
  sellSideLevel: number | null;
  score: number;
  summary: string;
};

type TriggerValidationState = {
  quality: TriggerQuality;
  direction: SignalDirection;
  reclaim: boolean;
  rejection: boolean;
  breakout: boolean;
  fakeout: boolean;
  score: number;
  summary: string;
};

type ManagementBrainState = {
  action: ManagementAction;
  warning: string | null;
  suggestedSL: number | null;
  protectProfit: boolean;
  reason: string;
};

type DecisionSettings = {
  enabled: boolean;
  holdBars: number;
  executeConfidence: number;
  validateConfidence: number;
  spawnConfidence: number;
  cancelOnOppositeShift: boolean;
  showDecisionPanel: boolean;
  requireTriggerForExecute: boolean;
  proSignalOnly: boolean;
};
type SignalSubscriptionSettings = {
  timeframes: Record<string, boolean>;
  modes: Record<"SCALP" | "SWING" | "SMART_FIB", boolean>;
  minConfidence: number;
  cooldownSeconds: number;
  maxFeedRows: number;
  allowMultiTimeframeTrades: boolean;
  executionProfile: "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE";
};

type DecisionPlan = {
  id: string;
  symbol: string;
  timeframe: string;
  mode: TradeMode;
  phase: DecisionPhase;
  direction: SignalDirection;
  confidence: number;
  quality: number;
  risk: RiskState;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  trigger: StructureEvent;
  structure: StructureBias;
  liquidity: LiquidityBias;
  triggerQuality: TriggerQuality;
  managementAction: ManagementAction;
  proSignal: boolean;
  invalidation: number | null;
  action: string;
  reason: string;
  createdAt: number;
  expiresAt: number | null;
  markerTime: number | null;
  shouldMark: boolean;
};

const defaultLearningWeights: LearningWeights = { session: {}, timeframe: {}, bias: {}, wins: 0, losses: 0 };
const defaultTradeManagerSettings: TradeManagerSettings = { autoMoveBE: true, autoPartialClose: true, trailingEnabled: true, trailingRMultiple: 1.4, structureWeaknessWarnings: true };
const defaultExternalAlertSettings: ExternalAlertSettings = { discordWebhook: "", telegramWebhook: "", emailWebhook: "", enabled: false, discordSignalOnly: true, autoDiscordSignals: false, minSignalConfidence: 86 };
const defaultDecisionSettings: DecisionSettings = { enabled: true, holdBars: 10, executeConfidence: 86, validateConfidence: 72, spawnConfidence: 58, cancelOnOppositeShift: true, showDecisionPanel: true, requireTriggerForExecute: true, proSignalOnly: true };
const defaultSignalSubscriptionSettings: SignalSubscriptionSettings = {
  timeframes: { "1m": false, "3m": false, "5m": true, "15m": true, "30m": false, "1H": false, "4H": false, "1D": false },
  modes: { SCALP: true, SWING: true, SMART_FIB: true },
  minConfidence: 70,
  cooldownSeconds: 60,
  maxFeedRows: 12,
  allowMultiTimeframeTrades: false,
  executionProfile: "BALANCED",
};

type WolvreneUserPrefs = {
  selectedSymbol: string;
  timeframe: string;
  marginMode: "isolated" | "cross";
  orderType: "limit" | "market";
  orderSide: Exclude<Direction, null>;
  draftPrice: string;
  draftUsd: string;
  draftLeverage: string;
  terminalTab: "dashboard" | "radar" | "analytics" | "journal" | "backtest" | "pro";
  hideUI: boolean;
  smartFibEnabled: boolean;
};

function userPrefsKey() { return "wolvrene_user_prefs_v37"; }

const defaultUserPrefs: WolvreneUserPrefs = {
  selectedSymbol: TRADE_SYMBOLS[0].symbol,
  timeframe: "15m",
  marginMode: "isolated",
  orderType: "limit",
  orderSide: "LONG",
  draftPrice: "",
  draftUsd: "100",
  draftLeverage: "5",
  terminalTab: "dashboard",
  hideUI: false,
  smartFibEnabled: false,
};

const SCALP_TIMEFRAMES = ["1m", "3m", "5m", "15m"] as const;
const SWING_TIMEFRAMES = ["15m", "30m", "1H", "4H", "1D"] as const;

function hasExecutableDecision(plan: DecisionPlan | null | undefined) {
  return Boolean(plan?.direction && (plan.phase === "EXECUTE" || plan.phase === "MANAGE" || plan.phase === "EXIT"));
}

export default function WolvreneTerminal() {
  const [accessEmail, setAccessEmail] = useState(() => storageGet("wolvrene_access_email", ""));
  const [marketRadarIntelligence, setMarketRadarIntelligence] = useState<MarketIntelligence | null>(null);
  const [marketRadarLoading, setMarketRadarLoading] = useState(false);
  const [marketRadarSource, setMarketRadarSource] = useState<"shared-fetch" | "panel-callback" | "none">("none");
  const [accessStatus, setAccessStatus] = useState<AccessStatus>(() => {
    const cachedAccess = storageGet<string | boolean>("wolvrene_access_granted", "false");
    const cachedEmail = storageGet("wolvrene_access_email", "");
    const hasCachedAccess = cachedAccess === true || cachedAccess === "true";
    return hasCachedAccess && cachedEmail ? "granted" : "locked";
  });
  const [accessError, setAccessError] = useState("");
  const [accessLoading, setAccessLoading] = useState(false);
  const [hydrated] = useState(true);
  const [timeframe, setTimeframe] = useState(() => storageGet<WolvreneUserPrefs>(userPrefsKey(), defaultUserPrefs).timeframe || "15m");
  const [tradeModeSelection, setTradeModeSelection] = useState<TradeModeSelection>("AUTO");
  const [selectedSymbol, setSelectedSymbol] = useState(() => storageGet<WolvreneUserPrefs>(userPrefsKey(), defaultUserPrefs).selectedSymbol || TRADE_SYMBOLS[0].symbol);
  const [assetMenuOpen, setAssetMenuOpen] = useState(false);
  const [terminalTab, setTerminalTab] = useState<"dashboard" | "radar" | "analytics" | "journal" | "backtest" | "pro">(() => storageGet<WolvreneUserPrefs>(userPrefsKey(), defaultUserPrefs).terminalTab || "dashboard");
  const [backtestRange, setBacktestRange] = useState<100 | 500 | 1000>(500);
  const [eliteJournal, setEliteJournal] = useState<EliteJournalEntry[]>(() =>
    storageGet<EliteJournalEntry[]>(eliteJournalKey(), [])
  );
  const [learningStats, setLearningStats] = useState<LearningStats>(() =>
    storageGet<LearningStats>(learningStatsKey(), defaultLearningStats())
  );
  const [settings, setSettings] = useState<ChartSettings>(() =>
    loadJson("wolvreneChartSettings", defaultSettings)
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [smartFibEnabled, setSmartFibEnabled] = useState(() => storageGet<WolvreneUserPrefs>(userPrefsKey(), defaultUserPrefs).smartFibEnabled || false);
  const [smartFibSettingsOpen, setSmartFibSettingsOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [hideUI, setHideUI] = useState(() => Boolean(storageGet<WolvreneUserPrefs>(userPrefsKey(), defaultUserPrefs).hideUI));
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTab, setAiTab] = useState<AITab>("chat");
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([
    {
      id: 1,
      role: "assistant",
      time: "Ready",
      text: "WOLVRENE REAL AI BRIDGE armed. I can read the current dashboard context, open orders, active alerts, session, bias, timeframe, TP/SL, and answer through the /api/ai bridge when your OpenAI key is connected.",
    },
  ]);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiBridgeStatus, setAiBridgeStatus] = useState<"ready" | "connected" | "missing_key" | "error">("ready");
  const [aiExplanationMode, setAiExplanationMode] = useState<ExplanationMode>("Trader");
  const [lastValidAIResponse, setLastValidAIResponse] = useState<WolvreneStructuredResponse | null>(null);

  const [recentCandles, setRecentCandles] = useState<Candle[]>([]);

  // Smart Fib state
  const [smartFibSettings, setSmartFibSettings] = useState(() => ({ ...SMART_FIB_DEFAULTS }));
  const smartFibEngine = useMemo(() => {
    const engine = new SmartFibEngine();
    engine.updateSettings(smartFibSettings);
    return engine;
  }, [smartFibSettings]);
  const [smartFibContext, setSmartFibContext] = useState<SmartFibContext>(() => ({
    enabled: false,
    mapState: "WAITING",
    setupType: "WAITING",
    activeFibLevels: [],
    strongestLevels: [],
    sniperLevels: [],
    secondGoldLevels: [],
    activeBoxes: [],
    entryCandidates: [],
    dashboardSummary: "Smart Fib Engine initializing...",
    lastSignals: [],
  }));
  const smartFibProcessedUntilRef = useRef<number | null>(null);

  const [smartFibSignals, setSmartFibSignals] = useState<SmartFibSignal[]>([]);

  useEffect(() => {
    if (smartFibEnabled) {
      smartFibEngine.enable();
    } else {
      smartFibEngine.disable();
    }
    smartFibProcessedUntilRef.current = null;
    setSmartFibSignals([]);
    setSmartFibContext(smartFibEngine.getContext());
  }, [smartFibEnabled, smartFibEngine]);

  useEffect(() => {
    if (!smartFibEnabled || recentCandles.length === 0) {
      setSmartFibContext(smartFibEngine.getContext());
      return;
    }

    const lastProcessedTime = smartFibProcessedUntilRef.current;
    const pendingCandles = lastProcessedTime === null
      ? recentCandles
      : recentCandles.filter((c) => c.time > lastProcessedTime);

    if (pendingCandles.length === 0) {
      setSmartFibContext(smartFibEngine.getContext());
      return;
    }

    const signals = smartFibEngine.processCandles(pendingCandles);
    smartFibProcessedUntilRef.current = recentCandles[recentCandles.length - 1]?.time ?? lastProcessedTime;
    setSmartFibContext(smartFibEngine.getContext());
    setSmartFibSignals((prev) => {
      const combined = [...prev, ...signals];
      const deduped = combined.filter((sig, idx, arr) => arr.findIndex((s) => s.id === sig.id) === idx);
      return deduped.slice(-50);
    });
  }, [recentCandles, smartFibEnabled, smartFibEngine]);

  const [orders, setOrders] = useState<TradeOrder[]>(() =>
    loadJson("wolvreneOrdersV15", [] as TradeOrder[]).map((order) =>
      normalizeOrderFinancials(order)
    )
  );
  const [alerts, setAlerts] = useState<PriceAlert[]>(() =>
    loadJson("wolvreneAlertsV15", [] as PriceAlert[])
  );
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [activeExecutionTrade, setActiveExecutionTrade] = useState<SmartExecutionTrade | null>(() => {
    const stored = storageGet<SmartExecutionTrade | null>(activeExecutionTradeKey(), null);
    if (!stored) return null;
    return { ...stored, openedAt: normalizeEpochMs(stored.openedAt) };
  });
  const [lastClosedExecutionTrade, setLastClosedExecutionTrade] = useState<SmartExecutionTrade | null>(null);
  const [tradeMarkers, setTradeMarkers] = useState<TradeChartMarker[]>(() =>
    storageGet<TradeChartMarker[]>(tradeMarkersKey(selectedSymbol, timeframe, tradeModeSelection === "SWING" ? "SWING" : "SCALP"), [])
  );
  const [tradeLog, setTradeLog] = useState<LoggedTrade[]>(() => readTradeLog());
  const [discordSentState, setDiscordSentState] = useState(false);
  const [tradeRecalcCooldownCycles, setTradeRecalcCooldownCycles] = useState(0);
  const [lineEditor, setLineEditor] = useState<LineEditor>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [signalMarkers, setSignalMarkers] = useState<SignalMarker[]>(() =>
    storageGet<SignalMarker[]>(signalMarkersKey(selectedSymbol, timeframe), [])
  );
  const [structuredJournal, setStructuredJournal] = useState<StructuredJournalEntry[]>(() =>
    loadJson("wolvreneStructuredJournalV1", [] as StructuredJournalEntry[])
  );
  const [learningWeights, setLearningWeights] = useState<LearningWeights>(() =>
    loadJson("wolvreneLearningWeightsV1", defaultLearningWeights)
  );
  const [tradeManagerSettings, setTradeManagerSettings] = useState<TradeManagerSettings>(() => ({
    ...defaultTradeManagerSettings,
    ...loadJson("wolvreneTradeManagerSettingsV1", defaultTradeManagerSettings),
  }));
  const [externalAlertSettings, setExternalAlertSettings] = useState<ExternalAlertSettings>(() => ({
    ...defaultExternalAlertSettings,
    ...loadJson("wolvreneExternalAlertSettingsV1", defaultExternalAlertSettings),
  }));
  const [decisionSettings, setDecisionSettings] = useState<DecisionSettings>(() => ({
    ...defaultDecisionSettings,
    ...loadJson("wolvreneDecisionSettingsV1", defaultDecisionSettings),
  }));
  const [signalSubscriptionSettings, setSignalSubscriptionSettings] = useState<SignalSubscriptionSettings>(() => ({
    ...defaultSignalSubscriptionSettings,
    ...loadJson("wolvreneSignalSubscriptionSettingsV1", defaultSignalSubscriptionSettings),
  }));
  const [activeDecision, setActiveDecision] = useState<DecisionPlan | null>(null);
  const [decisionHistory, setDecisionHistory] = useState<DecisionPlan[]>(() =>
    loadJson("wolvreneDecisionHistoryV1", [] as DecisionPlan[])
  );
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [tradeWarnings, setTradeWarnings] = useState<string[]>([]);

  const [session, setSession] = useState("Loading...");
  const [clock, setClock] = useState("--:--:--");
  const [sessionCountdown, setSessionCountdown] = useState("--:--");
  const [lastEngineHeartbeat, setLastEngineHeartbeat] = useState(() => new Date().toLocaleTimeString());
  const [wolfMode, setWolfMode] = useState("STALKING");
  const [bias, setBias] = useState("NEUTRAL");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [journalNote, setJournalNote] = useState("");
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() =>
    loadJson("wolvreneJournal", [] as JournalEntry[])
  );
  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0, price: 0 });

  const [orderSide, setOrderSide] = useState<Exclude<Direction, null>>(() => storageGet<WolvreneUserPrefs>(userPrefsKey(), defaultUserPrefs).orderSide || "LONG");
  const [marginMode, setMarginMode] = useState<"isolated" | "cross">(() => storageGet<WolvreneUserPrefs>(userPrefsKey(), defaultUserPrefs).marginMode || "isolated");
  const [orderType, setOrderType] = useState<"limit" | "market">(() => storageGet<WolvreneUserPrefs>(userPrefsKey(), defaultUserPrefs).orderType || "limit");
  const [draftPrice, setDraftPrice] = useState(() => storageGet<WolvreneUserPrefs>(userPrefsKey(), defaultUserPrefs).draftPrice || "");
  const [draftSize, setDraftSize] = useState("0.01"); // legacy base-size mirror calculated from USDT
  const [draftUsd, setDraftUsd] = useState(() => storageGet<WolvreneUserPrefs>(userPrefsKey(), defaultUserPrefs).draftUsd || "100");
  const [draftLeverage, setDraftLeverage] = useState(() => storageGet<WolvreneUserPrefs>(userPrefsKey(), defaultUserPrefs).draftLeverage || "5");

  const [marketStats, setMarketStats] = useState({
    high: "--",
    low: "--",
    volume: "--",
    change: "--",
    funding: "--",
  });

  const priceTextRef = useRef<HTMLParagraphElement>(null);
  const statusTextRef = useRef<HTMLSpanElement>(null);
  const latencyTextRef = useRef<HTMLSpanElement>(null);
  const lastTickTextRef = useRef<HTMLSpanElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastCandleRef = useRef<Candle | null>(null);
  const chartAliveRef = useRef(false);
  const timeframeRef = useRef(timeframe);
  const selectedSymbolRef = useRef(selectedSymbol);
  const ordersRef = useRef<TradeOrder[]>(orders);
  const alertsRef = useRef<PriceAlert[]>(alerts);
  const lastTickMsRef = useRef<number>(0);
  const aiScrollRef = useRef<HTMLDivElement>(null);
  const aiMessagesEndRef = useRef<HTMLDivElement>(null);
  const aiRequestSeqRef = useRef(0);
  const aiInFlightRef = useRef(false);
  const lastAIRequestKeyRef = useRef("");
  const signalKeyRef = useRef<string>("");
  const externalAlertBusyRef = useRef(false);
  const lastDiscordSignalKeyRef = useRef("");
  const decisionKeyRef = useRef("");
  const smartSignalRef = useRef<SmartSignalMemory | null>(null);
  const smartSignalCooldownRef = useRef(0);
  const visualSignalKeyRef = useRef("");
  const lastExecutionStatusRef = useRef<ExecutionTradeStatus | null>(null);
  const signalMarkerDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const cachedEmail = readStoredAccessEmail();
      const hasCachedAccess = readStoredAccessGranted();
      setAccessEmail(cachedEmail);
      setAccessStatus(hasCachedAccess && cachedEmail ? "granted" : "locked");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSignalMarkers(
        storageGet<SignalMarker[]>(signalMarkersKey(selectedSymbol, timeframe), [])
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedSymbol, timeframe]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const modeBucket: TradeMode = tradeModeSelection === "SWING" ? "SWING" : "SCALP";
      setTradeMarkers(storageGet<TradeChartMarker[]>(tradeMarkersKey(selectedSymbol, timeframe, modeBucket), []));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedSymbol, timeframe, tradeModeSelection]);

useEffect(() => {
  if (!hydrated) return;
  storageSet(
    signalMarkersKey(selectedSymbol, timeframe),
    signalMarkers.slice(-PRECISION_RULES.maxSignalMemory)
  );
}, [signalMarkers, selectedSymbol, timeframe, hydrated]);

useEffect(() => {
  if (!hydrated) return;
  const modeBucket: TradeMode = tradeModeSelection === "SWING" ? "SWING" : "SCALP";
  storageSet(tradeMarkersKey(selectedSymbol, timeframe, modeBucket), tradeMarkers);
}, [tradeMarkers, selectedSymbol, timeframe, tradeModeSelection, hydrated]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLastEngineHeartbeat(new Date().toLocaleTimeString());
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLastEngineHeartbeat(new Date().toLocaleTimeString());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [timeframe, selectedSymbol]);

  useEffect(() => {
    if (!livePrice || tradeRecalcCooldownCycles <= 0) return;
    const timer = window.setTimeout(() => {
      setTradeRecalcCooldownCycles((prev) => Math.max(0, prev - 1));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [livePrice, tradeRecalcCooldownCycles]);
  async function verifyAccess(email?: string) {
    const cleanEmail = (email || accessEmail).trim().toLowerCase();
    if (!cleanEmail) {
      setAccessError("Enter the email used for your Wolvrene / Whop subscription.");
      return;
    }


    setAccessLoading(true);
    setAccessError("");

    try {
      const response = await fetch("/api/wolvrene/access/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data?.active) {
        storageSet("wolvrene_access_granted", true);
        storageSet("wolvrene_access_email", cleanEmail);
        setAccessEmail(cleanEmail);
        setAccessStatus("granted");
        return;
      }

      setAccessStatus("locked");
      setAccessError(data?.message || "No active VIP subscription was found for this email.");
    } catch {
      setAccessStatus("locked");
      setAccessError("Access server is not connected yet. Add /api/wolvrene/access/check to verify Whop memberships.");
    } finally {
      setAccessLoading(false);
    }
  }

  function logoutAccess() {
    localStorage.removeItem("wolvrene_access_granted");
    localStorage.removeItem("wolvrene_access_email");
    setAccessEmail("");
    setAccessStatus("locked");
  }


  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || orders[0] || null,
    [orders, selectedOrderId]
  );

  const candlesSummary = useMemo<CandleSummary>(() => {
    const sample = recentCandles.slice(-30);
    if (sample.length < 4) {
      return { candles: sample.length, trend: "WAITING", lastClose: 0, high: 0, low: 0, rangePct: 0, avgBodyPct: 0, volatility: "NORMAL", impulse: "NONE" };
    }
    const first = sample[0];
    const last = sample[sample.length - 1];
    const high = Math.max(...sample.map((c) => c.high));
    const low = Math.min(...sample.map((c) => c.low));
    const bodies = sample.map((c) => Math.abs(c.close - c.open) / Math.max(c.open, 1) * 100);
    const avgBodyPct = bodies.reduce((a, b) => a + b, 0) / bodies.length;
    const rangePct = ((high - low) / Math.max(last.close, 1)) * 100;
    const upCloses = sample.filter((c) => c.close > c.open).length;
    const downCloses = sample.filter((c) => c.close < c.open).length;
    const trend = last.close > first.close && upCloses >= downCloses ? "BULLISH" : last.close < first.close && downCloses >= upCloses ? "BEARISH" : "MIXED";
    const lastBody = ((last.close - last.open) / Math.max(last.open, 1)) * 100;
    const impulse = Math.abs(lastBody) > avgBodyPct * 1.8 ? (lastBody > 0 ? "BULLISH" : "BEARISH") : "NONE";
    const volatility = rangePct > 1.8 ? "HIGH" : rangePct < 0.45 ? "LOW" : "NORMAL";
    return { candles: sample.length, trend, lastClose: last.close, high, low, rangePct, avgBodyPct, volatility, impulse };
  }, [recentCandles]);



  const structureState = useMemo<MarketStructureState>(() => {
    const sample = recentCandles.slice(-80);
    if (sample.length < 12) {
      return { bias: "WAITING", lastSwingHigh: null, lastSwingLow: null, previousSwingHigh: null, previousSwingLow: null, event: "NONE", sweep: null, score: 0, summary: "Waiting for enough candles to build structure." };
    }

    const pivotsHigh: { index: number; price: number }[] = [];
    const pivotsLow: { index: number; price: number }[] = [];

    for (let i = 2; i < sample.length - 2; i++) {
      const c = sample[i];
      const left = sample.slice(i - 2, i);
      const right = sample.slice(i + 1, i + 3);
      if (left.every((x) => c.high >= x.high) && right.every((x) => c.high >= x.high)) pivotsHigh.push({ index: i, price: c.high });
      if (left.every((x) => c.low <= x.low) && right.every((x) => c.low <= x.low)) pivotsLow.push({ index: i, price: c.low });
    }

    const lastHigh = pivotsHigh[pivotsHigh.length - 1] || null;
    const prevHigh = pivotsHigh[pivotsHigh.length - 2] || null;
    const lastLow = pivotsLow[pivotsLow.length - 1] || null;
    const prevLow = pivotsLow[pivotsLow.length - 2] || null;
    const last = sample[sample.length - 1];
    const prev = sample[sample.length - 2];
    const avgRange = sample.slice(-20).reduce((sum, c) => sum + Math.max(c.high - c.low, 0), 0) / 20;
    const buffer = Math.max(avgRange * 0.18, last.close * 0.00045);

    const higherHigh = Boolean(lastHigh && prevHigh && lastHigh.price > prevHigh.price);
    const higherLow = Boolean(lastLow && prevLow && lastLow.price > prevLow.price);
    const lowerHigh = Boolean(lastHigh && prevHigh && lastHigh.price < prevHigh.price);
    const lowerLow = Boolean(lastLow && prevLow && lastLow.price < prevLow.price);

    let biasState: StructureBias = "RANGING";
    if ((higherHigh && higherLow) || (lastHigh && last.close > lastHigh.price - buffer)) biasState = "BULLISH";
    if ((lowerHigh && lowerLow) || (lastLow && last.close < lastLow.price + buffer)) biasState = "BEARISH";

    const brokeHigh = Boolean(lastHigh && last.close > lastHigh.price + buffer && prev.close <= lastHigh.price + buffer);
    const brokeLow = Boolean(lastLow && last.close < lastLow.price - buffer && prev.close >= lastLow.price - buffer);
    const sweptHigh = Boolean(lastHigh && last.high > lastHigh.price + buffer && last.close < lastHigh.price);
    const sweptLow = Boolean(lastLow && last.low < lastLow.price - buffer && last.close > lastLow.price);
    const reclaimed = Boolean((lastLow && prev.close < lastLow.price && last.close > lastLow.price) || (lastHigh && prev.close > lastHigh.price && last.close < lastHigh.price));

    let event: StructureEvent = "NONE";
    if (brokeHigh) event = biasState === "BEARISH" ? "CHOCH_UP" : "BOS_UP";
    else if (brokeLow) event = biasState === "BULLISH" ? "CHOCH_DOWN" : "BOS_DOWN";
    else if (sweptLow) event = "SWEEP_LOW";
    else if (sweptHigh) event = "SWEEP_HIGH";
    else if (reclaimed) event = "RECLAIM";

    const eventScore = event === "BOS_UP" || event === "BOS_DOWN" ? 18 : event === "CHOCH_UP" || event === "CHOCH_DOWN" ? 22 : event === "SWEEP_LOW" || event === "SWEEP_HIGH" ? 16 : event === "RECLAIM" ? 14 : 0;
    const structureScore = (biasState === "BULLISH" || biasState === "BEARISH" ? 14 : 4) + eventScore;
    const summary = `${biasState} structure · ${event} · H:${lastHigh ? formatPrice(lastHigh.price) : "--"} / L:${lastLow ? formatPrice(lastLow.price) : "--"}`;

    return {
      bias: biasState,
      lastSwingHigh: lastHigh?.price ?? null,
      lastSwingLow: lastLow?.price ?? null,
      previousSwingHigh: prevHigh?.price ?? null,
      previousSwingLow: prevLow?.price ?? null,
      event,
      sweep: sweptHigh ? "HIGH" : sweptLow ? "LOW" : null,
      score: Math.max(0, Math.min(40, structureScore)),
      summary,
    };

  }, [recentCandles]);

  const liquidityState = useMemo<LiquidityState>(() => {
    const sample = recentCandles.slice(-60);
    if (sample.length < 12) {
      return { bias: "WAITING", sweptHigh: false, sweptLow: false, trapDirection: null, buySideLevel: null, sellSideLevel: null, score: 0, summary: "Waiting for liquidity context." };
    }

    const last = sample[sample.length - 1];
    const prev = sample[sample.length - 2];
    const window = sample.slice(-24, -1);
    const buySideLevel = structureState.lastSwingHigh || Math.max(...window.map((c) => c.high));
    const sellSideLevel = structureState.lastSwingLow || Math.min(...window.map((c) => c.low));
    const avgRange = sample.slice(-20).reduce((sum, c) => sum + Math.max(c.high - c.low, 0), 0) / 20;
    const buffer = Math.max(avgRange * 0.12, last.close * 0.00035);

    const sweptHigh = Boolean(buySideLevel && last.high > buySideLevel + buffer && last.close < buySideLevel && prev.close <= buySideLevel + buffer);
    const sweptLow = Boolean(sellSideLevel && last.low < sellSideLevel - buffer && last.close > sellSideLevel && prev.close >= sellSideLevel - buffer);
    const trapDirection: SignalDirection = sweptLow ? "LONG" : sweptHigh ? "SHORT" : null;
    const bias: LiquidityBias = sweptHigh ? "BUY_SIDE_TAKEN" : sweptLow ? "SELL_SIDE_TAKEN" : "BALANCED";
    const score = sweptHigh || sweptLow ? 18 : 4;
    const summary = `${bias} · buy-side ${buySideLevel ? formatPrice(buySideLevel) : "--"} · sell-side ${sellSideLevel ? formatPrice(sellSideLevel) : "--"}`;

    return { bias, sweptHigh, sweptLow, trapDirection, buySideLevel, sellSideLevel, score, summary };
  }, [recentCandles, structureState.lastSwingHigh, structureState.lastSwingLow]);

  const triggerValidation = useMemo<TriggerValidationState>(() => {
    const sample = recentCandles.slice(-12);
    if (sample.length < 4) {
      return { quality: "NONE", direction: null, reclaim: false, rejection: false, breakout: false, fakeout: false, score: 0, summary: "Waiting for trigger candles." };
    }

    const last = sample[sample.length - 1];
    const prev = sample[sample.length - 2];
    const body = Math.abs(last.close - last.open);
    const range = Math.max(last.high - last.low, last.close * 0.0001);
    const bodyRatio = body / range;
    const upperWick = last.high - Math.max(last.open, last.close);
    const lowerWick = Math.min(last.open, last.close) - last.low;

    const reclaimLong = Boolean(structureState.lastSwingLow && prev.close < structureState.lastSwingLow && last.close > structureState.lastSwingLow);
    const reclaimShort = Boolean(structureState.lastSwingHigh && prev.close > structureState.lastSwingHigh && last.close < structureState.lastSwingHigh);
    const rejectionLong = lowerWick > body * 1.35 && last.close > last.open;
    const rejectionShort = upperWick > body * 1.35 && last.close < last.open;
    const breakoutLong = Boolean(structureState.lastSwingHigh && last.close > structureState.lastSwingHigh && bodyRatio > 0.42);
    const breakoutShort = Boolean(structureState.lastSwingLow && last.close < structureState.lastSwingLow && bodyRatio > 0.42);
    const bosUp = structureState.event === "BOS_UP" || structureState.event === "CHOCH_UP";
    const bosDown = structureState.event === "BOS_DOWN" || structureState.event === "CHOCH_DOWN";
    const bullishDisplacement = last.close > last.open && bodyRatio > 0.6;
    const bearishDisplacement = last.close < last.open && bodyRatio > 0.6;
    const avgRecentRange = sample.slice(0, -1).reduce((sum, c) => sum + Math.max(c.high - c.low, 0), 0) / Math.max(sample.length - 1, 1);
    const volumeExpansion = range > avgRecentRange * 1.15;
    const fakeout = Boolean(liquidityState.sweptHigh || liquidityState.sweptLow);

    const direction: SignalDirection = reclaimLong || rejectionLong || breakoutLong || liquidityState.sweptLow || bosUp
      ? "LONG"
      : reclaimShort || rejectionShort || breakoutShort || liquidityState.sweptHigh || bosDown
      ? "SHORT"
      : null;

    const longScore =
      (liquidityState.sweptLow ? 16 : 0) +
      (reclaimLong ? 16 : 0) +
      (breakoutLong ? 14 : 0) +
      (bullishDisplacement ? 12 : 0) +
      (volumeExpansion ? 12 : 0) +
      (bosUp ? 14 : 0);
    const shortScore =
      (liquidityState.sweptHigh ? 16 : 0) +
      (rejectionShort ? 16 : 0) +
      (breakoutShort ? 14 : 0) +
      (bearishDisplacement ? 12 : 0) +
      (volumeExpansion ? 12 : 0) +
      (bosDown ? 14 : 0);
    const score = Math.min(40, Math.max(longScore, shortScore) + (fakeout ? 3 : 0));
    const quality: TriggerQuality = score >= 34 ? "SNIPER" : score >= 26 ? "STRONG" : score >= 18 ? "VALID" : score >= 10 ? "WEAK" : "NONE";
    const summary = `${quality} trigger · ${direction || "WAIT"} · L:${longScore} S:${shortScore} · vol:${volumeExpansion ? "Y" : "N"} disp:${bullishDisplacement || bearishDisplacement ? "Y" : "N"} bos:${bosUp || bosDown ? "Y" : "N"}`;

    return { quality, direction, reclaim: reclaimLong || reclaimShort, rejection: rejectionLong || rejectionShort, breakout: breakoutLong || breakoutShort, fakeout, score, summary };
  }, [recentCandles, structureState.lastSwingHigh, structureState.lastSwingLow, structureState.event, liquidityState.sweptHigh, liquidityState.sweptLow, liquidityState.trapDirection]);


  const backtestStats = useMemo(() => {
    const closed = structuredJournal.filter((entry) => typeof entry.pnl === "number" && (entry.event === "SL_HIT" || entry.event === "TP_HIT" || entry.event === "PARTIAL_CLOSE"));
    const wins = closed.filter((entry) => (entry.pnl || 0) > 0);
    const losses = closed.filter((entry) => (entry.pnl || 0) < 0);
    const grossWin = wins.reduce((sum, entry) => sum + Math.max(0, entry.pnl || 0), 0);
    const grossLoss = Math.abs(losses.reduce((sum, entry) => sum + Math.min(0, entry.pnl || 0), 0));
    const bySession = closed.reduce<Record<string, { total: number; wins: number }>>((acc, entry) => {
      const key = entry.session || "Unknown";
      acc[key] = acc[key] || { total: 0, wins: 0 };
      acc[key].total += 1;
      if ((entry.pnl || 0) > 0) acc[key].wins += 1;
      return acc;
    }, {});
    const byTimeframe = closed.reduce<Record<string, { total: number; wins: number }>>((acc, entry) => {
      const key = entry.timeframe || "Unknown";
      acc[key] = acc[key] || { total: 0, wins: 0 };
      acc[key].total += 1;
      if ((entry.pnl || 0) > 0) acc[key].wins += 1;
      return acc;
    }, {});
    const bestSession = Object.entries(bySession).sort((a, b) => (b[1].wins / Math.max(b[1].total, 1)) - (a[1].wins / Math.max(a[1].total, 1)))[0]?.[0] || "Waiting";
    const bestTimeframe = Object.entries(byTimeframe).sort((a, b) => (b[1].wins / Math.max(b[1].total, 1)) - (a[1].wins / Math.max(a[1].total, 1)))[0]?.[0] || "Waiting";
    return { trades: closed.length, wins: wins.length, losses: losses.length, winRate: closed.length ? (wins.length / closed.length) * 100 : 0, profitFactor: grossLoss ? grossWin / grossLoss : grossWin > 0 ? Number(grossWin.toFixed(2)) : 0, grossWin, grossLoss, bestSession, bestTimeframe };
  }, [structuredJournal]);

  const signalPlan = useMemo<SignalPlan>(() => {
    const mark = livePrice || lastCandleRef.current?.close || 0;
    const candle = lastCandleRef.current;
    const cleanNumber = (value: string) => Number(String(value || "").replace(/[^0-9.\-]/g, "")) || 0;
    const high24 = cleanNumber(marketStats.high);
    const low24 = cleanNumber(marketStats.low);
    const range24 = high24 > low24 ? high24 - low24 : mark * 0.012;
    const positionInRange = high24 > low24 && mark ? Math.max(0, Math.min(1, (mark - low24) / range24)) : 0.5;
    const candleMovePct = candle?.open ? ((candle.close - candle.open) / candle.open) * 100 : 0;
    const direction: SignalDirection = bias === "BULLISH" ? "LONG" : bias === "BEARISH" ? "SHORT" : null;

    if (!mark || !direction) {
      return {
        state: mark ? "NO TRADE" : "WAITING",
        direction: null,
        confidence: mark ? 38 : 0,
        risk: mark ? "NO TRADE" : "HIGH",
        entry: null,
        sl: null,
        tp1: null,
        tp2: null,
        tp3: null,
        reason: mark ? "No clean directional structure is confirmed yet." : "Waiting for live price and candle context.",
        warning: mark ? "Do not force a trade while bias is neutral." : null,
        markerTime: null,
        markerPrice: null,
        shouldMark: false,
      };
    }

    const sessionBoost =
      session.includes("New York") ? 9 : session.includes("London") ? 7 : session.includes("Asia") ? 4 : 1;
    const tfBoost = timeframe === "5m" || timeframe === "15m" ? 6 : timeframe === "1H" || timeframe === "4H" ? 4 : 2;
    const momentumBoost = direction === "LONG" ? Math.max(-12, Math.min(12, candleMovePct * 18)) : Math.max(-12, Math.min(12, -candleMovePct * 18));
    const locationBoost = direction === "LONG" ? (positionInRange < 0.78 ? 8 : -8) : (positionInRange > 0.22 ? 8 : -8);
    const openOrderPenalty = orders.some((order) => order.status !== "CLOSED") ? -7 : 0;
    const learningBoost = (learningWeights.session[session] || 0) + (learningWeights.timeframe[timeframe] || 0) + (direction ? learningWeights.bias[direction] || 0 : 0);
    const volatilityPenalty = candlesSummary.volatility === "HIGH" ? -5 : candlesSummary.volatility === "LOW" ? -2 : 0;
    const directionImpulse =
  direction === "LONG" ? "BULLISH" :
  direction === "SHORT" ? "BEARISH" :
  "NONE";

const impulseBoost =
  candlesSummary.impulse === directionImpulse ? 5 :
  candlesSummary.impulse === "NONE" ? 0 :
  -5;
    const score = Math.round(Math.max(24, Math.min(96, 48 + sessionBoost + tfBoost + momentumBoost + locationBoost + openOrderPenalty + learningBoost + volatilityPenalty + impulseBoost)));

    const state: SignalState =
      score >= 78
        ? direction === "LONG" ? "CONFIRMED LONG" : "CONFIRMED SHORT"
        : score >= 54
        ? direction === "LONG" ? "WATCH LONG" : "WATCH SHORT"
        : "NO TRADE";

    const risk: RiskState =
      state === "NO TRADE" ? "NO TRADE" : score >= 78 ? "LOW" : score >= 62 ? "CONTROLLED" : score >= 54 ? "ELEVATED" : "HIGH";

    const riskDistance = Math.max(range24 * 0.055, mark * 0.0024);
    const entry = mark;
    const sl = direction === "LONG" ? mark - riskDistance : mark + riskDistance;
    const tp1 = direction === "LONG" ? mark + riskDistance * 1.25 : mark - riskDistance * 1.25;
    const tp2 = direction === "LONG" ? mark + riskDistance * 2.0 : mark - riskDistance * 2.0;
    const tp3 = direction === "LONG" ? mark + riskDistance * 3.0 : mark - riskDistance * 3.0;

    const reason =
      state === "NO TRADE"
        ? "Structure is not clean enough for a signal. Wait for a stronger trigger."
        : `${direction} bias with ${session} timing, ${timeframe} momentum, and controlled location score.`;
    const warning =
      state.includes("WATCH")
        ? "Watch only. Precision engine waits for closed-candle confirmation before size."
        : state.includes("CONFIRMED")
        ? "Confirmed signal, but still manage risk through the printed SL and TP plan."
        : "No trade conditions. Stand aside.";

    return {
      state,
      direction,
      confidence: score,
      risk,
      entry,
      sl,
      tp1,
      tp2,
      tp3,
      reason,
      warning,
      markerTime: typeof candle?.time === "number" ? candle.time : null,
      markerPrice: entry,
      shouldMark: state === "WATCH LONG" || state === "WATCH SHORT" || state === "CONFIRMED LONG" || state === "CONFIRMED SHORT",
    };
  }, [livePrice, timeframe, session, bias, marketStats.high, marketStats.low, orders, learningWeights, candlesSummary]);




  const { institutionalPrecision, rawDecisionPlan } = useMemo(
    () =>
      buildRawDecisionPlan({
        livePrice,
        lastClose: lastCandleRef.current?.close || null,
        lastCandleTime: typeof lastCandleRef.current?.time === "number" ? lastCandleRef.current.time : null,
        selectedSymbol,
        timeframe,
        tradeModeSelection,
        signalPlan,
        structureState,
        liquidityState,
        triggerValidation,
        candlesVolatility: candlesSummary.volatility,
        session,
        recentCandles,
        decisionSettings,
        activeExecutionTrade,
        allowMultiTimeframeTrades: signalSubscriptionSettings.allowMultiTimeframeTrades,
        tradeRecalcCooldownCycles,
      }),
    [
      livePrice,
      selectedSymbol,
      timeframe,
      tradeModeSelection,
      signalPlan,
      structureState,
      liquidityState,
      triggerValidation,
      candlesSummary.volatility,
      session,
      recentCandles,
      decisionSettings,
      activeExecutionTrade,
      signalSubscriptionSettings.allowMultiTimeframeTrades,
      tradeRecalcCooldownCycles,
    ]
  );

  useEffect(() => {
    // Debug: log live candle updates
    console.debug("[Wolvrene] Live candle update", {
      symbol: selectedSymbol,
      timeframe,
      livePrice,
      candleTime: lastCandleRef.current?.time,
      recentCandlesCount: recentCandles.length,
    });
  }, [livePrice, lastCandleRef.current?.time]);

  useEffect(() => {
    setActiveDecision((prev) => {
      const now = Date.now();
      const expired = Boolean(prev?.expiresAt && now > prev.expiresAt);
      const mark = livePrice || lastCandleRef.current?.close || rawDecisionPlan.entry || 0;
      const invalidated = Boolean(
        prev?.direction === "LONG" && prev.invalidation && mark && mark < prev.invalidation
      ) || Boolean(
        prev?.direction === "SHORT" && prev.invalidation && mark && mark > prev.invalidation
      );

      if (rawDecisionPlan.phase === "FILTERED" || invalidated || expired) {
        const cancelled: DecisionPlan = { ...(prev || rawDecisionPlan), phase: "FILTERED", action: invalidated ? "Decision invalidated by price crossing invalidation." : expired ? "Decision expired. Waiting for a fresh trigger." : rawDecisionPlan.action, createdAt: prev?.createdAt || Date.now() };
        setDecisionHistory((history) => history[0]?.phase === "FILTERED" && history[0]?.direction === cancelled.direction ? history : [cancelled, ...history].slice(0, 50));
        console.debug("[Wolvrene] Decision filtered/invalidated", { phase: rawDecisionPlan.phase, invalidated, expired });
        return cancelled;
      }

      if (rawDecisionPlan.shouldMark && rawDecisionPlan.direction) {
        const sameDirection = prev?.direction === rawDecisionPlan.direction;
        const stronger = !prev || rawDecisionPlan.quality >= prev.quality || rawDecisionPlan.phase === "EXECUTE";
        if (!sameDirection || stronger || prev.phase === "FILTERED" || prev.phase === "NO_TRADE") {
          const next = { ...rawDecisionPlan, createdAt: prev && sameDirection ? prev.createdAt : Date.now() };
          setDecisionHistory((history) => {
            // Prevent duplicate entries by checking if the same decision already exists at the front
            const exists = history[0]?.id === next.id;
            if (exists) return history;
            console.debug("[Wolvrene] DecisionHistory appended", { id: next.id, phase: next.phase, direction: next.direction, quality: next.quality });
            return [next, ...history].slice(0, 80);
          });
          return next;
        }
        return { ...prev, phase: prev.phase === "EXECUTE" ? "MANAGE" : prev.phase, action: prev.phase === "EXECUTE" ? `Manage ${prev.direction}. Keep invalidation protected.` : prev.action };
      }

      if (prev && prev.phase !== "FILTERED" && prev.phase !== "NO_TRADE") {
        return { ...prev, phase: prev.phase === "EXECUTE" ? "MANAGE" : prev.phase };
      }

      return rawDecisionPlan;
    });
  }, [rawDecisionPlan.id, rawDecisionPlan.phase, rawDecisionPlan.quality, rawDecisionPlan.direction, rawDecisionPlan.shouldMark, livePrice, recentCandles.length, signalPlan.state, signalPlan.direction]);

  const decisionPlan = activeDecision || rawDecisionPlan;
  const autoTradeMode = useMemo<TradeMode>(() => {
    if (SCALP_TIMEFRAMES.includes(timeframe as (typeof SCALP_TIMEFRAMES)[number]) && !SWING_TIMEFRAMES.includes(timeframe as (typeof SWING_TIMEFRAMES)[number])) return "SCALP";
    if (SWING_TIMEFRAMES.includes(timeframe as (typeof SWING_TIMEFRAMES)[number]) && !SCALP_TIMEFRAMES.includes(timeframe as (typeof SCALP_TIMEFRAMES)[number])) return "SWING";
    return timeframe === "15m" ? "SCALP" : "SWING";
  }, [timeframe]);
  const activeTradeMode: TradeMode = tradeModeSelection === "AUTO" ? autoTradeMode : tradeModeSelection;
  const signalLifecycleState = useMemo(() => {
    if (decisionPlan.phase === "SPAWNED") return "SPAWN";
    if (decisionPlan.phase === "VALIDATED") return "VALIDATE";
    if (decisionPlan.phase === "EXECUTE") return "EXECUTE";
    if (decisionPlan.phase === "MANAGE") return "MANAGE";
    if (decisionPlan.phase === "EXIT") return "EXIT";
    return "WAIT";
  }, [decisionPlan.phase]);
  const signalRejectionReasons = useMemo(() => {
    const reasons: string[] = [];
    if (structureState.bias === "RANGING" || structureState.bias === "WAITING") reasons.push("No structure confirmation");
    if (triggerValidation.quality === "NONE") reasons.push("No trigger");
    if (decisionPlan.quality < decisionSettings.spawnConfidence) reasons.push("Low confidence");
    if (candlesSummary.trend === "MIXED") reasons.push("Choppy market");
    if (!(session.includes("London") || session.includes("New York"))) reasons.push("Bad session");
    if (candlesSummary.volatility === "LOW" || candlesSummary.volatility === "HIGH") reasons.push(`Volatility ${candlesSummary.volatility.toLowerCase()}`);
    if (liquidityState.bias === "WAITING") reasons.push("Liquidity not confirmed");
    const rr = decisionPlan.entry && decisionPlan.sl && decisionPlan.tp1 ? Math.abs(decisionPlan.tp1 - decisionPlan.entry) / Math.max(Math.abs(decisionPlan.entry - decisionPlan.sl), 0.0000001) : 0;
    if (rr > 0 && rr < 1.2) reasons.push("Risk/reward invalid");
    return reasons;
  }, [structureState.bias, triggerValidation.quality, decisionPlan.quality, decisionSettings.spawnConfidence, candlesSummary.trend, candlesSummary.volatility, session, liquidityState.bias, decisionPlan.entry, decisionPlan.sl, decisionPlan.tp1]);
  const triggerChecklist = useMemo(() => {
    const rr = decisionPlan.entry && decisionPlan.sl && decisionPlan.tp1
      ? Math.abs(decisionPlan.tp1 - decisionPlan.entry) / Math.max(Math.abs(decisionPlan.entry - decisionPlan.sl), 0.000001)
      : 0;
    return {
      structure: structureState.bias === "BULLISH" || structureState.bias === "BEARISH",
      liquidity: liquidityState.bias !== "WAITING",
      volume: candlesSummary.volatility !== "LOW",
      trigger: triggerValidation.quality === "VALID" || triggerValidation.quality === "STRONG" || triggerValidation.quality === "SNIPER",
      rr: rr >= 1.2,
      session: session.includes("London") || session.includes("New York"),
    };
  }, [decisionPlan.entry, decisionPlan.sl, decisionPlan.tp1, structureState.bias, liquidityState.bias, candlesSummary.volatility, triggerValidation.quality, session]);
  const entryGrade = useMemo(() => {
    const score = [
      triggerChecklist.structure,
      triggerChecklist.liquidity,
      triggerChecklist.volume,
      triggerChecklist.trigger,
      triggerChecklist.rr,
      triggerChecklist.session,
      Boolean(institutionalPrecision.precisionScore >= 70),
      Boolean(decisionPlan.direction && (structureState.bias === "BULLISH" ? decisionPlan.direction === "LONG" : structureState.bias === "BEARISH" ? decisionPlan.direction === "SHORT" : true)),
    ].filter(Boolean).length;
    if (score >= 8 && decisionPlan.quality >= 90) return "A+";
    if (score >= 7 && decisionPlan.quality >= 84) return "A";
    if (score >= 6 && decisionPlan.quality >= 74) return "B";
    if (score >= 4 && decisionPlan.quality >= 62) return "C";
    return "Reject";
  }, [triggerChecklist, institutionalPrecision.precisionScore, decisionPlan.quality, decisionPlan.direction, structureState.bias]);
  const activeExecutionTradeView = useMemo(
    () =>
      activeExecutionTrade &&
      ["OPEN", "TP1_HIT", "TP2_HIT", "RUNNER", "BREAKEVEN", "CLOSING"].includes(activeExecutionTrade.status)
        ? activeExecutionTrade
        : null,
    [activeExecutionTrade]
  );
  const brain = runUnifiedBrain({
    symbol: selectedSymbol,
    selectedMode: activeTradeMode,
    selectedTimeframe: timeframe,
    session,
    livePrice,
    activeTrade: activeExecutionTradeView
      ? {
          status: activeExecutionTradeView.status,
          side: activeExecutionTradeView.side,
          symbol: activeExecutionTradeView.symbol,
          timeframe: activeExecutionTradeView.timeframe,
          entry: activeExecutionTradeView.entry,
          sl: activeExecutionTradeView.sl,
          tp1: activeExecutionTradeView.tp1,
          tp2: activeExecutionTradeView.tp2,
          tp3: activeExecutionTradeView.tp3,
          openedAt: activeExecutionTradeView.openedAt,
        }
      : null,
    tradeMarkers,
    draftUsd,
    candlesSummary,
    structureScore: structureState.score,
    liquidityScore: liquidityState.score,
    triggerScore: triggerValidation.score,
    learningWins: learningWeights.wins,
    learningLosses: learningWeights.losses,
    signalPlan,
    decisionPlan,
  });
  const portfolioState = brain.portfolio;
  const riskFirewall = brain.riskFirewall;
  const finalDecisionEngine = brain.finalDecision;
  const adaptiveSizing = brain.adaptiveSizing;
  const brainDecision = brain.decision;
  const brainConfidence = brain.confidence;
  const strategyPerformance = useMemo(() => buildStrategyPerformance(tradeLog), [tradeLog]);
  const adaptiveWeightsLive = useMemo(() => deriveAdaptiveWeights({ performance: strategyPerformance, brain }), [strategyPerformance, brain]);
  const executionEvaluation = useMemo(
    () =>
      evaluateExecutionReadiness({
        brain,
        activeTrade: activeExecutionTrade ? { side: activeExecutionTrade.side, status: activeExecutionTrade.status } : null,
        allowScaleIn: false,
      }),
    [brain, activeExecutionTrade]
  );
  const uiMismatch =
    decisionPlan.direction !== brain.direction ||
    decisionPlan.phase !== brain.decision.phase ||
    signalPlan.confidence !== brain.confidence;
  const normalizedRadarSymbol = useMemo(() => normalizeRadarSymbol(selectedSymbol), [selectedSymbol]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const loadRadar = async () => {
      setMarketRadarLoading(true);
      try {
        const response = await fetch(
          `/api/market/intelligence?exchange=bitget&symbol=${encodeURIComponent(normalizedRadarSymbol)}&interval=${encodeURIComponent(timeframe)}&providers=true&limit=80`,
          { cache: "no-store", signal: controller.signal }
        );
        const json = await response.json();
        if (mounted && json?.state) {
          setMarketRadarIntelligence(json);
          setMarketRadarSource("shared-fetch");
        }
      } catch {
        // keep last known radar; avoid forcing DATA_UNAVAILABLE on transient fetch errors
      } finally {
        if (mounted) setMarketRadarLoading(false);
      }
    };
    loadRadar();
    const id = setInterval(loadRadar, 30000);
    return () => {
      mounted = false;
      controller.abort();
      clearInterval(id);
    };
  }, [normalizedRadarSymbol, timeframe]);
  const radarGate = useMemo(() => {
    const radarState = marketRadarLoading ? "RADAR_LOADING" : (marketRadarIntelligence?.state ?? "DATA_UNAVAILABLE");
    const radarBias = marketRadarIntelligence?.bias ?? "UNKNOWN";
    const legacySignal = decisionPlan.direction || signalPlan.direction || null;
    const directionAligned =
      !legacySignal
        ? false
        : radarBias === "BULLISH_REACTION"
        ? legacySignal === "LONG"
        : radarBias === "BEARISH_REACTION"
        ? legacySignal === "SHORT"
        : radarBias === "NEUTRAL" || radarBias === "CONFLICTED"
        ? false
        : true;
    let finalSignalMode: RadarFinalSignalMode = "LEGACY_MODE";
    let radarGateResult: "PASSED" | "BLOCKED" | "WAITING" | "LEGACY_ONLY" = "LEGACY_ONLY";
    let radarGateReason = "Radar unavailable — legacy signal only";
    let finalSignalSource: "LEGACY" | "MARKET_RADAR" | "COMBINED" = "LEGACY";
    if (radarState === "RADAR_LOADING") { finalSignalMode = "RADAR_WAIT"; radarGateResult = "WAITING"; radarGateReason = "Loading radar..."; }
    else if (radarState === "HUNT_BUILDING") { finalSignalMode = "RADAR_WAIT"; radarGateResult = "WAITING"; radarGateReason = "Blocked: Radar has not confirmed reaction"; }
    else if (radarState === "LIQUIDITY_SWEPT") { finalSignalMode = "RADAR_WAIT"; radarGateResult = "WAITING"; radarGateReason = "Waiting: liquidity swept but no reclaim yet"; }
    else if (radarState === "TRAP_POSSIBLE") { finalSignalMode = "RADAR_CONFIRMATION_REQUIRED"; radarGateResult = "WAITING"; radarGateReason = "Trap possible — confirmation required"; }
    else if (radarState === "REACTION_CONFIRMED") { finalSignalMode = "RADAR_VALIDATED"; radarGateResult = directionAligned ? "PASSED" : "BLOCKED"; radarGateReason = directionAligned ? "Passed: reaction confirmed by radar" : "Blocked: Radar bias conflicts with legacy direction"; finalSignalSource = directionAligned ? "COMBINED" : "MARKET_RADAR"; }
    else if (radarState === "TRADE_ALLOWED") { finalSignalMode = "RADAR_APPROVED"; radarGateResult = directionAligned ? "PASSED" : "BLOCKED"; radarGateReason = directionAligned ? "Passed: Radar approved with aligned direction" : "Blocked: direction/risk alignment failed"; finalSignalSource = directionAligned ? "COMBINED" : "MARKET_RADAR"; }
    else if (radarState === "NO_TRADE") { finalSignalMode = "RADAR_BLOCKED"; radarGateResult = "BLOCKED"; radarGateReason = "Blocked: Radar no-trade state"; finalSignalSource = "MARKET_RADAR"; }
    return { legacySignal, radarState, radarBias, directionAligned, finalSignalMode, radarGateResult, radarGateReason, finalSignalSource };
  }, [marketRadarIntelligence, marketRadarLoading, decisionPlan.direction, signalPlan.direction]);

  const sessionSniper = useMemo(() => getSessionSniperState(session), [session]);

  const signalFeedRows = useMemo(() => {
    const hasActiveExecution = Boolean(
      activeExecutionTrade &&
        activeExecutionTrade.symbol === selectedSymbol &&
        ["OPEN", "TP1_HIT", "TP2_HIT", "RUNNER", "BREAKEVEN", "CLOSING"].includes(activeExecutionTrade.status)
    );
    const rows = decisionHistory
      .filter((item) => item.direction)
      .map((item, index) => ({
         id: `${item.id}-${index}`,
        time: new Date(item.createdAt).toLocaleTimeString(),
        symbol: item.symbol,
        timeframe: item.timeframe,
        mode: item.mode,
        side: item.direction as "LONG" | "SHORT",
        status: hasActiveExecution && item.phase === "EXECUTE" ? "MANAGE" : item.phase,
        confidence: item.quality,
        reason: item.reason.slice(0, 90),
        radarState: radarGate.radarState,
        radarGateResult: radarGate.radarGateResult,
        finalSignalSource: radarGate.finalSignalSource,
        gateReason: radarGate.radarGateReason,
        candleTime: Number(item.markerTime || 0),
        executable: !hasActiveExecution && (item.phase === "EXECUTE" || item.phase === "VALIDATED"),
      }))
      .filter((row) => signalSubscriptionSettings.timeframes[row.timeframe] !== false)
      .filter((row) => signalSubscriptionSettings.modes[row.mode] !== false)
      .filter((row) => row.confidence >= signalSubscriptionSettings.minConfidence)
      .sort((a, b) => (a.id < b.id ? 1 : -1));

    const smartFibRows = smartFibSignals.map(sig => ({
      id: sig.id,
      time: new Date(sig.timestamp).toLocaleTimeString(),
      symbol: sig.symbol,
      timeframe: sig.timeframe,
      mode: "SMART_FIB" as const,
      side: sig.side,
      status: sig.status,
      confidence: sig.score || 0,
      reason: sig.reason,
      radarState: "SMART_FIB",
      radarGateResult: sig.type,
      finalSignalSource: "SMART_FIB",
      gateReason: sig.reason,
      candleTime: sig.timestamp,
      executable: sig.executable,
    }));

    const allRows = [...rows, ...smartFibRows];
    const dedup = allRows.filter(
      (row, idx, arr) =>
        arr.findIndex(
          (x) =>
            x.symbol === row.symbol &&
            x.timeframe === row.timeframe &&
            x.side === row.side &&
            x.status === row.status &&
            x.candleTime === row.candleTime
        ) === idx
    );
    return dedup.slice(0, signalSubscriptionSettings.maxFeedRows);
  }, [decisionHistory, selectedSymbol, timeframe, activeTradeMode, signalSubscriptionSettings, activeExecutionTrade, livePrice, recentCandles.length, signalPlan.state, signalPlan.direction, signalPlan.confidence, radarGate.radarState, radarGate.radarGateResult, radarGate.finalSignalSource, radarGate.radarGateReason, smartFibSignals]);

  useEffect(() => {
    console.debug("[RadarGate]", {
      legacySignal: radarGate.legacySignal,
      radarState: radarGate.radarState,
      radarBias: radarGate.radarBias,
      finalSignalMode: radarGate.finalSignalMode,
      radarGateReason: radarGate.radarGateReason,
    });
  }, [radarGate.legacySignal, radarGate.radarState, radarGate.radarBias, radarGate.finalSignalMode, radarGate.radarGateReason]);

  useEffect(() => {
    // Primary check: use decisionPlan as source of truth for trade creation
    const canCreateFromDecision = 
      decisionPlan.phase === "EXECUTE" &&
      decisionPlan.direction &&
      decisionPlan.entry &&
      decisionPlan.sl &&
      decisionPlan.tp1 &&
      decisionPlan.tp2 &&
      decisionPlan.tp3;
    
    // Use decisionPlan as primary source, but still respect riskFirewall via executionEvaluation
    if (!canCreateFromDecision) {
      if (executionEvaluation.canExecute === false) {
        console.debug("[Wolvrene] Trade blocked by executionEvaluation", { 
          reason: executionEvaluation.blockedReason,
          decisionPhase: decisionPlan.phase,
        });
      }
      return;
    }
    
    const side = decisionPlan.direction as "LONG" | "SHORT";
    const entry = decisionPlan.entry as number;
    const sl = decisionPlan.sl as number;
    const tp1 = decisionPlan.tp1 as number;
    const tp2 = decisionPlan.tp2 as number;
    const tp3 = decisionPlan.tp3 as number;
    const markerEventTime = Number(decisionPlan.markerTime || Math.floor(Date.now() / 1000));
    const tradeEventKey = `${selectedSymbol}-${timeframe}-${activeTradeMode}-${side}-${decisionPlan.phase}-${markerEventTime}`;
    
    const timer = window.setTimeout(() => {
      setActiveExecutionTrade((prev) => {
        // Prevent duplicate trades
        if (prev?.id === tradeEventKey) {
          console.debug("[Wolvrene] Trade already exists", { id: tradeEventKey });
          return prev;
        }
        // Prevent overwriting active trades
        if (
          prev &&
          prev.symbol === selectedSymbol &&
          (prev.status === "OPEN" ||
            prev.status === "TP1_HIT" ||
            prev.status === "TP2_HIT" ||
            prev.status === "RUNNER" ||
            prev.status === "BREAKEVEN" ||
            prev.status === "CLOSING")
        ) {
          console.debug("[Wolvrene] Active trade exists, blocking new trade", { 
            existingId: prev.id, 
            newId: tradeEventKey 
          });
          return prev;
        }
        const leverage = Math.max(1, Number(draftLeverage) || 5);
        const margin = adaptiveSizing.margin;
        const perUnitRisk = Math.max(Math.abs(entry - sl), 0.00001);
        const notional = margin * leverage;
        const riskLimitedSize = adaptiveSizing.maxRiskUsd / perUnitRisk;
        const size = Math.min(notional / Math.max(entry, 0.00001), riskLimitedSize);
        
        console.debug("[Wolvrene] ActiveExecutionTrade created", { 
          id: tradeEventKey, 
          side, 
          entry, 
          sl, 
          tp1, 
          tp2, 
          tp3,
          quality: decisionPlan.quality,
        });
        
        return {
          id: tradeEventKey,
          symbol: selectedSymbol,
          timeframe,
          mode: activeTradeMode,
          side,
          entry,
          sl,
          tp1,
          tp2,
          tp3,
          size,
          leverage,
          margin,
          confidence: decisionPlan.quality,
          reason: decisionPlan.reason,
          openedAt: Date.now(),
          status: "OPEN",
          invalidation: decisionPlan.invalidation || sl,
          tp1Hit: false,
          tp2Hit: false,
          tp3Hit: false,
          partial1Done: false,
          partial2Done: false,
          maxDrawdown: 0,
          bestExcursion: 0,
        };
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    decisionPlan.phase,
    decisionPlan.direction,
    decisionPlan.entry,
    decisionPlan.sl,
    decisionPlan.tp1,
    decisionPlan.tp2,
    decisionPlan.tp3,
    decisionPlan.quality,
    decisionPlan.reason,
    decisionPlan.invalidation,
    decisionPlan.markerTime,
    selectedSymbol,
    timeframe,
    activeTradeMode,
    draftLeverage,
    adaptiveSizing.margin,
    adaptiveSizing.maxRiskUsd,
    executionEvaluation.canExecute,
  ]);

  useEffect(() => {
    if (!activeExecutionTrade || !livePrice) return;
    const timer = window.setTimeout(() => {
      setActiveExecutionTrade((prev) => {
        if (!prev) return prev;
        if (prev.status === "CLOSED_SL" || prev.status === "CLOSED_TP" || prev.status === "INVALIDATED" || prev.status === "CLOSED_MANUAL") return prev;
        const isLong = prev.side === "LONG";
        const pnl = isLong ? livePrice - prev.entry : prev.entry - livePrice;
        const nextDrawdown = Math.min(prev.maxDrawdown, pnl);
        const nextExcursion = Math.max(prev.bestExcursion, pnl);
        const hitSL = isLong ? livePrice <= prev.sl : livePrice >= prev.sl;
        const hitInvalidation = isLong ? livePrice <= prev.invalidation : livePrice >= prev.invalidation;
        const hitTP1 = isLong ? livePrice >= prev.tp1 : livePrice <= prev.tp1;
        const hitTP2 = isLong ? livePrice >= prev.tp2 : livePrice <= prev.tp2;
        const hitTP3 = isLong ? livePrice >= prev.tp3 : livePrice <= prev.tp3;
        if (hitSL) return { ...prev, status: "CLOSED_SL", maxDrawdown: nextDrawdown, bestExcursion: nextExcursion };
        if (hitInvalidation) return { ...prev, status: "INVALIDATED", maxDrawdown: nextDrawdown, bestExcursion: nextExcursion };
        if (hitTP3) return { ...prev, status: "CLOSED_TP", tp1Hit: true, tp2Hit: true, tp3Hit: true, partial1Done: true, partial2Done: true, maxDrawdown: nextDrawdown, bestExcursion: nextExcursion };
        if (hitTP2) return { ...prev, status: "RUNNER", tp1Hit: true, tp2Hit: true, partial1Done: true, partial2Done: true, sl: prev.entry, maxDrawdown: nextDrawdown, bestExcursion: nextExcursion };
        if (hitTP1) return { ...prev, status: "BREAKEVEN", tp1Hit: true, partial1Done: true, sl: prev.entry, maxDrawdown: nextDrawdown, bestExcursion: nextExcursion };
        return { ...prev, status: prev.tp2Hit ? "RUNNER" : prev.status, maxDrawdown: nextDrawdown, bestExcursion: nextExcursion };
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeExecutionTrade, livePrice]);

  useEffect(() => {
    if (!activeExecutionTrade) return;
    const openStatuses: ExecutionTradeStatus[] = ["OPEN", "TP1_HIT", "TP2_HIT", "RUNNER", "BREAKEVEN", "CLOSING"];
    if (!openStatuses.includes(activeExecutionTrade.status)) return;
    if (activeExecutionTrade.symbol !== selectedSymbol || activeExecutionTrade.timeframe !== timeframe) return;
    const timer = window.setTimeout(() => {
      setTradeMarkers((prev) => {
        if (prev.some((item) => item.id === activeExecutionTrade.id)) return prev;
        return [
          {
            id: activeExecutionTrade.id,
            symbol: activeExecutionTrade.symbol,
            timeframe: activeExecutionTrade.timeframe,
            mode: activeExecutionTrade.mode,
            side: activeExecutionTrade.side,
            entry: activeExecutionTrade.entry,
            sl: activeExecutionTrade.sl,
            tp1: activeExecutionTrade.tp1,
            tp2: activeExecutionTrade.tp2,
            tp3: activeExecutionTrade.tp3,
            confidence: activeExecutionTrade.confidence,
            entryGrade,
            reason: activeExecutionTrade.reason,
            openedAt: toChartEpochSec(activeExecutionTrade.openedAt),
          },
          ...prev,
        ].slice(0, 50);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeExecutionTrade?.id, activeExecutionTrade?.status, selectedSymbol, timeframe, entryGrade]);

  useEffect(() => {
    if (!activeExecutionTrade) return;
    if (lastExecutionStatusRef.current === activeExecutionTrade.status) return;
    lastExecutionStatusRef.current = activeExecutionTrade.status;
    if (activeExecutionTrade.status !== "CLOSED_SL" && activeExecutionTrade.status !== "CLOSED_TP" && activeExecutionTrade.status !== "INVALIDATED" && activeExecutionTrade.status !== "CLOSED_MANUAL") return;
    const openedAtMs = normalizeEpochMs(activeExecutionTrade.openedAt);
    const closePrice = activeExecutionTrade.status === "CLOSED_SL" || activeExecutionTrade.status === "INVALIDATED" || activeExecutionTrade.status === "CLOSED_MANUAL" ? activeExecutionTrade.sl : activeExecutionTrade.tp3;
    const pnlPerUnit = activeExecutionTrade.side === "LONG" ? closePrice - activeExecutionTrade.entry : activeExecutionTrade.entry - closePrice;
    const pnl = pnlPerUnit * activeExecutionTrade.size;
    const durationMin = Math.max(0, Math.floor((Date.now() - openedAtMs) / 60000));
    addStructuredJournal({
      event: pnl >= 0 ? "TP_HIT" : "SL_HIT",
      side: activeExecutionTrade.side,
      entry: activeExecutionTrade.entry,
      exit: closePrice,
      pnl,
      roi: activeExecutionTrade.margin ? (pnl / activeExecutionTrade.margin) * 100 : 0,
      note: `${activeExecutionTrade.status} · Duration ${durationMin}m · MDD ${activeExecutionTrade.maxDrawdown.toFixed(2)} · MFE ${activeExecutionTrade.bestExcursion.toFixed(2)}`,
    });
    const timer = window.setTimeout(() => {
      const result: TradeChartMarker["result"] =
        activeExecutionTrade.status === "CLOSED_TP" ? "WIN" :
        activeExecutionTrade.status === "INVALIDATED" ? "INVALIDATED" :
        Math.abs(pnl) < Math.max(activeExecutionTrade.margin * 0.001, 0.01) ? "BE" :
        pnl > 0 ? "WIN" : "LOSS";
      const rr = Math.abs(activeExecutionTrade.tp1 - activeExecutionTrade.entry) / Math.max(Math.abs(activeExecutionTrade.entry - activeExecutionTrade.sl), 0.00001);
      const logged: LoggedTrade = {
        id: activeExecutionTrade.id,
        strategyName: brain.strategyProfile.name,
        mode: activeExecutionTrade.mode,
        timeframe: activeExecutionTrade.timeframe,
        session,
        side: activeExecutionTrade.side,
        entry: activeExecutionTrade.entry,
        sl: activeExecutionTrade.sl,
        tp1: activeExecutionTrade.tp1,
        tp2: activeExecutionTrade.tp2,
        tp3: activeExecutionTrade.tp3,
        tpHits: activeExecutionTrade.tp3Hit ? 3 : activeExecutionTrade.tp2Hit ? 2 : activeExecutionTrade.tp1Hit ? 1 : 0,
        rr: Number(rr.toFixed(2)),
        result: result === "INVALIDATED" ? "INVALIDATED" : result,
        entryGrade: brain.entryGrade,
        durationMin,
        managementActions: [brain.managementPlaybook.action],
        openedAt: openedAtMs,
        closedAt: Date.now(),
      };
      setTradeLog(appendTradeLog(logged));
      setTradeMarkers((prev) =>
        prev.map((marker) =>
          marker.id === activeExecutionTrade.id
            ? {
                ...marker,
                closedAt: Date.now(),
                result,
                pnl,
                closeReason: activeExecutionTrade.status,
              }
            : marker
        )
      );
      setLastClosedExecutionTrade(activeExecutionTrade);
      setActiveExecutionTrade(null);
      setTradeRecalcCooldownCycles(1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeExecutionTrade, brain.entryGrade, brain.managementPlaybook.action, brain.strategyProfile.name, session]);

  const managementBrain = useMemo<ManagementBrainState>(() => {
    const selected = selectedOrder;
    const mark = livePrice || lastCandleRef.current?.close || 0;
    if (!selected || !mark) return { action: "WAIT", warning: null, suggestedSL: null, protectProfit: false, reason: "No selected active position." };

    const isLong = selected.side === "LONG";
    const pnl = orderPnL(selected);
    const riskDistance = Math.max(Math.abs(selected.entry - selected.sl), selected.entry * 0.001);
    const rMultiple = riskDistance ? Math.abs(mark - selected.entry) / riskDistance : 0;
    const oppositeDecision = Boolean(decisionPlan.direction && decisionPlan.direction !== selected.side && (decisionPlan.phase === "VALIDATED" || decisionPlan.phase === "EXECUTE"));
    const weakStructure = Boolean((selected.side === "LONG" && (structureState.event === "BOS_DOWN" || structureState.event === "CHOCH_DOWN" || liquidityState.sweptHigh)) || (selected.side === "SHORT" && (structureState.event === "BOS_UP" || structureState.event === "CHOCH_UP" || liquidityState.sweptLow)));

    if (oppositeDecision || weakStructure) {
      return { action: "EARLY_EXIT", warning: "Opposite structure/decision detected. Consider reducing exposure.", suggestedSL: selected.sl, protectProfit: pnl > 0, reason: "Structure shifted against the selected position." };
    }
    if (pnl > 0 && rMultiple >= 1.0 && selected.sl !== selected.entry) {
      return { action: "PROTECT_BE", warning: null, suggestedSL: selected.entry, protectProfit: true, reason: "Trade reached 1R zone. Breakeven protection is preferred." };
    }
    if (pnl > 0 && rMultiple >= 1.8) {
      const suggestedSL = isLong ? Math.max(selected.sl, mark - riskDistance * 1.1) : Math.min(selected.sl, mark + riskDistance * 1.1);
      return { action: "TRAIL", warning: null, suggestedSL, protectProfit: true, reason: "Runner is in profit. Trail behind current structure." };
    }
    if (pnl > 0 && selected.tps.some((tp) => tp.hit)) {
      return { action: "SCALE_OUT", warning: null, suggestedSL: selected.sl, protectProfit: true, reason: "One or more TP levels hit. Scaling and protection are active." };
    }

    return { action: "HOLD", warning: null, suggestedSL: selected.sl, protectProfit: false, reason: "No exit warning. Hold according to current plan." };
  }, [selectedOrder, livePrice, decisionPlan.direction, decisionPlan.phase, structureState.event, liquidityState.sweptHigh, liquidityState.sweptLow, orders]);


  const mtfConfluence = useMemo(() => {
    const states: MTFState[] = [
      { tf: "Trigger", bias: triggerValidation.direction || "NEUTRAL", score: triggerValidation.score },
      { tf: "Signal", bias: signalPlan.direction || "NEUTRAL", score: signalPlan.confidence },
      { tf: "Institutional", bias: institutionalPrecision.preferredDirection || "NEUTRAL", score: institutionalPrecision.precisionScore },
      {
        tf: "Structure",
        bias: structureState.bias === "BULLISH" ? "LONG" : structureState.bias === "BEARISH" ? "SHORT" : "NEUTRAL",
        score: Math.min(100, structureState.score * 2),
      },
      { tf: "Master", bias: decisionPlan.direction || "NEUTRAL", score: Math.min(100, decisionPlan.quality) },
    ];

    const longScore = states.filter((s) => s.bias === "LONG").reduce((sum, s) => sum + s.score, 0);
    const shortScore = states.filter((s) => s.bias === "SHORT").reduce((sum, s) => sum + s.score, 0);

    const bias =
      longScore > shortScore * 1.15 ? "LONG" :
      shortScore > longScore * 1.15 ? "SHORT" :
      "NEUTRAL";

    const score = Math.min(100, Math.round(Math.max(longScore, shortScore) / 3));
    const conflict = Boolean(bias !== "NEUTRAL" && decisionPlan.direction && bias !== decisionPlan.direction);

    return { states, bias, score, conflict };
  }, [triggerValidation, signalPlan, institutionalPrecision, structureState, decisionPlan.direction, decisionPlan.quality]);

  const setupKey = useMemo(() => {
    const trigger = triggerValidation.quality || "NONE";
    const event = structureState.event || "NONE";
    const liq = liquidityState.bias || "BALANCED";
    return `${event}-${trigger}-${liq}`;
  }, [triggerValidation.quality, structureState.event, liquidityState.bias]);

  const learningBoost = useMemo(() => {
    return getLearningBoost(learningStats, session, selectedSymbol, setupKey);
  }, [learningStats, session, selectedSymbol, setupKey]);

  const eliteAIScore = useMemo(() => {
    const riskPenalty = candlesSummary.volatility === "HIGH" ? 30 : candlesSummary.volatility === "LOW" ? 12 : 8;
    const sniperBoost = sessionSniper.mode === "EXECUTION" ? 8 : sessionSniper.mode === "EXPANSION" ? 5 : 0;
    const base = runEliteAIScore({
      structureScore: structureState.score * 2,
      liquidityScore: liquidityState.score * 4,
      triggerScore: triggerValidation.score * 3,
      sessionScore: sessionSniper.quality,
      mtfScore: mtfConfluence.score,
      riskPenalty,
    });

    return Math.max(0, Math.min(100, base + sniperBoost + learningBoost));
  }, [candlesSummary.volatility, structureState.score, liquidityState.score, triggerValidation.score, mtfConfluence.score, sessionSniper.quality, sessionSniper.mode, learningBoost]);

  const eliteSignalAllowed = useMemo(() => {
    const exceptionalAsia = !sessionSniper.allowSignal && eliteAIScore >= 94 && triggerValidation.quality === "SNIPER";
    return Boolean(
      eliteAIScore >= PRECISION_RULES.minEliteScore &&
      decisionPlan.direction &&
      !mtfConfluence.conflict &&
      mtfConfluence.score >= PRECISION_RULES.minMtfScore &&
      (sessionSniper.allowSignal || exceptionalAsia) &&
      triggerValidation.quality !== "WEAK" &&
      triggerValidation.quality !== "NONE" &&
      decisionPlan.phase !== "FILTERED"
    );
  }, [eliteAIScore, decisionPlan.direction, decisionPlan.phase, mtfConfluence.conflict, mtfConfluence.score, sessionSniper.allowSignal, triggerValidation.quality]);

  const eliteBacktest = useMemo(() => {
    return runEliteBacktest(recentCandles.slice(-backtestRange), signalMarkers, selectedSymbol, activeTradeMode, timeframe);
  }, [recentCandles, signalMarkers, backtestRange, selectedSymbol, activeTradeMode, timeframe]);

  const realAccuracyStats = useMemo(() => buildAccuracyStats(eliteJournal), [eliteJournal]);

  const activeLiveTrade = useMemo<LiveTradeState | null>(() => {
    if (!selectedOrder || !livePrice) return null;
    return {
      active: true,
      symbol: selectedSymbol,
      timeframe,
      side: selectedOrder.side as "LONG" | "SHORT",
      entry: selectedOrder.entry,
      sl: selectedOrder.sl,
      tp: selectedOrder.tps?.[0]?.price || selectedOrder.entry,
      openedAt: Date.now(),
      score: Math.max(decisionPlan.quality || 0, eliteAIScore),
    };
  }, [selectedOrder, livePrice, selectedSymbol, timeframe, decisionPlan.quality, eliteAIScore]);

  const currentAtr = useMemo(() => {
    const sample = recentCandles.slice(-20);
    if (!sample.length) return (livePrice || 1) * 0.002;
    return sample.reduce((sum, c) => sum + Math.max(c.high - c.low, 0), 0) / sample.length;
  }, [recentCandles, livePrice]);

  const dynamicTradePlan = useMemo<DynamicTradePlan | null>(() => {
    if (!activeLiveTrade || !livePrice) return null;
    const moveBE = shouldMoveToBE(activeLiveTrade, livePrice);
    const dynamicSL = moveBE ? activeLiveTrade.entry : getTrailingSL(activeLiveTrade, livePrice, currentAtr);
    const extensionAllowed = eliteAIScore >= 90 && mtfConfluence.score >= 80 && triggerValidation.quality === "SNIPER";
    const earlyRiskCut = eliteAIScore < 55 || mtfConfluence.conflict || managementBrain.action === "EARLY_EXIT";
    const risk = Math.max(Math.abs(activeLiveTrade.entry - activeLiveTrade.sl), activeLiveTrade.entry * 0.001);

    return {
      entry: activeLiveTrade.entry,
      sl: activeLiveTrade.sl,
      tp1: activeLiveTrade.tp,
      tp2: activeLiveTrade.side === "LONG" ? activeLiveTrade.entry + risk * 2 : activeLiveTrade.entry - risk * 2,
      tp3: activeLiveTrade.side === "LONG" ? activeLiveTrade.entry + risk * 3 : activeLiveTrade.entry - risk * 3,
      dynamicSL,
      protected: moveBE,
      trailing: Math.abs(dynamicSL - activeLiveTrade.sl) > activeLiveTrade.entry * 0.00005,
      extensionAllowed,
      earlyRiskCut,
    };
  }, [activeLiveTrade, livePrice, currentAtr, eliteAIScore, mtfConfluence.score, mtfConfluence.conflict, triggerValidation.quality, managementBrain.action]);

  const liveTradeManagement = useMemo(() => {
    if (!activeLiveTrade || !livePrice || !dynamicTradePlan) {
      return { active: false, pnl: 0, minutes: 0, status: "NO ACTIVE TRADE", moveBE: false, exitWarning: false };
    }

    const pnl = getLivePnL(activeLiveTrade, livePrice);
    const minutes = Math.max(0, Math.floor((Date.now() - activeLiveTrade.openedAt) / 60000));
    const moveBE = dynamicTradePlan.protected;
    const exitWarning = dynamicTradePlan.earlyRiskCut;
    const status = exitWarning ? "EXIT WARNING" : moveBE ? "PROTECTED" : pnl > 0 ? "RUNNING" : "MONITOR";

    return { active: true, pnl, minutes, status, moveBE, exitWarning };
  }, [activeLiveTrade, livePrice, dynamicTradePlan]);

  const eliteAnalytics = useMemo(() => {
    const total = signalMarkers.length;
    const avgScore = total ? Math.round(signalMarkers.reduce((sum, s) => sum + s.confidence, 0) / total) : 0;
    const longCount = signalMarkers.filter((s) => s.direction === "LONG").length;
    const shortCount = signalMarkers.filter((s) => s.direction === "SHORT").length;

    return {
      totalSignals: total,
      avgScore,
      longCount,
      shortCount,
      journalTrades: eliteJournal.length,
      openTrades: eliteJournal.filter((j) => j.result === "OPEN").length,
      wins: realAccuracyStats.wins,
      losses: realAccuracyStats.losses,
      winRate: realAccuracyStats.winRate,
      bestSymbol: realAccuracyStats.bestSymbol,
      bestTimeframe: realAccuracyStats.bestTimeframe,
      bestSession: realAccuracyStats.bestSession,
      noiseWarning: realAccuracyStats.noiseWarning,
      learningTotal: learningStats.total,
      learningWins: learningStats.wins,
      learningLosses: learningStats.losses,
    };
  }, [signalMarkers, eliteJournal, realAccuracyStats, learningStats]);

  const visualIntelligence = useMemo(() => {
    const sample = recentCandles.slice(-120);
    const markers: VisualIntelligenceMarker[] = [];
    const zones: VisualLiquidityZone[] = [];

    if (sample.length < 12) {
      return {
        markers,
        zones,
        summary: "Visual engine waiting for enough candles.",
        currentStructure: "WAITING" as StructureBias,
        lastDecisionAction: "WAIT" as "ENTER NOW" | "WAIT RETEST" | "EXIT EARLY" | "FILTERED" | "MANAGE RUNNER" | "WAIT",
      };
    }

    const highs: { index: number; price: number; time: number }[] = [];
    const lows: { index: number; price: number; time: number }[] = [];

    for (let i = 2; i < sample.length - 2; i++) {
      const c = sample[i];
      const left = sample.slice(i - 2, i);
      const right = sample.slice(i + 1, i + 3);
      if (left.every((x) => c.high >= x.high) && right.every((x) => c.high >= x.high)) highs.push({ index: i, price: c.high, time: c.time as number });
      if (left.every((x) => c.low <= x.low) && right.every((x) => c.low <= x.low)) lows.push({ index: i, price: c.low, time: c.time as number });
    }

    highs.slice(-5).forEach((h, idx, arr) => {
      const prev = arr[idx - 1];
      const label = prev ? (h.price > prev.price ? "HH" : "LH") : "H";
      markers.push({ id: `vh-${h.time}-${label}`, kind: "STRUCTURE", label, time: h.time, price: h.price, direction: label === "HH" ? "LONG" : "SHORT", strength: 55 });
    });

    lows.slice(-5).forEach((l, idx, arr) => {
      const prev = arr[idx - 1];
      const label = prev ? (l.price > prev.price ? "HL" : "LL") : "L";
      markers.push({ id: `vl-${l.time}-${label}`, kind: "STRUCTURE", label, time: l.time, price: l.price, direction: label === "HL" ? "LONG" : "SHORT", strength: 55 });
    });

    const last = sample[sample.length - 1];
    const prev = sample[sample.length - 2];
    const lastHigh = highs[highs.length - 1];
    const lastLow = lows[lows.length - 1];
    const prevHigh = highs[highs.length - 2];
    const prevLow = lows[lows.length - 2];
    const avgRange = sample.slice(-20).reduce((sum, c) => sum + Math.max(c.high - c.low, 0), 0) / 20;
    const buffer = Math.max(avgRange * 0.16, last.close * 0.00035);

    if (lastHigh) zones.push({ id: `buy-${lastHigh.time}`, label: "Liquidity High", side: "BUY_SIDE", price: lastHigh.price, time: lastHigh.time, active: true });
    if (lastLow) zones.push({ id: `sell-${lastLow.time}`, label: "Liquidity Low", side: "SELL_SIDE", price: lastLow.price, time: lastLow.time, active: true });

    const bullishStructure = Boolean(lastHigh && prevHigh && lastLow && prevLow && lastHigh.price > prevHigh.price && lastLow.price > prevLow.price);
    const bearishStructure = Boolean(lastHigh && prevHigh && lastLow && prevLow && lastHigh.price < prevHigh.price && lastLow.price < prevLow.price);
    const currentStructure: StructureBias = bullishStructure ? "BULLISH" : bearishStructure ? "BEARISH" : "RANGING";

    const bosUp = Boolean(lastHigh && last.close > lastHigh.price + buffer && prev.close <= lastHigh.price + buffer);
    const bosDown = Boolean(lastLow && last.close < lastLow.price - buffer && prev.close >= lastLow.price - buffer);
    const chochUp = Boolean(bosUp && bearishStructure);
    const chochDown = Boolean(bosDown && bullishStructure);
    const sweepHigh = Boolean(lastHigh && last.high > lastHigh.price + buffer && last.close < lastHigh.price);
    const sweepLow = Boolean(lastLow && last.low < lastLow.price - buffer && last.close > lastLow.price);

    if (bosUp || chochUp) markers.push({ id: `bos-up-${last.time}`, kind: chochUp ? "CHOCH" : "BOS", label: chochUp ? "CHoCH ↑" : "BOS ↑", time: last.time as number, price: last.high, direction: "LONG", strength: chochUp ? 80 : 72 });
    if (bosDown || chochDown) markers.push({ id: `bos-dn-${last.time}`, kind: chochDown ? "CHOCH" : "BOS", label: chochDown ? "CHoCH ↓" : "BOS ↓", time: last.time as number, price: last.low, direction: "SHORT", strength: chochDown ? 80 : 72 });
    if (sweepHigh) markers.push({ id: `sweep-h-${last.time}`, kind: "SWEEP", label: "Sweep High / Trap", time: last.time as number, price: last.high, direction: "SHORT", strength: 78 });
    if (sweepLow) markers.push({ id: `sweep-l-${last.time}`, kind: "SWEEP", label: "Sweep Low / Trap", time: last.time as number, price: last.low, direction: "LONG", strength: 78 });

    if (triggerValidation.reclaim) markers.push({ id: `tr-reclaim-${last.time}`, kind: "TRIGGER", label: "Reclaim", time: last.time as number, price: last.close, direction: triggerValidation.direction, strength: triggerValidation.score });
    if (triggerValidation.rejection) markers.push({ id: `tr-reject-${last.time}`, kind: "TRIGGER", label: "Rejection", time: last.time as number, price: last.close, direction: triggerValidation.direction, strength: triggerValidation.score });
    if (triggerValidation.fakeout) markers.push({ id: `tr-fake-${last.time}`, kind: "TRIGGER", label: "Fakeout", time: last.time as number, price: last.close, direction: triggerValidation.direction, strength: triggerValidation.score });
    if (triggerValidation.breakout) markers.push({ id: `tr-break-${last.time}`, kind: "TRIGGER", label: "Breakout Confirmed", time: last.time as number, price: last.close, direction: triggerValidation.direction, strength: triggerValidation.score });

    const lastDecisionAction =
      decisionPlan.phase === "EXECUTE" ? "ENTER NOW" :
      decisionPlan.phase === "VALIDATED" ? "WAIT RETEST" :
      decisionPlan.phase === "FILTERED" ? "FILTERED" :
      managementBrain.action === "EARLY_EXIT" ? "EXIT EARLY" :
      managementBrain.action === "TRAIL" || managementBrain.action === "SCALE_OUT" || managementBrain.action === "PROTECT_BE" ? "MANAGE RUNNER" :
      "WAIT";

    if (decisionPlan.direction && decisionPlan.markerTime && decisionPlan.entry && (decisionPlan.phase === "EXECUTE" || decisionPlan.phase === "VALIDATED" || decisionPlan.phase === "FILTERED")) {
      markers.push({ id: `decision-${decisionPlan.id}`, kind: "DECISION", label: lastDecisionAction, time: decisionPlan.markerTime, price: decisionPlan.entry, direction: decisionPlan.direction, strength: decisionPlan.quality });
    }

    return {
      markers: markers
        .filter((marker) => marker.kind === "DECISION" || marker.kind === "BOS" || marker.kind === "CHOCH" || marker.kind === "SWEEP")
        .filter((marker) => marker.kind !== "DECISION" || marker.strength >= PRECISION_RULES.minWatchQuality)
        .slice(-PRECISION_RULES.maxVisibleDecisionMarkers),
      zones: zones
        .filter((zone) => Math.abs(last.close - zone.price) <= avgRange * 4.5)
        .slice(-2),
      summary: `${currentStructure} path · Institutional ${institutionalPrecision.institutionalGrade} ${institutionalPrecision.precisionScore}% · ${markers.filter((m) => m.kind !== "STRUCTURE").slice(-3).map((m) => m.label).join(" / ") || "waiting"}`,
      currentStructure,
      lastDecisionAction,
    };
  }, [recentCandles, triggerValidation, decisionPlan.id, decisionPlan.phase, decisionPlan.direction, decisionPlan.markerTime, decisionPlan.entry, decisionPlan.quality, managementBrain.action, institutionalPrecision.institutionalGrade, institutionalPrecision.precisionScore]);



  const v23EliteEngine = useMemo(() => {
    const sample = recentCandles.slice(-120);
    const mark = livePrice || lastCandleRef.current?.close || decisionPlan.entry || 0;
    const last = sample[sample.length - 1];
    const avgRange = sample.length >= 20 ? sample.slice(-20).reduce((sum, c) => sum + Math.max(c.high - c.low, 0), 0) / 20 : mark * 0.002;
    const distanceToBuySide = liquidityState.buySideLevel && mark ? Math.abs(mark - liquidityState.buySideLevel) / Math.max(avgRange, mark * 0.0001) : 99;
    const distanceToSellSide = liquidityState.sellSideLevel && mark ? Math.abs(mark - liquidityState.sellSideLevel) / Math.max(avgRange, mark * 0.0001) : 99;
    const nearLiquidity = Math.min(distanceToBuySide, distanceToSellSide) <= 1.8;
    const sessionSniperScore = session.includes("New York") ? 26 : session.includes("London") ? 22 : session.includes("Asia") ? 12 : 6;
    const triggerSynced = Boolean(
      decisionPlan.direction &&
      (
        triggerValidation.direction === decisionPlan.direction ||
        liquidityState.trapDirection === decisionPlan.direction ||
        triggerValidation.quality === "SNIPER" ||
        (decisionPlan.direction === "LONG" && (structureState.event === "BOS_UP" || structureState.event === "CHOCH_UP" || structureState.event === "SWEEP_LOW")) ||
        (decisionPlan.direction === "SHORT" && (structureState.event === "BOS_DOWN" || structureState.event === "CHOCH_DOWN" || structureState.event === "SWEEP_HIGH"))
      )
    );
    const triggerSyncStatus = triggerSynced ? "SYNCED" : decisionPlan.phase === "VALIDATED" ? "WAIT TRIGGER" : "DESYNC";
    const sniperScore = Math.max(0, Math.min(100,
      Math.round(
        institutionalPrecision.precisionScore * 0.42 +
        decisionPlan.quality * 0.34 +
        sessionSniperScore +
        (nearLiquidity ? 8 : -4) +
        (triggerSynced ? 10 : -12) +
        (triggerValidation.quality === "SNIPER" ? 8 : triggerValidation.quality === "STRONG" ? 5 : triggerValidation.quality === "VALID" ? 2 : -8)
      )
    ));
    const sniperGrade = sniperScore >= 96 ? "S+" : sniperScore >= 92 ? "S" : sniperScore >= 86 ? "A+" : sniperScore >= 78 ? "A" : "WAIT";
    const sniperAllowed = Boolean(
      decisionPlan.direction &&
      decisionPlan.phase === "EXECUTE" &&
      institutionalPrecision.eliteAllowed &&
      triggerSynced &&
      sniperScore >= 92 &&
      !institutionalPrecision.hardConflict
    );
    const markerOffsets = visualIntelligence.markers.reduce<Record<string, { x: number; y: number }>>((acc, marker, index) => {
      const stack = index % 5;
      const side = marker.direction === "LONG" ? 1 : -1;
      acc[marker.id] = { x: (index % 3) * 14 - 14, y: side * (18 + stack * 14) };
      return acc;
    }, {});
    const heatZones = [
      liquidityState.buySideLevel ? { id: "v23-buy-heat", label: "Buy-side reaction heat", price: liquidityState.buySideLevel, side: "SHORT" as SignalDirection, probability: Math.max(35, Math.min(92, 48 + (liquidityState.sweptHigh ? 24 : 0) + (decisionPlan.direction === "SHORT" ? 12 : 0) + (nearLiquidity ? 8 : 0))) } : null,
      liquidityState.sellSideLevel ? { id: "v23-sell-heat", label: "Sell-side reaction heat", price: liquidityState.sellSideLevel, side: "LONG" as SignalDirection, probability: Math.max(35, Math.min(92, 48 + (liquidityState.sweptLow ? 24 : 0) + (decisionPlan.direction === "LONG" ? 12 : 0) + (nearLiquidity ? 8 : 0))) } : null,
      decisionPlan.entry ? { id: "v23-entry-heat", label: "Decision entry probability", price: decisionPlan.entry, side: decisionPlan.direction, probability: sniperScore } : null,
    ].filter(Boolean) as { id: string; label: string; price: number; side: SignalDirection; probability: number }[];
    const closedOutcomes = structuredJournal.filter((entry) => typeof entry.pnl === "number" && (entry.event === "TP_HIT" || entry.event === "SL_HIT" || entry.event === "PARTIAL_CLOSE"));
    let winStreak = 0;
    for (const entry of closedOutcomes) {
      if ((entry.pnl || 0) > 0) winStreak += 1;
      else break;
    }
    const summary = `Elite ${sniperGrade} · Sniper ${sniperScore}% · Trigger ${triggerSyncStatus} · Session ${sessionSniperScore}`;
    return { sniperScore, sniperGrade, sniperAllowed, triggerSynced, triggerSyncStatus, sessionSniperScore, markerOffsets, heatZones, winStreak, summary };
  }, [recentCandles, livePrice, decisionPlan.entry, decisionPlan.direction, decisionPlan.phase, decisionPlan.quality, institutionalPrecision.precisionScore, institutionalPrecision.eliteAllowed, institutionalPrecision.hardConflict, triggerValidation.direction, triggerValidation.quality, liquidityState.trapDirection, liquidityState.buySideLevel, liquidityState.sellSideLevel, liquidityState.sweptHigh, liquidityState.sweptLow, structureState.event, session, visualIntelligence.markers, structuredJournal]);


  const v25FinalBrain = useMemo(() => {
    const decisionDirection = decisionPlan.direction;
    const institutionalDirection = institutionalPrecision.preferredDirection;
    const triggerDirection = triggerValidation.direction;
    const liquidityDirection = liquidityState.trapDirection;
    const signalDirection = signalPlan.direction;

    const votes = [decisionDirection, institutionalDirection, triggerDirection, liquidityDirection, signalDirection]
      .filter(Boolean) as Exclude<SignalDirection, null>[];

    const longVotes = votes.filter((v) => v === "LONG").length;
    const shortVotes = votes.filter((v) => v === "SHORT").length;

    const finalDirection: SignalDirection =
      institutionalPrecision.hardConflict
        ? null
        : decisionDirection || (longVotes > shortVotes ? "LONG" : shortVotes > longVotes ? "SHORT" : institutionalDirection || triggerDirection || liquidityDirection || signalDirection);

    const triggerAligned = Boolean(
      finalDirection &&
      (
        triggerDirection === finalDirection ||
        liquidityDirection === finalDirection ||
        triggerValidation.quality === "SNIPER" ||
        (finalDirection === "LONG" && (structureState.event === "BOS_UP" || structureState.event === "CHOCH_UP" || structureState.event === "SWEEP_LOW")) ||
        (finalDirection === "SHORT" && (structureState.event === "BOS_DOWN" || structureState.event === "CHOCH_DOWN" || structureState.event === "SWEEP_HIGH"))
      )
    );

    const structureAligned = Boolean(
      finalDirection &&
      (
        (finalDirection === "LONG" && structureState.bias !== "BEARISH") ||
        (finalDirection === "SHORT" && structureState.bias !== "BULLISH")
      )
    );

    const masterScore = Math.max(0, Math.min(100, Math.round(
      decisionPlan.quality * 0.26 +
      institutionalPrecision.precisionScore * 0.22 +
      v23EliteEngine.sniperScore * 0.18 +
      signalPlan.confidence * 0.14 +
      triggerValidation.score * 0.12 +
      (triggerAligned ? 7 : -18) +
      (structureAligned ? 8 : -22) +
      (triggerValidation.quality === "WEAK" ? -10 : triggerValidation.quality === "NONE" ? -18 : triggerValidation.quality === "SNIPER" ? 8 : 0)
    )));

    const masterGrade =
      institutionalPrecision.hardConflict || !finalDirection ? "REJECT" :
      masterScore >= 96 ? "S+" :
      masterScore >= 92 ? "S" :
      masterScore >= 86 ? "A+" :
      masterScore >= 78 ? "A" :
      masterScore >= 68 ? "WATCH" :
      "WAIT";

    const phase =
      institutionalPrecision.hardConflict || decisionPlan.phase === "FILTERED"
        ? "FILTERED"
        : managementBrain.action === "EARLY_EXIT"
        ? "EXIT"
        : decisionPlan.phase === "EXECUTE" && v23EliteEngine.sniperAllowed && triggerAligned
        ? "TRIGGERED"
        : decisionPlan.phase === "EXECUTE"
        ? "ACTIVE"
        : decisionPlan.phase === "VALIDATED"
        ? "ARMED"
        : decisionPlan.phase === "SPAWNED"
        ? "SCAN"
        : "WAIT";

    const action =
      phase === "TRIGGERED" ? "ENTER NOW" :
      phase === "ACTIVE" ? "ACTIVE TRADE" :
      phase === "ARMED" ? "WAIT RETEST" :
      phase === "EXIT" ? "EXIT EARLY" :
      phase === "FILTERED" ? "FILTERED" :
      phase === "SCAN" ? "PRE-SIGNAL" :
      "WAIT";

    const consoleState =
      action === "ENTER NOW"
        ? `ENTER ${finalDirection}`
        : action === "ACTIVE TRADE"
        ? `ACTIVE ${finalDirection}`
        : action === "WAIT RETEST"
        ? `WAIT RETEST ${finalDirection || ""}`.trim()
        : action === "PRE-SIGNAL"
        ? `ARMING ${finalDirection || ""}`.trim()
        : action;

    const syncedReason = institutionalPrecision.hardConflict
      ? "Master Brain locked the signal because the lower engines disagree."
      : `${action} · ${finalDirection || "WAIT"} · master ${masterScore}% ${masterGrade} · trigger ${triggerAligned ? "SYNCED" : "WAIT"} · structure ${structureAligned ? "OK" : "BLOCK"}`;

    const activeTrade = orders.some((order) => order.status !== "CLOSED");
    const hasRealSignal = action === "ENTER NOW" || decisionPlan.phase === "EXECUTE";
    const selectedActiveOrder = orders.find((order) => order.status !== "CLOSED") || null;

    // v37: never show fake Entry/SL/TP unless there is a true EXECUTE signal or open trade.
    const displayEntry = activeTrade ? selectedActiveOrder?.entry ?? null : hasRealSignal ? (decisionPlan.entry || signalPlan.entry) : null;
    const displaySL = activeTrade ? selectedActiveOrder?.sl ?? null : hasRealSignal ? (decisionPlan.sl || signalPlan.sl) : null;
    const displayTP1 = activeTrade ? selectedActiveOrder?.tps?.[0]?.price ?? null : hasRealSignal ? (decisionPlan.tp1 || signalPlan.tp1) : null;
    const displayTP2 = activeTrade ? selectedActiveOrder?.tps?.[1]?.price ?? null : hasRealSignal ? (decisionPlan.tp2 || signalPlan.tp2) : null;
    const displayTP3 = activeTrade ? selectedActiveOrder?.tps?.[2]?.price ?? null : hasRealSignal ? (decisionPlan.tp3 || signalPlan.tp3) : null;

    const tpHitCount = orders.reduce((sum, order) => sum + order.tps.filter((tp) => tp.hit).length, 0);
    const activeTradeState =
      activeTrade && managementBrain.action === "EARLY_EXIT" ? "EXIT WATCH" :
      activeTrade && (managementBrain.action === "TRAIL" || managementBrain.action === "SCALE_OUT" || managementBrain.action === "PROTECT_BE") ? "MANAGE RUNNER" :
      activeTrade ? "ACTIVE POSITION" :
      action === "ENTER NOW" ? "READY TO ENTER" :
      action === "WAIT RETEST" ? "ARMED WAITING" :
      action === "FILTERED" ? "FILTERED" :
      "SCANNING";

    const cleanConfidence = Math.max(0, Math.min(99, masterScore));

    const displayDirection = finalDirection || (action === "FILTERED" ? null : null);
    const displayBias =
      finalDirection === "LONG" ? "LONG" :
      finalDirection === "SHORT" ? "SHORT" :
      action === "WAIT RETEST" ? "WAIT" :
      action === "FILTERED" ? "FILTERED" :
      "WAIT";

    const displayConsoleState =
      action === "ENTER NOW" ? `ENTER ${finalDirection || ""}`.trim() :
      action === "ACTIVE TRADE" ? `ACTIVE ${finalDirection || ""}`.trim() :
      action === "WAIT RETEST" && finalDirection ? `WAIT ${finalDirection}` :
      action === "PRE-SIGNAL" && finalDirection ? `ARMING ${finalDirection}` :
      action === "FILTERED" ? "FILTERED" :
      finalDirection ? `WATCH ${finalDirection}` :
      "WAIT";

    const entryQuality =
      cleanConfidence >= 92 && triggerAligned && structureAligned ? "SNIPER" :
      cleanConfidence >= 82 && structureAligned ? "A-GRADE" :
      cleanConfidence >= 68 ? "STANDARD" :
      "WEAK";

    return {
      finalDirection,
      displayDirection,
      displayBias,
      displayConsoleState,
      entryQuality,
      longVotes,
      shortVotes,
      masterScore: cleanConfidence,
      masterGrade,
      activeTrade,
      tpHitCount,
      activeTradeState,
      phase,
      action,
      consoleState: displayConsoleState,
      triggerAligned,
      structureAligned,
      reason: syncedReason,
      entry: displayEntry,
      sl: displaySL,
      tp1: displayTP1,
      tp2: displayTP2,
      tp3: displayTP3,
      risk: decisionPlan.risk || signalPlan.risk,
      confidence: Math.max(signalPlan.confidence, cleanConfidence),
      stateColorClass: action === "FILTERED" ? "text-gray-400" : finalDirection === "LONG" ? "text-green-400" : finalDirection === "SHORT" ? "text-red-400" : "text-yellow-400",
      barColorClass: finalDirection === "LONG" ? "bg-green-500" : finalDirection === "SHORT" ? "bg-red-500" : "bg-yellow-500",
      directionColorClass: displayBias === "LONG" ? "font-bold text-green-400" : displayBias === "SHORT" ? "font-bold text-red-400" : displayBias === "FILTERED" ? "font-bold text-gray-400" : "font-bold text-yellow-400",
      summary: `Master ${masterGrade} · ${action} · ${finalDirection || "WAIT"} · ${masterScore}% · votes L:${longVotes}/S:${shortVotes}`,
    };
  }, [decisionPlan, institutionalPrecision, triggerValidation.direction, triggerValidation.quality, triggerValidation.score, liquidityState.trapDirection, structureState.event, structureState.bias, signalPlan, v23EliteEngine.sniperScore, v23EliteEngine.sniperAllowed, managementBrain.action, orders]);

  const sharedBrainState = useMemo(() => ({
    symbol: selectedSymbol,
    exchange: "bitget",
    timeframe,
    livePrice: livePrice ?? null,
    lastClosedCandle: recentCandles.at(-2) ?? null,
    currentCandle: recentCandles.at(-1) ?? null,
    session,
    radarState: radarGate.radarState,
    radarBias: radarGate.radarBias,
    radarConfidence: marketRadarIntelligence?.confidence ?? null,
    radarGateResult: radarGate.radarGateResult,
    radarBlockReason: radarGate.radarGateReason,
    legacyDirection: decisionPlan.direction ?? null,
    chartSignalDirection: signalPlan.direction ?? null,
    preSignalDirection: signalPlan.direction ?? null,
    sniperState: sessionSniper.mode,
    sniperQuality: sessionSniper.quality,
    finalDecision: radarGate.radarGateResult === "PASSED" ? "APPROVED" : "WAIT",
    finalSignalMode: radarGate.finalSignalMode,
    finalDirection: radarGate.directionAligned ? (decisionPlan.direction ?? signalPlan.direction ?? null) : null,
    signalSource: radarGate.finalSignalSource,
    executable: radarGate.radarGateResult === "PASSED",
    entry: v25FinalBrain.entry ?? null,
    sl: v25FinalBrain.sl ?? null,
    tp1: v25FinalBrain.tp1 ?? null,
    tp2: v25FinalBrain.tp2 ?? null,
    tp3: v25FinalBrain.tp3 ?? null,
    riskState: v25FinalBrain.risk,
    reason: radarGate.radarGateReason,
    stale: marketRadarIntelligence?.stale ?? true,
    loading: marketRadarLoading,
    aiContextReady: Boolean(marketRadarIntelligence),
  }), [selectedSymbol, timeframe, livePrice, recentCandles, session, radarGate, marketRadarIntelligence, decisionPlan.direction, signalPlan.direction, sessionSniper.mode, sessionSniper.quality, v25FinalBrain.entry, v25FinalBrain.sl, v25FinalBrain.tp1, v25FinalBrain.tp2, v25FinalBrain.tp3, v25FinalBrain.risk]);

  const activeTradeLifecycle = useMemo(() => {
    if (!activeExecutionTradeView) {
      return { activeTradeId: null, source: "NONE", status: "NONE", side: null, entry: null, markPrice: livePrice ?? null, size: null, initialSize: null, remainingSize: null, pnl: null, roe: null, initialSL: null, currentSL: null, tp1: null, tp2: null, tp3: null, tpHits: { tp1: false, tp2: false, tp3: false }, movedToBE: false, currentAction: "WAIT", managedStatus: null, closeReason: null, createdAt: null, updatedAt: Date.now(), timeInTrade: null, finalSignalMode: radarGate.finalSignalMode, radarState: radarGate.radarState, radarBias: radarGate.radarBias, radarGateResult: radarGate.radarGateResult, radarBlockReason: radarGate.radarGateReason, sniperState: sessionSniper.mode, postConfirmationStatus: null };
    }
    const markPrice = livePrice ?? activeExecutionTradeView.entry;
    const pnl = (activeExecutionTradeView.side === "LONG" ? markPrice - activeExecutionTradeView.entry : activeExecutionTradeView.entry - markPrice) * activeExecutionTradeView.size;
    return { activeTradeId: activeExecutionTradeView.id, source: radarGate.finalSignalMode === "RADAR_APPROVED" ? "RADAR_APPROVED" : "LEGACY", status: activeExecutionTradeView.status, side: activeExecutionTradeView.side, entry: activeExecutionTradeView.entry, markPrice, size: activeExecutionTradeView.size, initialSize: activeExecutionTradeView.size, remainingSize: activeExecutionTradeView.size, pnl, roe: activeExecutionTradeView.margin > 0 ? (pnl / activeExecutionTradeView.margin) * 100 : null, initialSL: activeExecutionTradeView.sl, currentSL: activeExecutionTradeView.sl, tp1: activeExecutionTradeView.tp1, tp2: activeExecutionTradeView.tp2, tp3: activeExecutionTradeView.tp3, tpHits: { tp1: ["TP1_HIT", "TP2_HIT", "RUNNER", "CLOSED"].includes(activeExecutionTradeView.status), tp2: ["TP2_HIT", "RUNNER", "CLOSED"].includes(activeExecutionTradeView.status), tp3: ["CLOSED"].includes(activeExecutionTradeView.status) }, movedToBE: activeExecutionTradeView.status === "BREAKEVEN", currentAction: brain.managementPlaybook.action, managedStatus: activeExecutionTradeView.status, closeReason: "closeReason" in activeExecutionTradeView ? (activeExecutionTradeView as { closeReason?: string | null }).closeReason ?? null : null, createdAt: activeExecutionTradeView.openedAt, updatedAt: Date.now(), timeInTrade: Math.max(0, Math.floor((Date.now() - activeExecutionTradeView.openedAt) / 60000)), finalSignalMode: radarGate.finalSignalMode, radarState: radarGate.radarState, radarBias: radarGate.radarBias, radarGateResult: radarGate.radarGateResult, radarBlockReason: radarGate.radarGateReason, sniperState: sessionSniper.mode, postConfirmationStatus: radarGate.finalSignalMode === "RADAR_VALIDATED" ? "REQUIRED" : null };
  }, [activeExecutionTradeView, livePrice, radarGate, sessionSniper.mode, brain.managementPlaybook.action]);


  const confidence = signalPlan.confidence;
  const executionPrice = Number(draftPrice) || livePrice || lastCandleRef.current?.close || 0;
  const executionUsd = Math.max(0, Number(draftUsd) || 0);
  const executionLeverage = clampLeverage(Number(draftLeverage));
  const executionSize = calcBaseSizeFromUsd(executionUsd, executionPrice);
  const estimatedNotional = executionUsd;
  const estimatedMargin = executionLeverage ? executionUsd / executionLeverage : 0;

  useEffect(() => {
    timeframeRef.current = timeframe;
    selectedSymbolRef.current = selectedSymbol;
  }, [timeframe, selectedSymbol]);

  useEffect(() => {
    if (!hydrated) return;
    storageSet<WolvreneUserPrefs>(userPrefsKey(), {
      selectedSymbol, timeframe, marginMode, orderType, orderSide,
      draftPrice, draftUsd, draftLeverage, terminalTab, hideUI, smartFibEnabled,
    });
  }, [hydrated, selectedSymbol, timeframe, marginMode, orderType, orderSide, draftPrice, draftUsd, draftLeverage, terminalTab, hideUI, smartFibEnabled]);

  useEffect(() => {
    if (!executionPrice || !executionUsd) return;
    const timer = window.setTimeout(() => {
      setDraftSize(executionSize ? executionSize.toFixed(6) : "0");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [executionPrice, executionUsd, executionSize]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLivePrice(null);
      setSignalMarkers([]);
      setRecentCandles([]);
    }, 0);
    lastCandleRef.current = null;
    candleSeriesRef.current?.setData([]);
    smartSignalRef.current = null;
    visualSignalKeyRef.current = "";
    lastDiscordSignalKeyRef.current = "";
    reloadCandles();
    getMarketStats();
    return () => window.clearTimeout(timer);
  }, [selectedSymbol]);

  useEffect(() => {
  ordersRef.current = orders;
  if (!hydrated) return;
  saveJson("wolvreneOrdersV15", orders);
  }, [orders, hydrated]);
  useEffect(() => {
  alertsRef.current = alerts;
  if (!hydrated) return;
  saveJson("wolvreneAlertsV15", alerts);
  }, [alerts, hydrated]);

  useEffect(() => {
  if (!hydrated) return;
  saveJson("wolvreneChartSettings", settings);
  }, [settings, hydrated]);

useEffect(() => {
  if (!hydrated) return;
  saveJson("wolvreneStructuredJournalV1", structuredJournal);
}, [structuredJournal, hydrated]);

useEffect(() => {
  if (!hydrated) return;
  saveJson("wolvreneLearningWeightsV1", learningWeights);
}, [learningWeights, hydrated]);

useEffect(() => {
  if (!hydrated) return;
  saveJson("wolvreneTradeManagerSettingsV1", tradeManagerSettings);
}, [tradeManagerSettings, hydrated]);

useEffect(() => {
  if (!hydrated) return;
  saveJson("wolvreneExternalAlertSettingsV1", externalAlertSettings);
}, [externalAlertSettings, hydrated]);

useEffect(() => {
  if (!hydrated) return;
  saveJson("wolvreneDecisionSettingsV1", decisionSettings);
}, [decisionSettings, hydrated]);

useEffect(() => {
  if (!hydrated) return;
  saveJson("wolvreneDecisionHistoryV1", decisionHistory);
}, [decisionHistory, hydrated]);

useEffect(() => {
  if (!hydrated) return;
  saveJson("wolvreneSignalSubscriptionSettingsV1", signalSubscriptionSettings);
}, [signalSubscriptionSettings, hydrated]);

useEffect(() => {
  storageSet(activeExecutionTradeKey(), activeExecutionTrade);
}, [activeExecutionTrade]);

  useEffect(() => {
    if (!livePrice || (draftPrice && orderType !== "market")) return;
    const timer = window.setTimeout(() => {
      setDraftPrice(livePrice.toFixed(2));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [livePrice, draftPrice, orderType]);

  function beep() {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.value = 0.08;

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.18);
    } catch {}
  }

  function addJournal(note: string) {
    setJournalEntries((prev) => {
      const updated = [{ id: Date.now(), time: new Date().toLocaleString(), note }, ...prev].slice(0, 50);
      saveJson("wolvreneJournal", updated);
      return updated;
    });
  }

  function addStructuredJournal(entry: Omit<StructuredJournalEntry, "id" | "time" | "symbol" | "timeframe" | "session" | "confidence"> & { confidence?: number }) {
    const row: StructuredJournalEntry = { id: Date.now() + Math.floor(Math.random() * 999), time: new Date().toLocaleString(), symbol: selectedSymbol, timeframe, session, confidence, ...entry };
    setStructuredJournal((prev) => [row, ...prev].slice(0, 500));
  }

  function updateLearningFromOutcome(pnl: number, side?: Direction) {
    const delta = pnl > 0 ? 0.4 : -0.35;
    const clamp = (value: number) => Math.max(-8, Math.min(8, value));
    setLearningWeights((prev) => ({ wins: prev.wins + (pnl > 0 ? 1 : 0), losses: prev.losses + (pnl <= 0 ? 1 : 0), session: { ...prev.session, [session]: clamp((prev.session[session] || 0) + delta) }, timeframe: { ...prev.timeframe, [timeframe]: clamp((prev.timeframe[timeframe] || 0) + delta) }, bias: side ? { ...prev.bias, [side]: clamp((prev.bias[side] || 0) + delta) } : prev.bias }));
  }

  function buildCompactDiscordSignal(label = "WOLVRENE SIGNAL") {
    const mark = livePrice || lastCandleRef.current?.close || signalPlan.entry || 0;
    const direction = v25FinalBrain.finalDirection || decisionPlan.direction || signalPlan.direction || "WAIT";
    const status = v25FinalBrain.consoleState;
    const planLine = decisionPlan.action || (status.toString().includes("WATCH") ? "Wait confirmation. No forced entry." : status.toString().includes("CONFIRMED") ? "Valid setup. Use risk control." : "No clean trade. Stand aside.");

    return [
      `🐺 **${label}**`,
      `${selectedSymbol} · ${timeframe} · ${session}`,
      `**${status}** · ${direction} · Master:${v25FinalBrain.masterScore}% · Grade:${v25FinalBrain.masterGrade} · ${decisionPlan.proSignal ? "ELITE" : "WATCH"}`,
      `Decision: ${v25FinalBrain.action} · Grade: ${v25FinalBrain.masterGrade} ${v25FinalBrain.masterScore}% · Trigger: ${v25FinalBrain.triggerAligned ? "SYNCED" : "WAIT"}`,
      `Institutional: ${institutionalPrecision.institutionalGrade} ${institutionalPrecision.precisionScore}% · Visual: ${visualIntelligence.summary}`,
      `Entry: ${v25FinalBrain.entry ? formatPrice(v25FinalBrain.entry) : "--"}`,
      `SL: ${v25FinalBrain.sl ? formatPrice(v25FinalBrain.sl) : "--"} · Invalid: ${decisionPlan.invalidation ? formatPrice(decisionPlan.invalidation) : "--"}`,
      `TP1: ${v25FinalBrain.tp1 ? formatPrice(v25FinalBrain.tp1) : "--"} · TP2: ${v25FinalBrain.tp2 ? formatPrice(v25FinalBrain.tp2) : "--"} · TP3: ${v25FinalBrain.tp3 ? formatPrice(v25FinalBrain.tp3) : "--"}`,
      `Structure: ${decisionPlan.structure} · Liquidity: ${decisionPlan.liquidity} · Trigger: ${decisionPlan.trigger}/${decisionPlan.triggerQuality}`,
      `Manage: ${managementBrain.action}${managementBrain.warning ? ` · ${managementBrain.warning}` : ""}`,
      `Plan: ${planLine}`,
    ].join("\n");
  }

  function buildCompactExternalEvent(title: string, body: string) {
    const mark = livePrice || lastCandleRef.current?.close || 0;
    return [`🐺 **${title}**`, `${selectedSymbol} · ${timeframe} · ${session}`, body, mark ? `Mark: ${formatPrice(mark)}` : ""].filter(Boolean).join("\n");
  }

  async function sendExternalAlert(title: string, body: string, discordBody?: string) {
    if (!externalAlertSettings.enabled || externalAlertBusyRef.current) return;
    const targets = [
      { url: externalAlertSettings.discordWebhook, kind: "discord" },
      { url: externalAlertSettings.telegramWebhook, kind: "telegram" },
      { url: externalAlertSettings.emailWebhook, kind: "email" },
    ].filter((target) => Boolean(target.url));

    if (!targets.length) return;
    externalAlertBusyRef.current = true;

    try {
      await Promise.allSettled(
        targets.map((target) => {
          const isDiscord = target.kind === "discord";
          const content = isDiscord
            ? discordBody || (externalAlertSettings.discordSignalOnly ? buildCompactExternalEvent(title, body) : `🐺 **${title}**\n${body}`)
            : `🐺 ${title}\n${body}`;

          return fetch(target.url!, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content,
              title,
              body,
              symbol: selectedSymbol,
              timeframe,
              session,
              signal: v25FinalBrain.consoleState,
              confidence: signalPlan.confidence,
              price: livePrice || lastCandleRef.current?.close || 0,
            }),
          });
        })
      );
    } catch (error) {
      console.warn("External alert failed", error);
    } finally {
      externalAlertBusyRef.current = false;
    }
  }

  function sendDiscordSignalNow() {
    if (v25FinalBrain.action !== "ENTER NOW" || !v25FinalBrain.finalDirection || !v25FinalBrain.entry) {
      addJournal("Discord signal skipped: no valid decision plan");
      return;
    }
    if (decisionPlan.quality < externalAlertSettings.minSignalConfidence || v23EliteEngine.sniperScore < 86) {
      addJournal(`Discord signal skipped: quality ${decisionPlan.quality}% / sniper ${v23EliteEngine.sniperScore}% below elite threshold`);
      return;
    }
    const compact = buildCompactDiscordSignal("WOLVRENE DECISION SIGNAL");
    sendExternalAlert("WOLVRENE DECISION SIGNAL", `${decisionPlan.phase} ${decisionPlan.direction} at ${decisionPlan.entry ? formatPrice(decisionPlan.entry) : "market"}`, compact);
    addJournal(`Discord decision sent: ${decisionPlan.phase} ${decisionPlan.quality}%`);
  }

  function saveJournalNote() {
    if (!journalNote.trim()) return;
    addJournal(journalNote.trim());
    setJournalNote("");
  }

  function clearJournal() {
    setJournalEntries([]);
    localStorage.removeItem("wolvreneJournal");
    setStructuredJournal([]);
    localStorage.removeItem("wolvreneStructuredJournalV1");
  }

  const reloadCandles = useCallback(async () => {
    try {
      const candles = await fetchBitgetCandlesForSymbol(timeframeRef.current, selectedSymbolRef.current);
      if (!chartAliveRef.current || !candleSeriesRef.current || candles.length === 0) return;

      candleSeriesRef.current.setData(candles.map(toChartCandle));
      setRecentCandles(candles.slice(-PRECISION_RULES.candleHistory));
      lastCandleRef.current = candles[candles.length - 1];

      const first = candles[0]?.close;
      const last = candles[candles.length - 1]?.close;

      if (first && last) {
        if (last > first) {
          setBias("BULLISH");
          setWolfMode("HUNT MODE");
        } else if (last < first) {
          setBias("BEARISH");
          setWolfMode("STALKING");
        } else {
          setBias("NEUTRAL");
          setWolfMode("NO TRADE");
        }
      }

      chartApiRef.current?.timeScale().fitContent();
    } catch (error) {
      console.warn("WOLVRENE candle reload failed", error);
    }
  }, []);

  function resetDashboard() {
    setHideUI(false);
    setContextMenu({ open: false, x: 0, y: 0, price: 0 });
    chartApiRef.current?.timeScale().fitContent();
    reloadCandles();
  }

  function applyTradeModeSelection(mode: TradeModeSelection) {
    setTradeModeSelection(mode);
    const nextMode: TradeMode = mode === "AUTO" ? autoTradeMode : mode;
    const nextAllowed = nextMode === "SCALP" ? SCALP_TIMEFRAMES : SWING_TIMEFRAMES;
    if (!(nextAllowed as readonly string[]).includes(timeframe)) {
      setTimeframe(nextAllowed[0]);
    }
  }

  async function getMarketStats() {
    try {
      const row = await fetchBitgetTickerForSymbol(selectedSymbolRef.current);
      const changeRaw = row?.priceChangePercent ?? row?.changeUtc24h ?? row?.changeUtc;
      const open24h = Number(row?.open24h || row?.open || 0);
      const lastPr = Number(row?.lastPr || row?.last || 0);
      const fallbackChange = open24h > 0 && lastPr > 0 ? ((lastPr - open24h) / open24h) * 100 : null;
      const finalChange = Number.isFinite(Number(changeRaw)) ? Number(changeRaw) : fallbackChange;
      setMarketStats({
        high: row?.high24h ? Number(row.high24h).toLocaleString() : "--",
        low: row?.low24h ? Number(row.low24h).toLocaleString() : "--",
        volume: row?.baseVolume ? Number(row.baseVolume).toLocaleString() : "--",
        change: finalChange === null || Number.isNaN(finalChange) ? "--" : `${Number(finalChange).toFixed(2)}%`,
        funding: row?.fundingRate ? `${(Number(row.fundingRate) * 100).toFixed(4)}%` : "--",
      });
    } catch {}
  }

  function updateSessionClock() {
    const now = new Date();
    const utcHour = now.getUTCHours();

    setClock(now.toLocaleTimeString());

    let nextHour = 0;

    if (utcHour >= 0 && utcHour < 7) {
      setSession("Sydney / Asia Build");
      nextHour = 7;
    } else if (utcHour >= 7 && utcHour < 12) {
      setSession("London Open");
      nextHour = 12;
    } else if (utcHour >= 12 && utcHour < 21) {
      setSession("New York Active");
      nextHour = 21;
    } else {
      setSession("Late NY / Reset Zone");
      nextHour = 24;
    }

    const nowUtcMs =
      now.getUTCHours() * 3600000 +
      now.getUTCMinutes() * 60000 +
      now.getUTCSeconds() * 1000;

    const diff = Math.max(0, nextHour * 3600000 - nowUtcMs);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    setSessionCountdown(`${h}h ${m}m`);
  }

  function priceToTop(price: number) {
    const series = candleSeriesRef.current;
    if (!series) return null;
    const coordinate = series.priceToCoordinate(price);
    return typeof coordinate === "number" ? coordinate : null;
  }

  function timeToLeft(time: number) {
    const chart = chartApiRef.current;
    if (!chart) return null;
    const coordinate = chart.timeScale().timeToCoordinate(time as Time);
    return typeof coordinate === "number" ? coordinate : null;
  }

  function coordinateToPrice(clientY: number) {
    const rect = chartContainerRef.current?.getBoundingClientRect();
    const series = candleSeriesRef.current;
    if (!rect || !series) return livePrice || lastCandleRef.current?.close || 0;

    const y = clientY - rect.top;
    const price = series.coordinateToPrice(y);
    return Number(price || livePrice || lastCandleRef.current?.close || 0);
  }

  function createOrder(side: Direction, basePrice?: number) {
    if (!side) return;
    const radarExecutionAllowed =
      radarGate.finalSignalMode === "RADAR_APPROVED" ||
      (radarGate.finalSignalMode === "RADAR_VALIDATED" && radarGate.directionAligned);
    if (!radarExecutionAllowed) {
      addJournal("Radar gate blocked execution.");
      return;
    }

    const price = basePrice || (orderType === "limit" ? Number(draftPrice) : livePrice) || livePrice || lastCandleRef.current?.close;
    if (!price) return;

    const notionalUsd = Math.max(1, Number(draftUsd) || 0);
    const size = Math.max(0.000001, calcBaseSizeFromUsd(notionalUsd, price));
    const leverage = clampLeverage(Number(draftLeverage));
    const marginUsd = leverage ? notionalUsd / leverage : notionalUsd;

    const order = {
      ...createOrderFromPrice(side, price),
      size: Number(size.toFixed(6)),
      leverage,
      notionalUsd,
      marginUsd,
      marginMode,
    } as TradeOrder;

    setOrders((prev) => [normalizeOrderFinancials({ ...order, price }), ...prev]);
    setSelectedOrderId(order.id);
    addJournal(`${side} ${orderType.toUpperCase()} order created at ${formatPrice(price)} — ${notionalUsd.toFixed(2)} USDT / ${Number(size).toFixed(6)} base / ${leverage}x / ${marginMode.toUpperCase()}`);
    addStructuredJournal({ event: "ORDER_CREATED", side, entry: price, note: `${side} ${orderType.toUpperCase()} order created` });
    sendExternalAlert("WOLVRENE ORDER CREATED", `${side} ${orderType.toUpperCase()} at ${formatPrice(price)} · ${notionalUsd.toFixed(2)} USDT · ${leverage}x`);
  }

  const canExecuteSignal =
    v25FinalBrain.action === "ENTER NOW" &&
    Boolean(v25FinalBrain.finalDirection) &&
    (
      radarGate.finalSignalMode === "RADAR_APPROVED" ||
      (radarGate.finalSignalMode === "RADAR_VALIDATED" && radarGate.directionAligned)
    );

  const canExecuteLong = canExecuteSignal && v25FinalBrain.finalDirection === "LONG";
  const canExecuteShort = canExecuteSignal && v25FinalBrain.finalDirection === "SHORT";

  function useSignalPlan() {
    if (!v25FinalBrain.finalDirection || !v25FinalBrain.entry || v25FinalBrain.action !== "ENTER NOW") {
      addJournal("Signal use blocked: no EXECUTE signal. Wolvrene will not create orders from watch-only data.");
      return;
    }
    setOrderSide(v25FinalBrain.finalDirection);
    setDraftPrice(v25FinalBrain.entry.toFixed(2));
    createOrder(v25FinalBrain.finalDirection, v25FinalBrain.entry);
    addJournal(`EXECUTE signal used: ${v25FinalBrain.displayConsoleState} at ${formatPrice(v25FinalBrain.entry)} — risk ${v25FinalBrain.risk}`);
    addStructuredJournal({ event: "SIGNAL_USED", side: v25FinalBrain.finalDirection, entry: v25FinalBrain.entry, note: `${v25FinalBrain.action} · ${v25FinalBrain.risk}` });
  }

  function updateOrder(orderId: number, patch: Partial<TradeOrder>) {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId ? normalizeOrderFinancials({ ...order, ...patch } as TradeOrder) : order
      )
    );
  }

  function orderPnL(order: TradeOrder) {
  const mark = livePrice || order.entry;

  return calcOrderPnLUsd(
    order.entry,
    mark,
    order.size,
    order.side
  );
}

function orderRoi(order: TradeOrder) {
  const mark = livePrice || order.entry;

  return calcOrderRoiPct(
    order.entry,
    mark,
    order.size,
    order.leverage,
    order.side
  );
}

  function estimatedLiquidation(order: TradeOrder) {
    const leverage = Math.max(1, Number(order.leverage) || 1);
    const buffer = 0.9 / leverage;
    return order.side === "LONG" ? order.entry * (1 - buffer) : order.entry * (1 + buffer);
  }


  function positionMargin(order: TradeOrder) {
    return calcOrderMarginUsd(order.size, order.entry, order.leverage);
  }

  function breakevenPrice(order: TradeOrder) {
    return order.entry;
  }

  function closeOrder(orderId: number) {
    const order = orders.find((item) => item.id === orderId);
    const pnl = order ? orderPnL(order) : 0;
    setOrders((prev) => prev.filter((order) => order.id !== orderId));
    if (selectedOrderId === orderId) setSelectedOrderId(null);
    addJournal(`Position #${String(orderId).slice(-4)} closed · PnL ${pnl.toFixed(2)} USDT`);
    if (order) {
      addStructuredJournal({ event: "MANUAL", side: order.side, entry: order.entry, exit: livePrice || order.entry, pnl, roi: orderRoi(order), note: "Manual full close" });
      updateLearningFromOutcome(pnl, order.side);
    }
  }

  function closePartial(orderId: number, percent: number) {
    setOrders((prev) =>
      prev.flatMap((order) => {
        if (order.id !== orderId) return [order];
        const currentSize = Number(order.size) || 0;
        const closeSize = currentSize * (percent / 100);
        const nextSize = Math.max(0, currentSize - closeSize);
        const pnl = orderPnL(order) * (percent / 100);
        addJournal(`Closed ${percent}% of ${order.side} #${String(order.id).slice(-4)}`);
        addStructuredJournal({ event: "PARTIAL_CLOSE", side: order.side, entry: order.entry, exit: livePrice || order.entry, pnl, roi: orderRoi(order), note: `Manual partial close ${percent}%` });
        updateLearningFromOutcome(pnl, order.side);
        if (nextSize <= 0.000001 || percent >= 100) {
          if (selectedOrderId === orderId) setSelectedOrderId(null);
          return [];
        }
        const nextOrder = normalizeOrderFinancials(
          { ...order, size: Number(nextSize.toFixed(6)) } as TradeOrder
        );
        return [nextOrder];
      })
    );
  }

  function reverseOrder(order: TradeOrder) {
    const price = livePrice || order.entry;
    const oppositeSide: Exclude<Direction, null> = order.side === "LONG" ? "SHORT" : "LONG";
    const reversedOrder = {
      ...createOrderFromPrice(oppositeSide, price),
      size: Number(order.size) || 0.01,
      leverage: Number(order.leverage) || 1,
    } as TradeOrder;
    setOrders((prev) => [normalizeOrderFinancials(reversedOrder), ...prev.filter((item) => item.id !== order.id)]);
    setSelectedOrderId(reversedOrder.id);
    addJournal(`Reversed #${String(order.id).slice(-4)} into ${oppositeSide}`);
  }

  function updateOrderLine(target: DragTarget, price: number) {
    if (!target) return;

    setOrders((prev) =>
      prev.map((order) => {
        if (target.type === "entry" && order.id === target.orderId) {
          return normalizeOrderFinancials({ ...order, entry: price } as TradeOrder);
        }
        if (target.type === "sl" && order.id === target.orderId) return { ...order, sl: price };

        if (target.type === "tp" && order.id === target.orderId) {
          return {
            ...order,
            tps: order.tps.map((tp) => (tp.id === target.tpId ? { ...tp, price } : tp)),
          };
        }

        return order;
      })
    );
  }

  function updateTP(orderId: number, tpId: number, patch: Partial<TradeOrder["tps"][number]>) {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId
          ? { ...order, tps: order.tps.map((tp) => (tp.id === tpId ? { ...tp, ...patch } : tp)) }
          : order
      )
    );
  }

  function deleteOrder(orderId: number) {
    setOrders((prev) => prev.filter((order) => order.id !== orderId));
    if (selectedOrderId === orderId) setSelectedOrderId(null);
    addJournal(`Order #${String(orderId).slice(-4)} deleted`);
  }

  function addTP(orderId: number) {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        const base = livePrice || order.entry;
        const nextIndex = order.tps.length + 1;
        const isLong = order.side === "LONG";
        const nextTp = {
          id: Date.now() + Math.floor(Math.random() * 999),
          label: `TP${nextIndex}`,
          price: isLong ? base * (1 + nextIndex * 0.005) : base * (1 - nextIndex * 0.005),
          closePct: 25,
          hit: false,
        };
        return { ...order, tps: [...order.tps, nextTp] };
      })
    );
  }

  function deleteTP(orderId: number, tpId: number) {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;

        const remainingTps = order.tps.filter((tp) => tp.id !== tpId);

        return {
          ...order,
          tps: remainingTps.map((tp, index) => ({ ...tp, label: `TP${index + 1}` })),
        };
      })
    );

    addJournal(`TP removed from order #${String(orderId).slice(-4)}`);
  }

  function addAlert(price?: number, side: "above" | "below" = "above") {
    const alertPrice = price || livePrice || lastCandleRef.current?.close;
    if (!alertPrice) return;

    const alert: PriceAlert = {
      id: Date.now() + Math.floor(Math.random() * 999),
      enabled: true,
      price: alertPrice,
      side,
      sound: true,
      hit: false,
    };

    setAlerts((prev) => [alert, ...prev]);
    addJournal(`Alert created ${side.toUpperCase()} ${formatPrice(alertPrice)}`);
  }

  function updateAlert(alertId: number, patch: Partial<PriceAlert>) {
    setAlerts((prev) => prev.map((alert) => (alert.id === alertId ? { ...alert, ...patch } : alert)));
  }

  function deleteAlert(alertId: number) {
    setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
  }

  function updateAlertLine(target: DragTarget, price: number) {
    if (!target || target.type !== "alert") return;
    setAlerts((prev) =>
      prev.map((alert) =>
        alert.id === target.alertId ? { ...alert, price, hit: false } : alert
      )
    );
  }

  function checkAlertsAndOrders(price: number) {
    setAlerts((prev) =>
      prev.map((alert) => {
        if (!alert.enabled || alert.hit) return alert;
        const hit =
          (alert.side === "above" && price >= alert.price) ||
          (alert.side === "below" && price <= alert.price);

        if (hit) {
          if (alert.sound) beep();
          addJournal(`Alert hit: BTC ${alert.side.toUpperCase()} ${formatPrice(alert.price)}`);
          addStructuredJournal({ event: "WARNING", note: `Price alert hit ${alert.side.toUpperCase()} ${formatPrice(alert.price)}` });
          sendExternalAlert("WOLVRENE PRICE ALERT", `${selectedSymbol} ${alert.side.toUpperCase()} ${formatPrice(alert.price)} · Mark ${formatPrice(price)}`);
          return { ...alert, hit: true };
        }

        return alert;
      })
    );

    setOrders((prev) =>
      prev.map((order) => {
        if (order.status === "CLOSED") return order;
        let changed = false;
        const nextOrder: TradeOrder = { ...order, tps: [...order.tps] };
        const isLong = order.side === "LONG";
        const initialRisk = Math.max(Math.abs(order.entry - order.sl), order.entry * 0.001);
        let currentSize = Number(order.size) || 0;

        nextOrder.tps = nextOrder.tps.map((tp, index) => {
          if (tp.hit) return tp;
          const hit = isLong ? price >= tp.price : price <= tp.price;
          if (hit) {
            changed = true;
            const closePct = Math.max(0, Math.min(100, Number(tp.closePct) || 0));
            const closedSize = tradeManagerSettings.autoPartialClose ? currentSize * (closePct / 100) : 0;
            const pnlPerUnit = isLong ? tp.price - order.entry : order.entry - tp.price;
            const pnl = pnlPerUnit * closedSize;
            if (tradeManagerSettings.autoPartialClose && closedSize > 0) {
              currentSize = Math.max(0, currentSize - closedSize);
              nextOrder.size = Number(currentSize.toFixed(6));
            }
            if (tradeManagerSettings.autoMoveBE && index === 0) {
              nextOrder.sl = order.entry;
              addJournal(`SL moved to breakeven after ${tp.label} for ${order.side} #${String(order.id).slice(-4)}`);
              addStructuredJournal({ event: "BE_MOVE", side: order.side, entry: order.entry, exit: price, pnl: 0, roi: orderRoi(order), note: `Auto BE after ${tp.label}` });
            }
            addJournal(`${tp.label} hit for ${order.side} #${String(order.id).slice(-4)} — ${tradeManagerSettings.autoPartialClose ? `auto close ${closePct}%` : `mark hit ${closePct}%`}`);
            addStructuredJournal({ event: "TP_HIT", side: order.side, entry: order.entry, exit: tp.price, pnl, roi: orderRoi(order), note: `${tp.label} hit · ${closePct}%` });
            updateLearningFromOutcome(pnl || Math.abs(order.entry - tp.price), order.side);
            sendExternalAlert("WOLVRENE TP HIT", `${tp.label} hit for ${order.side} #${String(order.id).slice(-4)} at ${formatPrice(tp.price)}`);
            return { ...tp, hit: true };
          }
          return tp;
        });

        if (tradeManagerSettings.trailingEnabled && nextOrder.tps.some((tp) => tp.hit) && currentSize > 0) {
          const trailDistance = initialRisk * Math.max(0.5, tradeManagerSettings.trailingRMultiple || 1.4);
          const proposedSL = isLong ? price - trailDistance : price + trailDistance;
          const improves = isLong ? proposedSL > nextOrder.sl && proposedSL < price : proposedSL < nextOrder.sl && proposedSL > price;
          if (improves) {
            nextOrder.sl = proposedSL;
            changed = true;
            addStructuredJournal({ event: "TRAIL_UPDATE", side: order.side, entry: order.entry, exit: price, note: `Trailing SL updated to ${formatPrice(proposedSL)}` });
          }
        }

        const slHit = isLong ? price <= nextOrder.sl : price >= nextOrder.sl;
        if (slHit && nextOrder.status !== "CLOSED") {
          const pnl = (isLong ? nextOrder.sl - order.entry : order.entry - nextOrder.sl) * (Number(nextOrder.size) || Number(order.size) || 0);
          addJournal(`SL hit for ${order.side} #${String(order.id).slice(-4)}`);
          addStructuredJournal({ event: "SL_HIT", side: order.side, entry: order.entry, exit: nextOrder.sl, pnl, roi: orderRoi(order), note: "Stop loss hit" });
          updateLearningFromOutcome(pnl, order.side);
          sendExternalAlert("WOLVRENE SL HIT", `${order.side} #${String(order.id).slice(-4)} SL hit at ${formatPrice(nextOrder.sl)}`);
          return { ...nextOrder, status: "CLOSED" };
        }

        if (tradeManagerSettings.structureWeaknessWarnings) {
          const oppositeBias = (order.side === "LONG" && bias === "BEARISH") || (order.side === "SHORT" && bias === "BULLISH");
          const weakConfidence = confidence < 48;
          if (oppositeBias || weakConfidence) {
            const warning = `Weakness warning: ${order.side} #${String(order.id).slice(-4)} · ${bias} bias · ${confidence}% confidence`;
            setTradeWarnings((prevWarnings) => prevWarnings[0] === warning ? prevWarnings : [warning, ...prevWarnings].slice(0, 5));
          }
        }

        return changed ? nextOrder : order;
      })
    );
  }

  function openLineEditor(editor: LineEditor) {
    setLineEditor(editor);
    setContextMenu({ open: false, x: 0, y: 0, price: 0 });
  }

  function editorOrder() {
    if (!lineEditor || !("orderId" in lineEditor)) return null;
    return orders.find((order) => order.id === lineEditor.orderId) || null;
  }

  function editorTP() {
    const order = editorOrder();
    if (!order || !lineEditor || lineEditor.type !== "tp") return null;
    return order.tps.find((tp) => tp.id === lineEditor.tpId) || null;
  }

  const marketRegime = brain.marketRegime;
  const mlState = brain.mlState;

  const UnifiedWolvreneBrain = useMemo(() => ({
    symbol: selectedSymbol,
    selectedMode: activeTradeMode,
    selectedTimeframe: timeframe,
    candles: recentCandles,
    livePrice,
    session,
    activeTrade: activeExecutionTradeView,
    userRiskSettings: {
      maxRiskPct: riskFirewall.maxRiskPct,
      riskState: riskFirewall.state,
      firewallReason: riskFirewall.reason,
    },
    signal: brain.signalPlan,
    decision: brain.decision,
    debug: {
      ...brain.debug,
      executionState: executionEvaluation.state,
      tradeLogged: tradeLog.length > 0,
      performanceUpdated: strategyPerformance.length > 0,
      adaptiveWeights: adaptiveWeightsLive,
      discordSent: discordSentState,
      uiMismatch,
      uiMismatchDetails: uiMismatch
        ? {
            uiDirection: decisionPlan.direction,
            uiPhase: decisionPlan.phase,
            uiConfidence: signalPlan.confidence,
            brainDirection: brain.direction,
            brainPhase: brain.decision.phase,
            brainConfidence: brain.confidence,
          }
        : null,
    },
    whyDecision: brain.whyDecision,
    whyNoTrade: brain.whyNoTrade,
    invalidationReason: brain.invalidationReason,
    riskReason: brain.riskReason,
    entryReason: brain.entryReason,
    managementReason: brain.managementReason,
    institutionalContext: brain.institutionalContext,
    symbolStrength: brain.symbolStrength,
    relativeMomentum: brain.relativeMomentum,
    watchlistRank: brain.watchlistRank,
    managementAction: brain.managementAction,
    marketRegime,
    mlState,
    portfolio: portfolioState,
    finalDecision: finalDecisionEngine,
    adaptiveSizing,
    performance: { eliteAIScore, backtestStats, realAccuracyStats },
    learningState: { learningStats, learningWeights },
  }), [selectedSymbol, activeTradeMode, timeframe, recentCandles, livePrice, session, activeExecutionTradeView, riskFirewall.maxRiskPct, riskFirewall.state, riskFirewall.reason, brain.signalPlan, brain.decision, brain.debug, marketRegime, mlState, portfolioState, finalDecisionEngine, adaptiveSizing, eliteAIScore, backtestStats, realAccuracyStats, learningStats, learningWeights, executionEvaluation.state, tradeLog.length, strategyPerformance.length, adaptiveWeightsLive, discordSentState, uiMismatch, decisionPlan.direction, decisionPlan.phase, signalPlan.confidence, brain.direction, brain.confidence]);

  const unifiedTradingContext = useMemo(() => ({
    symbol: UnifiedWolvreneBrain.symbol,
    mode: UnifiedWolvreneBrain.selectedMode,
    timeframe: UnifiedWolvreneBrain.selectedTimeframe,
    session,
    livePrice: UnifiedWolvreneBrain.livePrice,
    signal: UnifiedWolvreneBrain.signal,
    decision: UnifiedWolvreneBrain.decision,
    debug: UnifiedWolvreneBrain.debug,
    whyDecision: UnifiedWolvreneBrain.whyDecision,
    whyNoTrade: UnifiedWolvreneBrain.whyNoTrade,
    invalidationReason: UnifiedWolvreneBrain.invalidationReason,
    riskReason: UnifiedWolvreneBrain.riskReason,
    entryReason: UnifiedWolvreneBrain.entryReason,
    managementReason: UnifiedWolvreneBrain.managementReason,
    institutionalContext: UnifiedWolvreneBrain.institutionalContext,
    symbolStrength: UnifiedWolvreneBrain.symbolStrength,
    relativeMomentum: UnifiedWolvreneBrain.relativeMomentum,
    watchlistRank: UnifiedWolvreneBrain.watchlistRank,
    managementAction: UnifiedWolvreneBrain.managementAction,
    activeTrade: UnifiedWolvreneBrain.activeTrade,
    performance: UnifiedWolvreneBrain.performance,
    portfolio: UnifiedWolvreneBrain.portfolio,
    riskFirewall,
    finalDecision: UnifiedWolvreneBrain.finalDecision,
    adaptiveSizing: UnifiedWolvreneBrain.adaptiveSizing,
    learningState: UnifiedWolvreneBrain.learningState,
    mlState: UnifiedWolvreneBrain.mlState,
    marketRegime: UnifiedWolvreneBrain.marketRegime,
  }), [UnifiedWolvreneBrain, session, riskFirewall]);

  const sanitizedBrainPayload = useMemo(() => {
    const payload = buildSanitizedBrainPayload(brain);
    console.log("Unified Brain Output:", brain);
    console.log("Sanitized AI Payload:", payload);
    return payload;
  }, [brain]);

  const aiInsights = useMemo(() => {
    const notes: string[] = [];
    notes.push(`Brain phase: ${sanitizedBrainPayload.phase} · Direction: ${sanitizedBrainPayload.direction || "WAIT"} · Confidence: ${sanitizedBrainPayload.confidence}%.`);
    notes.push(`Strategy: ${sanitizedBrainPayload.strategyProfile.name} · Grade: ${sanitizedBrainPayload.entryGrade}.`);
    notes.push(`Decision: ${sanitizedBrainPayload.whyDecision || "No execution decision."}`);
    notes.push(`No-trade reason: ${sanitizedBrainPayload.whyNoTrade || "N/A"}`);
    notes.push(`Risk: ${sanitizedBrainPayload.riskReason}`);
    notes.push(`Next action: ${sanitizedBrainPayload.strategyProfile.nextAction}`);
    return notes.slice(0, 6);
  }, [sanitizedBrainPayload]);

  const aiContext = useMemo(
    () => ({
      source: "UnifiedWolvreneBrain",
      payload: sanitizedBrainPayload,
      mode: aiExplanationMode,
      debug: {
        aiPayloadSanitized: true,
        aiContextSource: "UnifiedWolvreneBrain",
        aiRateProtected: true,
      },
    }),
    [sanitizedBrainPayload, aiExplanationMode]
  );

  const selectedTradeContext = useMemo<SelectedTradeContext>(() => {
    const selectedTrade = activeExecutionTradeView || selectedOrder;
    if (!selectedTrade) {
      return {
        side: null,
        entry: null,
        markPrice: livePrice ?? null,
        pnlUsd: null,
        pnlPct: null,
        sl: null,
        tp1: null,
        tp2: null,
        tp3: null,
        tpCount: 0,
        distanceToSL: null,
        distanceToTP1: null,
        timeInTrade: null,
        status: "NO_ACTIVE_TRADE",
        currentAction: brain.managementPlaybook.action,
        riskState: sanitizedBrainPayload.risk,
      };
    }

    const entry = Number.isFinite(selectedTrade.entry) ? selectedTrade.entry : null;
    const markPrice = livePrice ?? null;
    const sl = Number.isFinite(selectedTrade.sl) ? selectedTrade.sl : null;
    const tp1 = "tp1" in selectedTrade ? (Number.isFinite(selectedTrade.tp1) ? selectedTrade.tp1 : null) : selectedTrade.tps?.[0]?.price ?? null;
    const tp2 = "tp2" in selectedTrade ? (Number.isFinite(selectedTrade.tp2) ? selectedTrade.tp2 : null) : selectedTrade.tps?.[1]?.price ?? null;
    const tp3 = "tp3" in selectedTrade ? (Number.isFinite(selectedTrade.tp3) ? selectedTrade.tp3 : null) : selectedTrade.tps?.[2]?.price ?? null;
    const side = selectedTrade.side || null;
    const size = Number((selectedTrade as { size?: number }).size || 0);
    const pnlUsd = livePrice && entry && side
      ? (side === "LONG" ? livePrice - entry : entry - livePrice) * size
      : null;
    const margin = "margin" in selectedTrade ? selectedTrade.margin : 0;
    const pnlPct = pnlUsd !== null && Number.isFinite(Number(margin)) && Number(margin) > 0 ? (pnlUsd / Number(margin)) * 100 : null;
    const tpCount = "tp1Hit" in selectedTrade
      ? (selectedTrade.tp3Hit ? 3 : selectedTrade.tp2Hit ? 2 : selectedTrade.tp1Hit ? 1 : 0)
      : selectedTrade.tps?.filter((tp) => tp.hit).length || 0;
    const distanceToSL = livePrice && sl ? Math.abs(livePrice - sl) : null;
    const distanceToTP1 = livePrice && tp1 ? Math.abs(tp1 - livePrice) : null;
    const timeInTrade = "openedAt" in selectedTrade ? Math.max(0, Math.floor((Date.now() - normalizeEpochMs(selectedTrade.openedAt)) / 60000)) : null;
    return {
      side,
      entry,
      markPrice,
      pnlUsd,
      pnlPct,
      sl,
      tp1,
      tp2,
      tp3,
      tpCount,
      distanceToSL,
      distanceToTP1,
      timeInTrade,
      status: selectedTrade.status || "UNKNOWN",
      currentAction: brain.managementPlaybook.action,
      riskState: sanitizedBrainPayload.risk,
    };
  }, [activeExecutionTradeView, selectedOrder, livePrice, brain.managementPlaybook.action, sanitizedBrainPayload.risk]);


  const marketRadarForAI = useMemo(() => marketRadarIntelligence ? ({
    state: marketRadarIntelligence.state, bias: marketRadarIntelligence.bias, price: marketRadarIntelligence.price,
    activeSession: marketRadarIntelligence.session.activeSession, latestSweep: marketRadarIntelligence.latestSweep,
    fundingBias: marketRadarIntelligence.fundingBias, openInterestBias: marketRadarIntelligence.openInterestBias,
    longShortBias: marketRadarIntelligence.longShortBias, absorption: marketRadarIntelligence.orderFlow.absorption,
    nearestLiquidationAbove: marketRadarIntelligence.liquidationMap.nearestAbove?.price ?? null,
    nearestLiquidationBelow: marketRadarIntelligence.liquidationMap.nearestBelow?.price ?? null,
    invalidation: marketRadarIntelligence.invalidation, targetLiquidity: marketRadarIntelligence.targetLiquidity,
    confidence: marketRadarIntelligence.confidence, decisionSummary: marketRadarIntelligence.decisionSummary,
    tacticalPlan: marketRadarIntelligence.tacticalPlan, riskNotes: marketRadarIntelligence.riskNotes, stale: marketRadarIntelligence.stale, errors: marketRadarIntelligence.errors,
    radarGateDecision: radarGate.radarGateResult, finalSignalMode: radarGate.finalSignalMode, legacySignal: radarGate.legacySignal
  }) : { state: 'DATA_UNAVAILABLE', message: 'radar data is unavailable', radarGateDecision: radarGate.radarGateResult, finalSignalMode: radarGate.finalSignalMode, legacySignal: radarGate.legacySignal }, [marketRadarIntelligence, radarGate.radarGateResult, radarGate.finalSignalMode, radarGate.legacySignal]);

  const aiLiveContext = useMemo<LiveContext>(() => ({
    symbol: selectedSymbol,
    displayedSymbol: selectedSymbol,
    normalizedRadarSymbol,
    exchange: "bitget",
    mode: activeTradeMode,
    timeframe,
    livePrice: livePrice ?? null,
    session,
    direction: sanitizedBrainPayload.direction,
    confidence: sanitizedBrainPayload.confidence,
    volatility: candlesSummary.volatility,
    funding: marketStats.funding,
    volumeState: marketStats.volume,
    marketState: brain.marketRegime,
    ordersCount: orders.length,
    alertsCount: alerts.length,
    candleTrend: candlesSummary.trend,
    marketRadar: marketRadarForAI,
    smartFibContext,
  }), [selectedSymbol, activeTradeMode, timeframe, livePrice, session, sanitizedBrainPayload.direction, sanitizedBrainPayload.confidence, candlesSummary.volatility, marketStats.volume, brain.marketRegime, candlesSummary.trend, marketStats.funding, orders.length, alerts.length, marketRadarForAI, smartFibContext]);

  const activeTradeContext = useMemo<SelectedTradeContext>(() => {
    if (activeExecutionTradeView) {
      const entry = Number.isFinite(activeExecutionTradeView.entry) ? activeExecutionTradeView.entry : null;
      const markPrice = livePrice ?? null;
      const pnlUsd = livePrice && entry
        ? (activeExecutionTradeView.side === "LONG" ? livePrice - entry : entry - livePrice) * activeExecutionTradeView.size
        : null;
      const pnlPct = pnlUsd !== null && activeExecutionTradeView.margin > 0 ? (pnlUsd / activeExecutionTradeView.margin) * 100 : null;
      return {
        side: activeExecutionTradeView.side,
        entry,
        markPrice,
        pnlUsd,
        pnlPct,
        sl: activeExecutionTradeView.sl,
        tp1: activeExecutionTradeView.tp1,
        tp2: activeExecutionTradeView.tp2,
        tp3: activeExecutionTradeView.tp3,
        tpCount: activeExecutionTradeView.tp3Hit ? 3 : activeExecutionTradeView.tp2Hit ? 2 : activeExecutionTradeView.tp1Hit ? 1 : 0,
        distanceToSL: livePrice ? Math.abs(livePrice - activeExecutionTradeView.sl) : null,
        distanceToTP1: livePrice ? Math.abs(activeExecutionTradeView.tp1 - livePrice) : null,
        timeInTrade: Math.max(0, Math.floor((Date.now() - normalizeEpochMs(activeExecutionTradeView.openedAt)) / 60000)),
        status: activeExecutionTradeView.status,
        currentAction: brain.managementPlaybook.action,
        riskState: sanitizedBrainPayload.risk,
      };
    }
    return selectedTradeContext;
  }, [activeExecutionTradeView, livePrice, brain.managementPlaybook.action, sanitizedBrainPayload.risk, selectedTradeContext]);

  const signalContext = useMemo(
    () => ({
      phase: sanitizedBrainPayload.phase,
      direction: sanitizedBrainPayload.direction,
      confidence: sanitizedBrainPayload.confidence,
      qualityScore: sanitizedBrainPayload.qualityScore,
      qualityGrade: sanitizedBrainPayload.qualityGrade,
      entryGrade: sanitizedBrainPayload.entryGrade,
      confirmationCount: sanitizedBrainPayload.confirmationCount,
      blockedReason: sanitizedBrainPayload.debug.blockedReason || sanitizedBrainPayload.debug.strategyBlockedReason,
      invalidationReason: sanitizedBrainPayload.invalidationReason,
      nextConfirmation: sanitizedBrainPayload.nextConfirmation,
    }),
    [sanitizedBrainPayload]
  );

  const riskContext = useMemo(
    () => ({
      risk: sanitizedBrainPayload.risk,
      riskReason: sanitizedBrainPayload.riskReason,
      riskEngine: sanitizedBrainPayload.riskEngine,
    }),
    [sanitizedBrainPayload]
  );

  const managementPlaybook = useMemo(
    () => ({
      action: sanitizedBrainPayload.managementPlaybook.action,
      reason: sanitizedBrainPayload.managementPlaybook.reason,
      protectBE: sanitizedBrainPayload.managementPlaybook.protectBE,
      trailSL: sanitizedBrainPayload.managementPlaybook.trailSL,
      scaleOut: sanitizedBrainPayload.managementPlaybook.scaleOut,
      earlyExit: sanitizedBrainPayload.managementPlaybook.earlyExit,
      exitReason: sanitizedBrainPayload.managementPlaybook.exitReason,
      nextCheckpoint: sanitizedBrainPayload.managementPlaybook.nextCheckpoint,
    }),
    [sanitizedBrainPayload]
  );
  const analystContext = useMemo(() => ({
    question: aiInput,
    explanationMode: aiExplanationMode,
    market: { exchange: "bitget", symbol: selectedSymbol, displayedSymbol: selectedSymbol, normalizedRadarSymbol, timeframe, livePrice, session, stats24h: { high: marketStats.high, low: marketStats.low, volume: marketStats.volume, change: marketStats.change }, funding: marketStats.funding, fundingEta: sessionCountdown },
    radar: { state: radarGate.radarState, bias: radarGate.radarBias, confidence: marketRadarIntelligence?.confidence ?? null, gateResult: radarGate.radarGateResult, gateReason: radarGate.radarGateReason, source: marketRadarSource },
    precision: { confidence: marketRadarIntelligence?.confidence ?? aiLiveContext.confidence ?? sanitizedBrainPayload.confidence ?? null, finalSignalMode: radarGate.finalSignalMode, legacySignal: radarGate.legacySignal, entry: sanitizedBrainPayload.entry, sl: sanitizedBrainPayload.sl, tp1: sanitizedBrainPayload.tp1, tp2: sanitizedBrainPayload.tp2, tp3: sanitizedBrainPayload.tp3, reason: sanitizedBrainPayload.whyDecision || sanitizedBrainPayload.whyNoTrade },
    triggerChecklist: aiLiveContext.checklist,
    sniper: aiLiveContext.sniper,
    activeTrade: activeTradeContext,
    selectedTrade: selectedTradeContext,
    selectedSignal: (aiLiveContext.signalFeed as { selected?: unknown } | undefined)?.selected ?? null,
    signalFeed: (aiLiveContext.signalFeed as { latestRows?: unknown[] } | undefined)?.latestRows ?? [],
    smartFibContext: aiLiveContext.smartFibContext,
    chartSnapshot: aiLiveContext.chartSnapshot,
    availableDataFlags: aiLiveContext.aiPayloadDebug ?? {},
  }), [aiInput, aiExplanationMode, selectedSymbol, normalizedRadarSymbol, timeframe, livePrice, session, marketStats.high, marketStats.low, marketStats.volume, marketStats.change, marketStats.funding, sessionCountdown, radarGate, marketRadarIntelligence?.confidence, marketRadarSource, aiLiveContext, sanitizedBrainPayload, activeTradeContext, selectedTradeContext]);

  function inferUserTradingIntent(question: string): AIIntent {
    const text = question.toLowerCase();
    if (/(manage|runner|trail|scale|protect|exit|position|my trade|hold|close|trade|profit|loss|تريد|صفقة)/i.test(text)) return "MANAGE_TRADE";
    if (/(risk|danger|safe|invalidation|sl|stop loss|drawdown|rr|مخاطرة)/i.test(text)) return "RISK_CHECK";
    if (/(entry|entries|where to enter|best area|trigger)/i.test(text)) return "BEST_ENTRY";
    if (/(session|london|new york|asia|open|timing|جلسة)/i.test(text)) return "SESSION_OUTLOOK";
    if (/(analyze|analysis|market|structure|liquidity|scenario|السوق)/i.test(text)) return "MARKET_ANALYSIS";
    return "CUSTOM";
  }

  function formatAIResponseMessage(structured: WolvreneStructuredResponse) {
    const marketRead = `${sanitizedBrainPayload.phase} ${sanitizedBrainPayload.direction || "WAIT"} | ${aiLiveContext.symbol} ${aiLiveContext.timeframe} ${aiLiveContext.mode}`;
    const hasSelectedTrade = Boolean(selectedTradeContext.side && selectedTradeContext.entry !== null);
    const tradeStatus = hasSelectedTrade
      ? `${selectedTradeContext.side} | Entry ${selectedTradeContext.entry} | Mark ${selectedTradeContext.markPrice ?? "N/A"} | PnL ${selectedTradeContext.pnlUsd ?? "N/A"} (${selectedTradeContext.pnlPct ?? "N/A"}%) | SL ${selectedTradeContext.sl ?? "N/A"} | TP1 ${selectedTradeContext.tp1 ?? "N/A"}`
      : "No active trade is open. Current state is waiting / watching.";
    const riskLine = `${sanitizedBrainPayload.risk} | ${sanitizedBrainPayload.riskReason}`;
    const watchLine = structured.reasoning.filter(Boolean).slice(0, 2).join(" | ") || sanitizedBrainPayload.nextConfirmation;
    let safeSummary = structured.summary;
    if (safeSummary.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(safeSummary) as Partial<WolvreneStructuredResponse>;
        safeSummary = typeof parsed.summary === "string" ? parsed.summary : safeSummary;
      } catch {
        safeSummary = safeSummary.replace(/^\{+/, "").trim();
      }
    }
    return [
      `Current Read: ${safeSummary}`,
      "",
      `Execution Status: ${selectedTradeContext.status || sanitizedBrainPayload.phase}`,
      `Trade Status: ${tradeStatus}`,
      "",
      `Risk: ${riskLine}`,
      "",
      `Why: ${watchLine}`,
      "",
      `Best Entry Plan: Entry ${sanitizedBrainPayload.entry ?? "N/A"} | SL ${sanitizedBrainPayload.sl ?? "N/A"} | TP1 ${sanitizedBrainPayload.tp1 ?? "N/A"} | TP2 ${sanitizedBrainPayload.tp2 ?? "N/A"} | TP3 ${sanitizedBrainPayload.tp3 ?? "N/A"}`,
      `Decision / Management: ${structured.decision} | ${managementPlaybook.action} (${managementPlaybook.reason})`,
      `Invalidation: ${structured.invalidation || sanitizedBrainPayload.invalidationReason}`,
      `Market Snapshot: ${marketRead} | Confidence ${sanitizedBrainPayload.confidence}%`,
    ].join("\n");
  }

  async function sendAIMessage(text?: string) {
    const question = (text || aiInput).trim();
    const intent = inferUserTradingIntent(question);
    if (!question || aiThinking || aiInFlightRef.current) return;
    if (!hasValidAIPayload(sanitizedBrainPayload)) {
      const missingPayloadMessage: AIMessage = {
        id: Date.now() + 1,
        role: "assistant",
        text: "AI payload missing. Brain context not available.",
        time: new Date().toLocaleTimeString(),
      };
      setAiMessages((prev) => [
        ...prev,
        missingPayloadMessage,
      ].slice(-40));
      return;
    }
    const requestKey = getAICacheKey({ question, payload: sanitizedBrainPayload, intent });
    if (lastAIRequestKeyRef.current === requestKey) return;
    lastAIRequestKeyRef.current = requestKey;
    aiInFlightRef.current = true;
    aiRequestSeqRef.current += 1;
    const requestId = aiRequestSeqRef.current;

    const now = new Date().toLocaleTimeString();
    const userMessage: AIMessage = { id: Date.now(), role: "user", text: question, time: now };

    setAiMessages((prev) => [...prev, userMessage].slice(-40));
    setAiInput("");
    setAiOpen(true);
    setAiTab("chat");
    setAiThinking(true);

    try {
      if (process.env.NODE_ENV !== "production") {
        console.log("AI_REQUEST_PAYLOAD_DEBUG", {
          hasLiveContext: Boolean(aiLiveContext),
          hasChartSnapshot: Boolean(aiLiveContext?.chartSnapshot),
          candleCount: Number((aiLiveContext?.chartSnapshot as { candleCount?: number } | undefined)?.candleCount || 0),
          radarState: (aiLiveContext?.marketRadar as { state?: string } | undefined)?.state ?? null,
          radarBias: (aiLiveContext?.marketRadar as { bias?: string } | undefined)?.bias ?? null,
          radarConfidence: (aiLiveContext?.marketRadar as { confidence?: number } | undefined)?.confidence ?? null,
          hasChecklist: Boolean(aiLiveContext?.checklist),
          hasSniper: Boolean(aiLiveContext?.sniper),
          hasActiveTrade: Boolean(activeTradeContext?.side),
          hasSelectedTrade: Boolean(selectedTradeContext?.side),
          hasSelectedSignal: Boolean((aiLiveContext?.signalFeed as { selected?: unknown } | undefined)?.selected),
          hasSignalFeed: Boolean((aiLiveContext?.signalFeed as { latestRows?: unknown[] } | undefined)?.latestRows?.length),
          intent,
          question,
        });
      }
      const history = aiMessages.map((m) => ({ role: m.role, text: m.text }));
      const aiResult = await askWolvreneAICore({
        question,
        payload: sanitizedBrainPayload,
        intent,
        selectedTradeContext,
        activeTradeContext,
        liveContext: aiLiveContext,
        signalContext,
        riskContext,
        analystContext,
        managementPlaybook,
        mode: aiExplanationMode,
        requestId,
        history,
      });
      if (aiResult.requestId !== aiRequestSeqRef.current) return;
      const structured = guardWolvreneAIResponse(aiResult.structured, {
        payload: sanitizedBrainPayload,
        intent,
        selectedTradeContext,
        liveContext: aiLiveContext,
        userQuestion: question,
      });
      const answer = formatAIResponseMessage(structured);
      setLastValidAIResponse(structured);
      setAiBridgeStatus("connected");
      setAiMessages((prev) => {
        const nextMessage: AIMessage = {
          id: Date.now() + 1,
          role: "assistant",
          text: answer,
          structured,
          time: new Date().toLocaleTimeString(),
        };
        return [...prev, nextMessage].slice(-40);
      });
    } catch {
      if (requestId !== aiRequestSeqRef.current) return;
      setAiBridgeStatus("error");
      const fallbackStructured = lastValidAIResponse || buildAIFailureFallback(sanitizedBrainPayload);
      const fallback = formatAIResponseMessage(fallbackStructured);
      setAiMessages((prev) => {
        const fallbackMessage: AIMessage = {
          id: Date.now() + 1,
          role: "assistant",
          text: fallback,
          structured: fallbackStructured,
          time: new Date().toLocaleTimeString(),
        };
        return [...prev, fallbackMessage].slice(-40);
      });
    } finally {
      aiInFlightRef.current = false;
      setAiThinking(false);
    }
  }

  function runAIQuickAction(action: "analyze" | "entry" | "risk" | "manage" | "session") {
    const actionPrompts: Record<"analyze" | "entry" | "risk" | "manage" | "session", string> = {
      analyze: "Analyze the current market using live terminal context.",
      entry: "What is the best entry plan right now? Is execution allowed, waiting, blocked, or sniper watch?",
      risk: "Check current risk, invalidation, and whether entry is safe.",
      manage: "Manage the active trade if one exists. If none exists, explain what to monitor.",
      session: "Analyze current session quality and what setups are preferred.",
    };
    sendAIMessage(actionPrompts[action]);
  }

  useEffect(() => {
    if (!aiOpen || aiTab !== "chat") return;
    requestAnimationFrame(() => {
      aiMessagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, [aiMessages, aiThinking, aiOpen, aiTab]);

  useEffect(() => {
    if (!aiOpen) return;

    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, [aiOpen]);

  useEffect(() => {
    const plan = decisionPlan;
    const markerTime = plan.markerTime || signalPlan.markerTime;
    const markerPrice = plan.entry || signalPlan.markerPrice;
    const direction = plan.direction || signalPlan.direction;
    const quality = plan.quality || signalPlan.confidence;
    const maturePhase = plan.phase === "EXECUTE" || plan.phase === "VALIDATED";
    const scoreGate = plan.phase === "EXECUTE" ? PRECISION_RULES.minExecuteQuality : PRECISION_RULES.minWatchQuality;
    const lastLiveBar = Number(lastCandleRef.current?.time || 0);
    const closedSignalBar = Number(markerTime || 0) < lastLiveBar;
    const shouldMark = Boolean(direction && markerTime && markerPrice && maturePhase && quality >= scoreGate && closedSignalBar && eliteSignalAllowed);

    if (!shouldMark || !direction || !markerTime || !markerPrice) {
      visualSignalKeyRef.current = `${timeframe}-${plan.phase}-${signalPlan.state}`;
      return;
    }

    const cooldownBars = timeframe === "1m" ? 10 : timeframe === "5m" ? 8 : 5;
    const tfSec = TF_SECONDS[timeframe] || 300;
    const nowBar = Number(markerTime);
    const prevSmart = smartSignalRef.current;
    const sameDirection = prevSmart?.direction === direction;
    const oppositeDirection = Boolean(prevSmart?.direction && prevSmart.direction !== direction);
    const inCooldown = Boolean(prevSmart && nowBar - Number(prevSmart.barTime || 0) < cooldownBars * tfSec);
    const stronger = !prevSmart || quality >= prevSmart.quality + 10 || plan.phase === "EXECUTE";

    if (sameDirection && inCooldown && !stronger) return;

    const stateForMarker: SignalState = direction === "LONG"
      ? plan.phase === "EXECUTE" ? "CONFIRMED LONG" : "WATCH LONG"
      : plan.phase === "EXECUTE" ? "CONFIRMED SHORT" : "WATCH SHORT";
    const key = `${selectedSymbol}-${timeframe}-${activeTradeMode}-${direction}-${plan.phase}-${markerTime}`;
    if (visualSignalKeyRef.current === key) return;
    visualSignalKeyRef.current = key;

    smartSignalRef.current = { key, direction, quality, phase: plan.phase, barTime: nowBar, expiresAt: Date.now() + cooldownBars * tfSec * 1000 };
    smartSignalCooldownRef.current = cooldownBars;

    if (signalMarkerDebounceRef.current) {
      window.clearTimeout(signalMarkerDebounceRef.current);
    }
    signalMarkerDebounceRef.current = window.setTimeout(() => {
      setSignalMarkers((prev) => {
        const cleaned = prev.filter((marker) => {
          if (marker.timeframe !== timeframe) return true;
          if (marker.direction === direction && nowBar - marker.time < cooldownBars * tfSec) return false;
          return true;
        });
        if (cleaned.some((marker) => marker.key === key)) return cleaned;
        const nextMarker: SignalMarker = {
          id: Number(markerTime),
          key,
          timeframe,
          time: markerTime,
          price: markerPrice,
          state: stateForMarker,
          direction: direction as Exclude<SignalDirection, null>,
          confidence: quality,
        };
        return [...cleaned, nextMarker].slice(-PRECISION_RULES.maxSignalMemory);
      });
      signalMarkerDebounceRef.current = null;
    }, 120);
    return () => {
      if (signalMarkerDebounceRef.current) window.clearTimeout(signalMarkerDebounceRef.current);
    };
  }, [decisionPlan.id, decisionPlan.phase, decisionPlan.direction, decisionPlan.markerTime, decisionPlan.entry, decisionPlan.quality, signalPlan.state, signalPlan.markerTime, signalPlan.markerPrice, signalPlan.shouldMark, signalPlan.direction, signalPlan.confidence, timeframe, eliteSignalAllowed, selectedSymbol, activeTradeMode]);


  useEffect(() => {
    if (!eliteSignalAllowed || !decisionPlan.direction || decisionPlan.phase !== "EXECUTE" || !decisionPlan.entry) return;

    const id = `${selectedSymbol}-${timeframe}-${decisionPlan.direction}-${decisionPlan.markerTime || Date.now()}`;
    const exists = eliteJournal.some((entry) => entry.id === id);
    if (exists) return;

    const entry: EliteJournalEntry = {
      id,
      time: new Date().toLocaleString(),
      symbol: selectedSymbol,
      timeframe,
      session,
      setup: setupKey,
      side: decisionPlan.direction,
      entry: decisionPlan.entry,
      score: Math.max(decisionPlan.quality, eliteAIScore),
      result: "OPEN",
      reason: `${v25FinalBrain.reason} MTF ${mtfConfluence.bias}/${mtfConfluence.score}% · AI ${eliteAIScore}% · Session ${sessionSniper.mode}`,
    };

    const timer = window.setTimeout(() => {
      setEliteJournal((prev) => {
        const next = [entry, ...prev].slice(0, PRECISION_RULES.journalLimit);
        storageSet(eliteJournalKey(), next);
        return next;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [eliteSignalAllowed, decisionPlan.phase, decisionPlan.direction, decisionPlan.entry, decisionPlan.markerTime, decisionPlan.quality, selectedSymbol, timeframe, eliteAIScore, mtfConfluence.bias, mtfConfluence.score, v25FinalBrain.reason, eliteJournal, session, setupKey, sessionSniper.mode]);


  useEffect(() => {
    if (!livePrice || !dynamicTradePlan) return;

    const timer = window.setTimeout(() => {
      setEliteJournal((prev) => {
        let changed = false;
        const next = prev.map((entry) => {
          if (entry.result !== "OPEN") return entry;

          const closed = resolveEliteJournalClose(entry, livePrice, dynamicTradePlan);
          if (!closed) return entry;
          changed = true;

          return {
            ...entry,
            exit: closed.exit,
            pnl: closed.pnl,
            roi: closed.roi,
            result: closed.result,
            closeReason: closed.closeReason,
            closedAt: new Date().toLocaleString(),
          };
        });

        if (changed) {
          storageSet(eliteJournalKey(), next);

          const lastClosed = next.find((item, idx) => prev[idx]?.result === "OPEN" && item.result !== "OPEN");
          if (lastClosed) {
            const updated = updateLearningStats(
              learningStats,
              lastClosed.result === "WIN",
              lastClosed.session || session,
              lastClosed.symbol,
              lastClosed.setup || setupKey
            );
            setLearningStats(updated);
            storageSet(learningStatsKey(), updated);
          }
        }

        return changed ? next : prev;
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [livePrice, dynamicTradePlan, learningStats, session, setupKey]);

  useEffect(() => {
    if (!externalAlertSettings.enabled || !externalAlertSettings.autoDiscordSignals || !externalAlertSettings.discordWebhook) return;
    const payload = buildDiscordSignalPayload({ symbol: selectedSymbol, brain });
    if (!payload) return;
    if (payload.confidence < externalAlertSettings.minSignalConfidence) return;
    let cancelled = false;
    void sendDiscordSignal({
      webhook: externalAlertSettings.discordWebhook,
      payload,
      cooldownMs: 90_000,
    }).then((result) => {
      if (cancelled) return;
      setDiscordSentState(result.sent);
      if (result.sent) {
        sendExternalAlert(
          "WOLVRENE DECISION SIGNAL",
          `${payload.direction} ${payload.symbol} at ${formatPrice(payload.entry)}`,
          buildCompactDiscordSignal("WOLVRENE DECISION SIGNAL")
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [externalAlertSettings.enabled, externalAlertSettings.autoDiscordSignals, externalAlertSettings.discordWebhook, externalAlertSettings.minSignalConfidence, selectedSymbol, brain, sendExternalAlert]);


  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      updateSessionClock();
      getMarketStats();
    }, 0);

    const clockTimer = setInterval(updateSessionClock, 1000);
    const statsTimer = setInterval(getMarketStats, 15000);

    return () => {
      window.clearTimeout(initialTimer);
      clearInterval(clockTimer);
      clearInterval(statsTimer);
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;

    chartAliveRef.current = false;
    chartRef.current.innerHTML = "";

    const chart = createChart(chartRef.current, {
      width: Math.max(chartRef.current.clientWidth || 0, 320),
      height: fullscreen ? 720 : 520,
      layout: {
        background: { color: settings.backgroundColor },
        textColor: settings.textColor,
      },
      grid: {
        vertLines: { color: settings.showGrid ? settings.gridColor : "transparent" },
        horzLines: { color: settings.showGrid ? settings.gridColor : "transparent" },
      },
      rightPriceScale: { borderColor: "#2b2b31" },
      timeScale: {
        borderColor: "#2b2b31",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 0,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: settings.bullColor,
      downColor: settings.bearColor,
      borderUpColor: settings.bullColor,
      borderDownColor: settings.bearColor,
      wickUpColor: settings.bullColor,
      wickDownColor: settings.bearColor,
      priceLineVisible: true,
    });

    chartApiRef.current = chart;
    candleSeriesRef.current = candleSeries;
    chartAliveRef.current = true;

    reloadCandles();

    requestAnimationFrame(() => {
      if (!chartAliveRef.current || !chartRef.current || !chartApiRef.current) return;
      chartApiRef.current.applyOptions({ width: Math.max(chartRef.current.clientWidth || 0, 320), height: fullscreen ? 720 : 520 });
      chartApiRef.current.timeScale().fitContent();
    });

    const resizeObserver = new ResizeObserver(() => {
      if (!chartAliveRef.current || !chartRef.current || !chartApiRef.current) return;
      requestAnimationFrame(() => {
        if (!chartAliveRef.current || !chartRef.current || !chartApiRef.current) return;
        chartApiRef.current.applyOptions({ width: Math.max(chartRef.current.clientWidth || 0, 320), height: fullscreen ? 720 : 520 });
      });
    });

    resizeObserver.observe(chartRef.current);

    return () => {
      chartAliveRef.current = false;
      resizeObserver.disconnect();
      candleSeriesRef.current = null;
      lastCandleRef.current = null;
      chartApiRef.current = null;

      try {
        chart.remove();
      } catch {}
    };
  }, [timeframe, settings, fullscreen, reloadCandles, selectedSymbol]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let pingTimer: NodeJS.Timeout | null = null;
    let fallbackTimer: NodeJS.Timeout | null = null;
    let manualClose = false;

    const setStatus = (text: string) => {
      if (statusTextRef.current) statusTextRef.current.textContent = text;
    };

    const updateLiveCandle = (price: number) => {
      if (!chartAliveRef.current) return;

      const series = candleSeriesRef.current;
      const lastCandle = lastCandleRef.current;
      if (!series || !lastCandle) return;

      // Symbol-mismatch protection:
      // When switching assets, an old WebSocket tick can arrive for the previous symbol.
      // If the tick is far away from the current candle scale, ignore it and reload the correct symbol.
      const ratio = price / Math.max(lastCandle.close, 1);
      if (ratio > 2.5 || ratio < 0.4) {
        reloadCandles();
        return;
      }

      const tf = TF_SECONDS[timeframeRef.current];
      const now = Math.floor(Date.now() / 1000);
      const currentCandleTime = Math.floor(now / tf) * tf;

      const updatedCandle: Candle =
        currentCandleTime > lastCandle.time
          ? { time: currentCandleTime, open: price, high: price, low: price, close: price }
          : {
              ...lastCandle,
              high: Math.max(lastCandle.high, price),
              low: Math.min(lastCandle.low, price),
              close: price,
            };

      try {
        candleSeriesRef.current?.update(toChartCandle(updatedCandle));
        lastCandleRef.current = updatedCandle;
        setRecentCandles((prev) => { const sameBar = prev.length && prev[prev.length - 1]?.time === updatedCandle.time; const next = sameBar ? [...prev.slice(0, -1), updatedCandle] : [...prev, updatedCandle]; return next.slice(-PRECISION_RULES.candleHistory); });
      } catch {}
    };

    const handleLivePrice = (price: number) => {
      if (!Number.isFinite(price) || price <= 0) return;

      setLivePrice(price);
      lastTickMsRef.current = Date.now();

      if (priceTextRef.current) {
        priceTextRef.current.textContent = price.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }

      if (lastTickTextRef.current) lastTickTextRef.current.textContent = "0.0s ago";
      if (latencyTextRef.current) latencyTextRef.current.textContent = "< 1s";

      updateLiveCandle(price);
      checkAlertsAndOrders(price);
    };

    const fetchTickerFallback = async () => {
      try {
        const res = await fetch(
          `https://api.bitget.com/api/v2/mix/market/ticker?symbol=${selectedSymbolRef.current}&productType=USDT-FUTURES`,
          { cache: "no-store" }
        );
        const data = await res.json();
        const rawPrice = data?.data?.[0]?.lastPr || data?.data?.lastPr;
        if (rawPrice) handleLivePrice(Number(rawPrice));
      } catch (error) {
        console.warn("WOLVRENE ticker fallback failed", error);
      }
    };

    const connect = () => {
      manualClose = false;
      setStatus("CONNECTING");
      ws = new WebSocket("wss://ws.bitget.com/v2/ws/public");

      ws.onopen = () => {
        setStatus("LIVE");

        ws?.send(
          JSON.stringify({
            op: "subscribe",
            args: [{ instType: "USDT-FUTURES", channel: "ticker", instId: selectedSymbolRef.current }],
          })
        );

        pingTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send("ping");
        }, 20000);
      };

      ws.onmessage = (event) => {
        if (event.data === "pong") return;

        let msg: unknown;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (!msg || typeof msg !== "object" || !("data" in msg)) return;
        const payload = msg as { data?: Array<{ lastPr?: string }> };
        const lastPriceRaw = payload.data?.[0]?.lastPr;
        if (!lastPriceRaw) return;

        const price = Number(lastPriceRaw);
        handleLivePrice(price);
      };

      ws.onclose = () => {
        if (pingTimer) clearInterval(pingTimer);
        if (manualClose) return;
        setStatus("RECONNECTING");
        reconnectTimer = setTimeout(connect, 1000);
      };

      ws.onerror = () => {
        setStatus("ERROR");
        ws?.close();
      };
    };

    connect();
    fetchTickerFallback();
    reloadCandles();
    fallbackTimer = setInterval(() => {
      fetchTickerFallback();
      if (!lastCandleRef.current) reloadCandles();
    }, 2000);

    const tickAgeTimer = setInterval(() => {
      if (!lastTickMsRef.current || !lastTickTextRef.current) return;
      const seconds = (Date.now() - lastTickMsRef.current) / 1000;
      lastTickTextRef.current.textContent = `${seconds.toFixed(1)}s ago`;
    }, 500);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        reloadCandles();
        if (!ws || ws.readyState === WebSocket.CLOSED) connect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      manualClose = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(tickAgeTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      if (fallbackTimer) clearInterval(fallbackTimer);
      ws?.close();
    };
  }, [reloadCandles, selectedSymbol]);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!dragTarget) return;
      const nextPrice = coordinateToPrice(e.clientY);
      if (!nextPrice) return;

      if (dragTarget.type === "alert") updateAlertLine(dragTarget, nextPrice);
      else updateOrderLine(dragTarget, nextPrice);
    }

    function handleMouseUp() {
      const target = dragTarget;

      if (target) {
        addJournal("Chart line updated by drag");

        if (target.type === "alert") {
          openLineEditor({ type: "alert", alertId: target.alertId });
        }

        if (target.type === "entry") {
          setSelectedOrderId(target.orderId);
          openLineEditor({ type: "entry", orderId: target.orderId });
        }

        if (target.type === "sl") {
          setSelectedOrderId(target.orderId);
          openLineEditor({ type: "sl", orderId: target.orderId });
        }

        if (target.type === "tp") {
          setSelectedOrderId(target.orderId);
          openLineEditor({ type: "tp", orderId: target.orderId, tpId: target.tpId });
        }
      }

      setDragTarget(null);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragTarget]);

  const LineButton = ({
    top,
    color,
    label,
    value,
    dashed = false,
    onMouseDown,
    onClick,
    onDelete,
    hit,
  }: {
    top: number | null;
    color: string;
    label: string;
    value: number;
    dashed?: boolean;
    onMouseDown: () => void;
    onClick: () => void;
    onDelete?: () => void;
    hit?: boolean;
  }) => {
    if (top === null) return null;

    const activeColor = hit ? "#ef4444" : color;
    const isGreen = activeColor.toLowerCase().includes("22c55e") || activeColor.toLowerCase().includes("14b8a6");
    const isYellow = activeColor.toLowerCase().includes("facc15") || activeColor.toLowerCase().includes("d89b00");
    const subtleBg = hit
      ? "rgba(239,68,68,0.14)"
      : isGreen
      ? "rgba(34,197,94,0.13)"
      : isYellow
      ? "rgba(250,204,21,0.13)"
      : "rgba(239,68,68,0.13)";

    const solidBg = hit
      ? "#ef4444"
      : isGreen
      ? "#00c087"
      : isYellow
      ? "#facc15"
      : "#ef4444";

    const textColor = isYellow && !hit ? "#111111" : "#ffffff";

    return (
      <div
        className="absolute left-0 right-0 z-20 group select-none"
        style={{ top }}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMouseDown();
          }}
          className={`h-0 cursor-row-resize ${dashed ? "border-t border-dashed" : "border-t"}`}
          style={{ borderColor: activeColor, opacity: hit ? 0.95 : 0.78 }}
        />

        <div
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMouseDown();
          }}
          className="absolute right-1 -top-[10px] flex h-[20px] items-center cursor-row-resize text-[10px] font-bold tracking-tight drop-shadow-[0_0_8px_rgba(0,0,0,0.85)]"
        >
          <span
            className="h-[20px] flex items-center rounded-l-[3px] border px-2 uppercase"
            style={{
              backgroundColor: subtleBg,
              borderColor: activeColor,
              color: activeColor,
              boxShadow: `0 0 10px ${subtleBg}`,
            }}
          >
            {hit ? "HIT" : label}
          </span>

          <span
            className="h-[20px] flex items-center rounded-r-[3px] px-2 font-black"
            style={{ backgroundColor: solidBg, color: textColor }}
          >
            {formatPrice(value)}
          </span>

          {onDelete && (
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragTarget(null);
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setLineEditor(null);
                setDragTarget(null);
                onDelete();
              }}
              className="ml-[2px] hidden h-[20px] w-[20px] items-center justify-center rounded-[3px] border border-red-500/70 bg-red-500/15 text-[11px] font-black text-red-300 hover:bg-red-500 hover:text-white group-hover:flex"
              title="Delete"
            >
              ×
            </button>
          )}
        </div>
      </div>
    );
  };

  const editorCurrentPrice = useMemo(() => {
    if (!lineEditor) return 0;

    if (lineEditor.type === "alert") {
      return alerts.find((alert) => alert.id === lineEditor.alertId)?.price || 0;
    }

    const order = editorOrder();
    if (!order) return 0;

    if (lineEditor.type === "entry") return order.entry;
    if (lineEditor.type === "sl") return order.sl;

    return editorTP()?.price || 0;
  }, [lineEditor, alerts, orders]);

  const editorOrderValue = editorOrder();
  const editorTPValue = editorTP();

  
  const selectedSymbolMeta = TRADE_SYMBOLS.find((item) => item.symbol === selectedSymbol) || TRADE_SYMBOLS[0];
  const selectedSymbolLabel = selectedSymbolMeta.label;
  const unifiedLiveContext = useMemo(() => ({
    symbol: selectedSymbol,
    timeframe,
    mode: activeTradeMode,
    livePrice,
    session,
    volatility: candlesSummary.volatility,
    trend: candlesSummary.trend,
    structure: structureState,
    liquidity: liquidityState,
    openTrade: activeExecutionTrade || selectedOrder || null,
    activeSignal: decisionPlan,
    aiDecision: v25FinalBrain.action,
    riskSettings: { marginMode, leverage: executionLeverage, riskPerTradePct: "--" },
    journalStats: realAccuracyStats,
    heartbeat: lastEngineHeartbeat,
  }), [selectedSymbol, timeframe, activeTradeMode, livePrice, session, candlesSummary.volatility, candlesSummary.trend, structureState, liquidityState, activeExecutionTrade, selectedOrder, decisionPlan, v25FinalBrain.action, marginMode, executionLeverage, realAccuracyStats, lastEngineHeartbeat]);
  const unifiedRadarMode =
    v25FinalBrain.action === "ENTER NOW"
      ? "HUNT READY"
      : v25FinalBrain.action === "WAIT RETEST" || v25FinalBrain.action === "PRE-SIGNAL"
      ? "WATCHING"
      : v25FinalBrain.action === "FILTERED"
      ? "SCANNING"
      : "PRECISION MODE";

  if (accessStatus !== "granted") {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#18120a_0%,#070707_42%,#000_100%)] p-4 text-white">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center">
          <div className="w-full max-w-xl rounded-3xl border border-yellow-500/20 bg-[#101014]/95 p-8 shadow-[0_0_60px_rgba(0,0,0,0.75)]">
            <div className="mb-6 text-center">
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.28em] text-yellow-500">Private Terminal</p>
              <h1 className="text-4xl font-black tracking-[0.08em]" style={{ color: gold, textShadow: "0 0 18px rgba(216,155,0,0.55)" }}>
                WOLVRENE
              </h1>
              <p className="mt-3 text-sm text-gray-400">Institutional AI Pro is available for active VIP members only.</p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black/50 p-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500">
                VIP Email
              </label>
              <input
                value={accessEmail}
                onChange={(event) => setAccessEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") verifyAccess();
                }}
                placeholder="email used on Whop"
                className="h-12 w-full rounded-xl border border-zinc-800 bg-black px-4 text-sm text-white outline-none transition placeholder:text-gray-700 focus:border-yellow-600"
              />

              {accessError && (
                <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">{accessError}</p>
              )}

              <button
                onClick={() => verifyAccess()}
                disabled={accessLoading || accessStatus === "checking"}
                className="mt-4 h-12 w-full rounded-xl bg-yellow-500 text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {accessLoading || accessStatus === "checking" ? "Checking Access..." : "Unlock Terminal"}
              </button>

              <a
                href={WOLVRENE_ACCESS_CONFIG.whopLink}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex h-12 w-full items-center justify-center rounded-xl border border-zinc-800 bg-[#151519] text-sm font-black text-yellow-400 transition hover:border-yellow-600"
              >
                Subscribe / Renew VIP
              </a>

              <p className="mt-4 text-center text-xs text-gray-500">{WOLVRENE_ACCESS_CONFIG.supportText}</p>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 text-center text-[10px] uppercase tracking-wide text-gray-500">
              <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">Whop Ready</div>
              <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">VIP Locked</div>
              <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">Private SaaS</div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      onClick={() => setContextMenu({ open: false, x: 0, y: 0, price: 0 })}
      className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#101318_0%,#06080a_40%,#030405_100%)] px-2 py-3 text-[#f4f4f5] md:px-4 md:py-4"
    >
      <div className={fullscreen ? "mx-auto w-full max-w-[1940px]" : "mx-auto w-full max-w-[1780px]"}>
        <div className={`${terminalPanel} mb-3 p-2.5 md:p-3`}>
          <div className="grid gap-2 xl:grid-cols-[320px_repeat(5,minmax(0,1fr))_auto]">
            <div className="flex items-center gap-3 rounded-xl border border-[#2a1f14] bg-black/40 px-3 py-2">
              <img src="/wolvrene-logo.png" alt="Wolvrene Logo" className="h-11 w-11 object-contain" />
              <div>
                <h1 className="text-xl font-black tracking-[0.08em] text-[#ff8a00]">WOLVRENE X</h1>
                <p className="text-[11px] text-[#8b9098]">We Don&apos;t Chase. We Hunt.</p>
              </div>
            </div>

            <div className="relative rounded-xl border border-[#2a1f14] bg-black/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#8b9098]">Market</p>
              <button
                onClick={() => setAssetMenuOpen((open) => !open)}
                className="flex items-center gap-2 mt-1 text-sm font-bold text-[#ffc247] transition hover:text-yellow-400"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-[10px]">
                  {selectedSymbolMeta.icon}
                </span>
                {selectedSymbolLabel}
                <span className="text-[10px] text-gray-500">▼</span>
              </button>
              {assetMenuOpen && (
                <div className="absolute left-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-zinc-800 bg-[#101014] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.65)]">
                  {TRADE_SYMBOLS.map((item) => (
                    <button
                      key={item.symbol}
                      onClick={() => {
                        setSelectedSymbol(item.symbol);
                        setAssetMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-black transition ${
                        selectedSymbol === item.symbol
                          ? "bg-yellow-500/15 text-yellow-300"
                          : "text-gray-400 hover:bg-yellow-500/10 hover:text-yellow-400"
                      }`}
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-[10px]">
                        {item.icon}
                      </span>
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-[#2a1f14] bg-black/40 px-3 py-2">
              <div className="flex justify-between items-start">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#8b9098]">Live Price</p>
                <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 animate-pulse">
                  LIVE
                </span>
              </div>
              <p ref={priceTextRef} className="mt-1 text-sm font-bold text-[#00e676]">Loading...</p>
            </div>
            <div className="rounded-xl border border-[#2a1f14] bg-black/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#8b9098]">Session</p>
              <p className="mt-1 text-sm font-bold">{session}</p>
            </div>
            <div className="rounded-xl border border-[#2a1f14] bg-black/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#8b9098]">AI Mode</p>
              <p className="mt-1 text-sm font-bold text-[#ff8a00]">{unifiedRadarMode}</p>
            </div>
            <div className="rounded-xl border border-[#2a1f14] bg-black/40 px-3 py-2">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-[#8b9098]">
                <span>Confidence</span>
                <span>{v25FinalBrain.confidence}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/70">
                <div className="h-full bg-gradient-to-r from-[#ff8a00] to-[#ffc247]" style={{ width: `${v25FinalBrain.confidence}%` }} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-1.5">
              <div className="hidden rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-right text-[10px] text-green-300 md:block">
                <p className="font-black uppercase tracking-wide">VIP Access</p>
                <button onClick={logoutAccess} className="text-gray-500 hover:text-red-300">Logout</button>
              </div>
              <button
                onClick={() => setSettingsOpen(true)}
                className="h-10 px-4 rounded-xl bg-[#16161c] border border-[#2d2d35] text-sm hover:border-yellow-600 hover:text-yellow-400 transition"
              >
                ⚙
              </button>
              <button
                onClick={() => setFullscreen(!fullscreen)}
                className="h-10 px-4 rounded-xl bg-[#16161c] border border-[#2d2d35] text-sm hover:border-yellow-600 hover:text-yellow-400 transition"
              >
                {fullscreen ? "⤢" : "⛶"}
              </button>
            </div>
          </div>
        </div>

      <div className="mb-3 grid gap-2 flex-wrap md:grid-cols-6">
        {[
          ["24H High", `$${marketStats.high}`],
          ["24H Low", `$${marketStats.low}`],
          ["24H Volume", marketStats.volume],
          ["24H Change", marketStats.change],
          ["Funding", marketStats.funding],
          ["Funding ETA", sessionCountdown],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[#2a1f14] bg-black/40 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#8b9098]">{label}</p>
            <p className="mt-1 text-sm font-bold">{value}</p>
          </div>
        ))}
      </div>

      
      {terminalTab !== "dashboard" && (
        <div className={`${card} mb-4 p-4`}>
          {terminalTab === "radar" && (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className={`${card} p-3`}><p className="text-xs text-zinc-400">Market Radar Status</p><p className="text-lg font-bold text-amber-300">{marketRadarIntelligence?.state || "Unavailable"}</p><p className="text-xs text-zinc-500">{marketRadarIntelligence?.decisionSummary || "Waiting for data"}</p></div>
                <div className={`${card} p-3`}><p className="text-xs text-zinc-400">Core Exchange Intelligence</p><p className="text-lg font-bold text-emerald-300">{marketRadarIntelligence && marketRadarIntelligence.state !== "DATA_UNAVAILABLE" ? "Active" : "Partial"}</p></div>
                <div className={`${card} p-3`}><p className="text-xs text-zinc-400">Professional Data Providers</p><p className="text-lg font-bold text-zinc-300">Optional / Not configured</p></div>
              </div>
              <MarketRadarPanel
                defaultSymbol={normalizedRadarSymbol}
                defaultInterval={timeframe}
                defaultExchange="bitget"
                onIntelligenceChange={(intelligence) => {
                  setMarketRadarIntelligence(intelligence);
                  setMarketRadarSource("panel-callback");
                }}
              />
            </div>
          )}
          {terminalTab === "analytics" && (
            <div>
              <h3 className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-yellow-400">Accuracy Analytics</h3>
              <div className="grid gap-3 text-sm md:grid-cols-4">
                <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
                  <p className="text-gray-500">Signals</p>
                  <p className="text-2xl font-black">{eliteAnalytics.totalSignals}</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
                  <p className="text-gray-500">Avg Score</p>
                  <p className="text-2xl font-black text-yellow-400">{eliteAnalytics.avgScore}%</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
                  <p className="text-gray-500">Real Win Rate</p>
                  <p className="text-2xl font-black text-green-400">{eliteAnalytics.winRate || 0}%</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
                  <p className="text-gray-500">Best Session</p>
                  <p className="text-lg font-black text-cyan-400">{eliteAnalytics.bestSession || "Waiting"}</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
                  <p className="text-gray-500">Open Trades</p>
                  <p className="text-2xl font-black text-cyan-400">{eliteAnalytics.openTrades}</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
                  <p className="text-gray-500">Wins / Losses</p>
                  <p className="text-2xl font-black"><span className="text-green-400">{eliteAnalytics.wins}</span> / <span className="text-red-400">{eliteAnalytics.losses}</span></p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
                  <p className="text-gray-500">Learning</p>
                  <p className="text-2xl font-black text-yellow-400">{eliteAnalytics.learningTotal || 0}</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
                  <p className="text-gray-500">Noise</p>
                  <p className={eliteAnalytics.noiseWarning ? "text-2xl font-black text-red-400" : "text-2xl font-black text-green-400"}>
                    {eliteAnalytics.noiseWarning ? "ON" : "OFF"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {terminalTab === "journal" && (
            <div>
              <h3 className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-yellow-400">Trade Journal</h3>
              <div className="max-h-[360px] space-y-2 overflow-auto text-xs">
                {eliteJournal.length === 0 && (
                  <p className="text-gray-500">No elite journal entries yet. Only EXECUTE signals that pass AI + MTF gate are stored.</p>
                )}
                {eliteJournal.slice(0, 40).map((j) => (
                  <div key={j.id} className="rounded-xl border border-zinc-800 bg-black/40 p-3">
                    <div className="flex items-center justify-between">
                      <span className={j.side === "LONG" ? "font-black text-green-400" : "font-black text-red-400"}>
                        {j.symbol} · {j.side}
                      </span>
                      <span className="text-gray-500">{j.result} · {j.score}% {j.closeReason ? `· ${j.closeReason}` : ""}</span>
                    </div>
                    <div className="mt-2 grid gap-2 text-gray-400 md:grid-cols-3">
                      <span>TF: {j.timeframe}</span>
                      <span>Entry: {formatPrice(j.entry)}</span>
                      <span>Session: {j.session || "Unknown"}</span>
                      <span>{j.exit ? `Exit: ${formatPrice(j.exit)}` : "Open"}</span>
                      <span>{typeof j.pnl === "number" ? `PnL: ${j.pnl.toFixed(2)}` : ""}</span>
                      <span>{j.closedAt || j.time}</span>
                    </div>
                    <p className="mt-2 text-gray-500">{j.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {terminalTab === "backtest" && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-[0.18em] text-yellow-400">Strategy Tester</h3>
                <select
                  value={backtestRange}
                  onChange={(e) => setBacktestRange(Number(e.target.value) as 100 | 500 | 1000)}
                  className="rounded-lg border border-zinc-800 bg-black px-2 py-1 text-xs"
                >
                  <option value={100}>100 candles</option>
                  <option value={500}>500 candles</option>
                  <option value={1000}>1000 candles</option>
                </select>
              </div>
              <div className="grid gap-3 text-sm md:grid-cols-5">
                <div className="rounded-xl border border-zinc-800 bg-black/40 p-3"><p className="text-gray-500">Signals</p><p className="text-2xl font-black">{backtestStats.trades}</p></div>
                <div className="rounded-xl border border-zinc-800 bg-black/40 p-3"><p className="text-gray-500">Wins</p><p className="text-2xl font-black">{backtestStats.wins}</p></div>
                <div className="rounded-xl border border-zinc-800 bg-black/40 p-3"><p className="text-gray-500">Win Rate</p><p className="text-2xl font-black text-green-400">{backtestStats.winRate.toFixed(2)}%</p></div>
                <div className="rounded-xl border border-zinc-800 bg-black/40 p-3"><p className="text-gray-500">PF</p><p className="text-2xl font-black text-yellow-400">{backtestStats.profitFactor.toFixed(2)}</p></div>
                <div className="rounded-xl border border-zinc-800 bg-black/40 p-3"><p className="text-gray-500">Best Session</p><p className="text-xl font-black text-cyan-400">{backtestStats.bestSession}</p></div>
              </div>
            </div>
          )}

          {terminalTab === "pro" && (
            <div>
              <h3 className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-yellow-400">Institutional AI Pro</h3>
              <div className="grid gap-3 text-sm md:grid-cols-3">
                <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
                  <p className="text-gray-500">Session Sniper</p>
                  <p className="text-xl font-black text-yellow-400">{sessionSniper.mode}</p>
                  <p className="mt-1 text-xs text-gray-500">{sessionSniper.reason}</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
                  <p className="text-gray-500">Live Trade</p>
                  <p className={activeExecutionTradeView ? "text-xl font-black text-green-400" : "text-xl font-black text-gray-400"}>
                    {activeExecutionTradeView ? `${activeExecutionTradeView.side} ${activeExecutionTradeView.status}` : "NO ACTIVE TRADE"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    PnL: {activeExecutionTradeView && livePrice ? (((activeExecutionTradeView.side === "LONG" ? livePrice - activeExecutionTradeView.entry : activeExecutionTradeView.entry - livePrice) * activeExecutionTradeView.size).toFixed(2)) : "0.00"} · BE: {activeExecutionTradeView?.status === "BREAKEVEN" ? "YES" : "NO"}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
                  <p className="text-gray-500">Dynamic TP/SL</p>
                  <p className="text-xl font-black text-cyan-400">{dynamicTradePlan ? (dynamicTradePlan.protected ? "PROTECTED" : "ACTIVE") : "WAITING"}</p>
                  <p className="mt-1 text-xs text-gray-500">Trail: {dynamicTradePlan?.trailing ? "ON" : "OFF"} · Extend: {dynamicTradePlan?.extensionAllowed ? "YES" : "NO"}</p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                <div className="rounded-xl border border-zinc-800 bg-black/40 p-3"><p className="text-gray-500">Learning Wins</p><p className="text-2xl font-black text-green-400">{learningStats.wins}</p></div>
                <div className="rounded-xl border border-zinc-800 bg-black/40 p-3"><p className="text-gray-500">Learning Losses</p><p className="text-2xl font-black text-red-400">{learningStats.losses}</p></div>
                <div className="rounded-xl border border-zinc-800 bg-black/40 p-3"><p className="text-gray-500">Adaptive Boost</p><p className="text-2xl font-black text-yellow-400">{learningBoost}</p></div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[84px_280px_minmax(0,1fr)_350px]">
          {!hideUI && (
            <aside className={`${terminalPanel} flex flex-col items-center gap-2 p-2.5`}>
              {[
                { label: "Dashboard", icon: "▦", tab: "dashboard" as const },
                { label: "Signal Feed", icon: "◉", tab: "dashboard" as const },
                { label: "Market Radar", icon: "◈", tab: "radar" as const },
                { label: "Analytics", icon: "◫", tab: "analytics" as const },
                { label: "Journal", icon: "⌘", tab: "journal" as const },
                { label: "Backtest", icon: "⟲", tab: "backtest" as const },
                { label: "Pro Tools", icon: "✦", tab: "pro" as const },
                { label: "Settings", icon: "⚙", tab: "dashboard" as const },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    if (item.label === "Settings") setSettingsOpen(true);
                    else setTerminalTab(item.tab);
                  }}
                  className={`flex w-full items-center gap-2 rounded-xl border px-2 py-2 text-left text-[10px] font-bold transition ${
                    terminalTab === item.tab && item.label !== "Signal Feed"
                      ? "border-[#ff8a00] bg-[#ff8a00]/20 text-[#ff8a00]"
                      : "border-zinc-800 bg-black/40 text-[#8b9098] hover:border-[#ff8a00]/50 hover:text-[#ffc247]"
                  }`}
                  title={item.label}
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-[#2a1f14] bg-black/50 text-[11px]">
                    {item.icon}
                  </span>
                  <span className="leading-tight">{item.label}</span>
                </button>
              ))}
              <div className="mt-auto w-full">
                <div className="relative h-20 overflow-hidden rounded-xl border border-[#2a1f14]">
                  <img 
                    src="/wolvrene-console-wolf.png" 
                    alt="Wolvrene Wolf" 
                    className="absolute inset-0 h-full w-full object-cover opacity-60"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                </div>
                <div className="mt-1 rounded-xl border border-[#2a1f14] bg-black/40 p-2 text-center">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-[#8b9098]">WOLVRENE</p>
                  <p className="text-[9px] uppercase tracking-[0.12em] text-[#8b9098]">AI CORE</p>
                  <p className="text-[10px] font-black text-[#00e676]">ONLINE</p>
                </div>
              </div>
            </aside>
          )}

          {!hideUI && (
            <div className={`${terminalPanel} min-w-0 p-2.5 space-y-2`}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold tracking-[0.14em] text-[#f4f4f5]">SIGNAL FEED</h3>
                <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[9px] font-black text-green-300">LIVE</span>
              </div>
              <div className="mb-3 grid grid-cols-[1fr_auto] gap-2">
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-black/60 px-2 py-2 text-xs"
                >
                  {["1m", "3m", "5m", "15m", "30m", "1H", "4H", "1D"].map((tf) => (
                    <option key={tf} value={tf}>{tf}</option>
                  ))}
                </select>
                <button className="rounded-lg border border-zinc-800 bg-black/60 px-2 text-[10px] text-[#8b9098]">
                  {signalFeedRows.length}
                </button>
              </div>

              <div className="rounded-xl border border-amber-700/40 bg-black/50 p-2 text-xs">
                <div className="mb-1 flex items-center justify-between"><p className="font-bold text-amber-300">Market Radar</p><button onClick={() => setTerminalTab("radar")} className="rounded border border-amber-700/40 px-2 py-0.5 text-[10px] text-amber-300">Open Radar</button></div>
                <div className="grid grid-cols-2 gap-1 text-[10px] text-zinc-300">
                  <div>State: <span className="text-amber-200">{marketRadarLoading ? "RADAR_LOADING" : (marketRadarIntelligence?.state || "Unavailable")}</span></div>
                  <div>Bias: <span className="text-amber-200">{marketRadarIntelligence?.bias || "Unknown"}</span></div>
                  <div>Confidence: <span className="text-amber-200">{marketRadarIntelligence?.confidence ? `${marketRadarIntelligence.confidence.toFixed(1)}%` : "--"}</span></div>
                  <div>Core: <span className="text-amber-200">{marketRadarLoading ? "Loading radar..." : marketRadarIntelligence && marketRadarIntelligence.state !== "DATA_UNAVAILABLE" ? "Active" : "Partial"}</span></div>
                </div>
                <p className="mt-1 line-clamp-1 text-[10px] text-zinc-400">{marketRadarIntelligence?.decisionSummary || "Waiting for core exchange intelligence..."}</p>
                <p className="text-[10px] text-zinc-400">Providers: Optional</p>
                {process.env.NODE_ENV !== "production" && (
                  <p className="mt-1 text-[9px] text-zinc-500">
                    displayedSymbol={selectedSymbol} · normalizedRadarSymbol={normalizedRadarSymbol} · radarState={radarGate.radarState} · radarSource={marketRadarSource}
                  </p>
                )}
              </div>
              <div className="max-h-[360px] space-y-2 overflow-auto pr-1 [scrollbar-width:thin] [scrollbar-color:#3f3f46_transparent]">
                {signalFeedRows.length === 0 && <p className="text-xs text-[#8b9098]">No subscribed signal rows yet.</p>}
                {signalFeedRows.map((row, index) => (
                  <button
                    key={`${row.id}-${index}`}
                    onClick={() => {
                      setSelectedSignalId(row.id);
                      setTimeframe(row.timeframe);
                    }}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                      selectedSignalId === row.id
                        ? "border-[#ff8a00] bg-[#ff8a00]/10"
                        : "border-zinc-800 bg-black/30 hover:border-[#ff8a00]/40"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-[#8b9098]">
                      <span>{row.time} · {row.symbol} · {row.timeframe}</span>
                      <span className={`rounded-full px-1.5 py-0.5 font-bold ${row.side === "LONG" ? "bg-green-500/10 text-[#00e676]" : "bg-red-500/10 text-[#ff3b30]"}`}>{row.side}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-[#f4f4f5]">{row.status} · {row.confidence}%</p>
                    <div className="mt-1 flex flex-wrap gap-1 text-[9px]">
                      <span className="rounded border border-zinc-700 px-1 py-0.5">Radar {row.radarState}</span>
                      <span className={`rounded border px-1 py-0.5 ${row.radarGateResult === "PASSED" ? "border-green-700 text-green-300" : row.radarGateResult === "BLOCKED" ? "border-red-700 text-red-300" : row.radarGateResult === "WAITING" ? "border-yellow-700 text-yellow-300" : "border-zinc-700 text-zinc-300"}`}>{row.radarGateResult}</span>
                      <span className="rounded border border-zinc-700 px-1 py-0.5">{row.finalSignalSource}</span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-[#8b9098]">{row.gateReason}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="min-w-0">
            {terminalTab === "radar" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-amber-300">Market Radar</h2>
                  <button onClick={() => setTerminalTab("dashboard")} className="rounded border border-amber-700/40 px-3 py-1 text-xs text-amber-300">Back to Dashboard</button>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className={`${card} p-3`}><p className="text-xs text-zinc-400">Market Radar Status</p><p className="text-lg font-bold text-amber-300">{marketRadarIntelligence?.state || "Unavailable"}</p></div>
                  <div className={`${card} p-3`}><p className="text-xs text-zinc-400">Core Exchange Intelligence</p><p className="text-lg font-bold text-emerald-300">{marketRadarIntelligence && marketRadarIntelligence.state !== "DATA_UNAVAILABLE" ? "Active" : "Partial"}</p></div>
                  <div className={`${card} p-3`}><p className="text-xs text-zinc-400">Professional Data Providers</p><p className="text-sm text-zinc-300">Professional providers are optional and not configured. Core exchange intelligence remains active.</p></div>
                </div>
                <MarketRadarPanel defaultSymbol={selectedSymbol} defaultInterval={timeframe} defaultExchange="bitget" onIntelligenceChange={setMarketRadarIntelligence} />
              </div>
            ) : (
            !hideUI && (
              <>
                <div className="grid md:grid-cols-3 gap-3 mb-4">
                  <div className={`${card} p-4`}>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-gray-500 uppercase tracking-wider">Signal Lifecycle</p>
                      <span className="text-[10px] rounded-full bg-yellow-500/15 border border-yellow-600/30 px-2 py-0.5 text-yellow-400">{signalLifecycleState}</span>
                    </div>
                    <p className="mt-2 text-sm text-gray-300">{brainDecision.phase} · {brainDecision.direction || "WAIT"}</p>
                    <p className="mt-1 text-xs text-gray-500">Candidate / Waiting / Rejected / Executed / Managed / Cancelled</p>
                  </div>
                  <div className={`${card} p-4`}>
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider">Signal State</p>
                    {signalRejectionReasons.length ? (
                      <ul className="mt-2 space-y-1 text-xs text-yellow-500">
                        {signalRejectionReasons.slice(0, 3).map((reason) => <li key={reason}>• {reason}</li>)}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-green-400">Candidate valid. Waiting for trigger-to-execute alignment.</p>
                    )}
                  </div>
                  <div className={`${card} p-4`}>
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider">Fallback Watch</p>
                    <p className="mt-2 text-xs text-gray-300">
                      {brainDecision.phase === "SCANNING"
                        ? `No trade yet, watching for ${triggerValidation.direction || "directional trigger"} confirmation.`
                        : "Active setup live. Monitor invalidation and execution quality."}
                    </p>
                    <p className="mt-2 text-[11px] text-gray-500">Entry Grade: <span className="text-yellow-400 font-bold">{entryGrade}</span> · Cooldown cycles: {tradeRecalcCooldownCycles}</p>
                    <p className="mt-1 text-[11px] text-gray-500">Swing plan: {activeTradeMode === "SWING" ? `Bias ${brainDecision.direction || "WAIT"} · Zone ${brainDecision.entry ? formatPrice(brainDecision.entry) : "--"} · Invalid ${brainDecision.invalidation ? formatPrice(brainDecision.invalidation) : "--"}` : "Scalp mode active"}</p>
                  </div>
                </div>

                <div className="hidden">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-gray-300">Signal Feed</h3>
                    <span className="text-[10px] text-gray-500">{signalFeedRows.length} rows</span>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-auto">
                    {signalFeedRows.length === 0 && <p className="text-xs text-gray-500">No subscribed signal rows yet.</p>}
                    {signalFeedRows.map((row) => (
                      <button
                        key={row.id}
                        onClick={() => {
                          setSelectedSignalId(row.id);
                          setTimeframe(row.timeframe);
                        }}
                        className={`w-full text-left rounded-lg border px-2 py-1 text-[11px] ${selectedSignalId === row.id ? "border-yellow-600 bg-yellow-500/10" : "border-zinc-800 bg-black/30"}`}
                      >
                        {row.time} | {row.symbol} | {row.timeframe} | {row.mode} | {row.side} | {row.status} | {row.confidence}% | {row.reason}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )
            )}

            <div className={`${card} p-3 min-w-0 overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-lg font-bold">{selectedSymbolLabel} · {timeframe} · WOLVRENE PRECISION</h2>
                  <p className="text-[11px] text-gray-600">
                    Last Tick: <span ref={lastTickTextRef}>--</span> · Latency:{" "}
                    <span ref={latencyTextRef}>--</span>
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5 items-center rounded-2xl bg-black/50 border border-zinc-800 p-1.5">
                  {(["AUTO", "SCALP", "SWING"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => applyTradeModeSelection(mode)}
                      className={`h-7 min-w-12 px-2 rounded-lg text-[10px] border transition ${
                        tradeModeSelection === mode
                          ? "bg-yellow-600 border-yellow-500 text-black font-black"
                          : "bg-[#08080a] border-[#27272f] text-gray-300 hover:text-white hover:border-yellow-700"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}

                  {(["1m", "5m", "15m", "1H"] as const).map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`h-7 min-w-9 px-2.5 rounded-lg text-[11px] border transition ${
                        timeframe === tf
                          ? "bg-yellow-600 border-yellow-500 text-black font-black shadow-[0_0_18px_rgba(216,155,0,0.35)]"
                          : "bg-[#08080a] border-[#27272f] text-gray-300 hover:text-white hover:border-yellow-700"
                      }`}
                    >
                      {tf}
                    </button>
                  ))}

                  <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                    className="h-7 bg-[#08080a] border border-[#27272f] rounded-lg px-2 text-[11px] text-white outline-none hover:border-yellow-700"
                  >
                    {[
                      { label: "1m", value: "1m" },
                      { label: "3m", value: "3m" },
                      { label: "5m", value: "5m" },
                      { label: "15m", value: "15m" },
                      { label: "30m", value: "30m" },
                      { label: "1h", value: "1H" },
                      { label: "4h", value: "4H" },
                      { label: "1D", value: "1D" },
                    ].map((tf) => (
                      <option key={tf.value} value={tf.value}>
                        {tf.label}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={resetDashboard}
                    className="h-7 px-2.5 rounded-lg text-[11px] bg-[#08080a] border border-[#27272f] hover:border-yellow-700"
                  >
                    Reset
                  </button>

                  <button className="h-7 px-2.5 rounded-lg text-[11px] bg-[#08080a] border border-[#27272f] hover:border-yellow-700">
                    Indicators
                  </button>
                  <button className="h-7 px-2.5 rounded-lg text-[11px] bg-[#08080a] border border-[#27272f] hover:border-yellow-700">
                    Standard
                  </button>
                  <button className="h-7 px-2.5 rounded-lg text-[11px] bg-[#08080a] border border-[#27272f] hover:border-yellow-700">
                    Advanced
                  </button>
                  <button
                    onClick={() => setSmartFibEnabled((prev) => !prev)}
                    className={`h-7 px-2.5 rounded-lg text-[11px] border transition ${
                      smartFibEnabled
                        ? "bg-green-500/15 border-green-500 text-green-200 hover:bg-green-500/25"
                        : "bg-[#08080a] border-[#27272f] text-gray-300 hover:text-white hover:border-yellow-700"
                    }`}
                  >
                    Smart Fib {smartFibEnabled ? "ON" : "OFF"}
                  </button>
                  <button
                    onClick={() => setSmartFibSettingsOpen(true)}
                    className="h-7 px-2.5 rounded-lg text-[11px] bg-[#08080a] border border-[#27272f] hover:border-yellow-700 hover:text-yellow-400 transition"
                  >
                    Fib Settings
                  </button>

                  <button
                    onClick={() => setFullscreen(!fullscreen)}
                    className="h-7 px-2.5 rounded-lg text-[11px] bg-[#08080a] border border-[#27272f] hover:border-yellow-700 hover:text-yellow-400 transition"
                  >
                    {fullscreen ? "Exit" : "Full"}
                  </button>
                </div>
              </div>

              <div
                ref={chartContainerRef}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();

                  const price = coordinateToPrice(e.clientY);

                  setContextMenu({
                    open: true,
                    x: e.clientX,
                    y: e.clientY,
                    price,
                  });
                }}
                className="relative w-full min-w-0 overflow-hidden rounded-xl border border-[rgba(255,139,0,0.25)] bg-black"
              >
                <div ref={chartRef} className="h-[560px] w-full min-w-0 xl:h-[590px]" />

                <SmartFibOverlay context={smartFibContext} chartApi={chartApiRef.current} candleSeries={candleSeriesRef.current} />

                <div className="absolute left-4 bottom-4 z-40 w-[280px] rounded-2xl border border-green-500/20 bg-black/70 p-3 text-[11px] text-gray-200 shadow-[0_0_24px_rgba(0,0,0,0.55)]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-xs text-green-300">Smart Fib Status</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${smartFibContext.enabled ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>
                      {smartFibContext.enabled ? "ENABLED" : "DISABLED"}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-gray-400">
                    <div>
                      <div className="text-gray-500">Map</div>
                      <div className="font-bold text-white">{smartFibContext.mapState}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Setup</div>
                      <div className="font-bold text-white">{smartFibContext.setupType}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Levels</div>
                      <div className="font-bold text-white">{smartFibContext.activeFibLevels.length}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Signals</div>
                      <div className="font-bold text-white">{smartFibContext.lastSignals.length}</div>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-gray-400">
                    {smartFibContext.enabled
                      ? smartFibContext.dashboardSummary
                      : "Smart Fib is disabled. Enable the feature to display swing maps, zones, and candidate entries."}
                  </p>
                </div>

                <div className="absolute left-3 top-3 z-40 max-w-[300px] rounded-xl border border-yellow-500/20 bg-black/70 px-3 py-2 backdrop-blur-md shadow-[0_0_30px_rgba(0,0,0,0.65)] pointer-events-none">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black tracking-[0.18em] text-yellow-400">WOLVRENE PRECISION</p>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${visualIntelligence.lastDecisionAction === "ENTER NOW" ? "bg-green-500/20 text-green-300" : visualIntelligence.lastDecisionAction === "FILTERED" || visualIntelligence.lastDecisionAction === "EXIT EARLY" ? "bg-red-500/20 text-red-300" : "bg-zinc-800 text-gray-300"}`}>{v25FinalBrain.action}</span>
                  </div>
                  <p className="mt-2 text-[10px] text-gray-300">{v25FinalBrain.summary}</p>
                  <p className="mt-1 text-[9px] text-gray-500">{visualIntelligence.summary}</p>
                  <p className="mt-1 text-[10px] text-gray-400">{v25FinalBrain.reason}</p>
                  <p className="mt-1 text-[10px] text-yellow-300">State: {v25FinalBrain.activeTradeState} · Entry: {v25FinalBrain.entryQuality} · TP hits: {v25FinalBrain.tpHitCount}</p>
                  <p className="mt-1 text-[9px] text-gray-500">Unified brain · closed-candle signals · cooldown protected · stable memory</p>
                </div>
                {activeExecutionTradeView && activeExecutionTradeView.timeframe !== timeframe && (
                  <div className="absolute right-3 top-3 z-40 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold text-cyan-300">
                    Active {activeExecutionTradeView.timeframe} {activeExecutionTradeView.side}
                  </div>
                )}

                {tradeMarkers.map((marker) => {
                  const left = timeToLeft(marker.openedAt);
                  const top = priceToTop(marker.entry);
                  if (left === null || top === null) return null;
                  const isLong = marker.side === "LONG";
                  return (
                    <div
                      key={`tm-${marker.id}`}
                      className="absolute z-30 pointer-events-none"
                      style={{ left: Math.max(4, left - 4), top: isLong ? top + 8 : top - 12 }}
                      title={`${isLong ? "LONG" : "SHORT"} ${marker.timeframe} ${marker.mode} · Entry ${formatPrice(marker.entry)} · SL ${formatPrice(marker.sl)} · TP1 ${formatPrice(marker.tp1)}${marker.result ? ` · ${marker.result}` : ""}`}
                    >
                      <div className={isLong ? "h-2 w-2 rounded-full bg-green-400/90 border border-green-200/60" : "h-2 w-2 rounded-full bg-rose-400/90 border border-rose-200/60"} />
                      <div className={`-mt-1 text-[7px] font-black ${isLong ? "text-green-300" : "text-rose-300"}`}>{isLong ? "L" : "S"}</div>
                    </div>
                  );
                })}

                {activeExecutionTradeView && activeExecutionTradeView.timeframe === timeframe && (
                  <>
                    {[{ label: `${activeExecutionTradeView.side} ENTRY`, price: activeExecutionTradeView.entry, color: activeExecutionTradeView.side === "LONG" ? "#22c55e" : "#ef4444" },
                      { label: activeExecutionTradeView.status === "BREAKEVEN" ? "SL @ BE" : "SL", price: activeExecutionTradeView.sl, color: "#ef4444" },
                      { label: "TP1", price: activeExecutionTradeView.tp1, color: activeExecutionTradeView.tp1Hit ? "#86efac" : "#22c55e" },
                      { label: "TP2", price: activeExecutionTradeView.tp2, color: activeExecutionTradeView.tp2Hit ? "#86efac" : "#22c55e" },
                      { label: "TP3", price: activeExecutionTradeView.tp3, color: activeExecutionTradeView.tp3Hit ? "#86efac" : "#22c55e" }].map((line) => {
                      const top = priceToTop(line.price);
                      if (top === null) return null;
                      return (
                        <div key={`exec-line-${line.label}`} className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top }}>
                          <div style={{ borderTop: `1px dashed ${line.color}` }} />
                          <div className="absolute right-3 -top-3 rounded-md border px-1.5 py-0.5 text-[9px] font-black" style={{ borderColor: line.color, color: line.color, background: "rgba(0,0,0,0.65)" }}>
                            {line.label}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {alerts.map((alert) => (
                  <LineButton
                    key={alert.id}
                    top={priceToTop(alert.price)}
                    color={alert.hit ? "#ef4444" : "#facc15"}
                    label={alert.hit ? "ALERT HIT" : `ALERT ${alert.side.toUpperCase()}`}
                    value={alert.price}
                    dashed
                    hit={alert.hit}
                    onMouseDown={() => setDragTarget({ type: "alert", alertId: alert.id })}
                    onClick={() => openLineEditor({ type: "alert", alertId: alert.id })}
                    onDelete={() => deleteAlert(alert.id)}
                  />
                ))}

                {orders.map((order) => (
                  <div key={order.id}>
                    <LineButton
                      top={priceToTop(order.entry)}
                      color={order.side === "LONG" ? "#22c55e" : "#ef4444"}
                      label={`${order.side} ENTRY #${String(order.id).slice(-4)}`}
                      value={order.entry}
                      dashed
                      onMouseDown={() => {
                        setSelectedOrderId(order.id);
                        setDragTarget({ type: "entry", orderId: order.id });
                      }}
                      onClick={() => {
                        setSelectedOrderId(order.id);
                        openLineEditor({ type: "entry", orderId: order.id });
                      }}
                      onDelete={() => deleteOrder(order.id)}
                    />

                    <LineButton
                      top={priceToTop(order.sl)}
                      color="#ef4444"
                      label="SL"
                      value={order.sl}
                      dashed
                      onMouseDown={() => {
                        setSelectedOrderId(order.id);
                        setDragTarget({ type: "sl", orderId: order.id });
                      }}
                      onClick={() => {
                        setSelectedOrderId(order.id);
                        openLineEditor({ type: "sl", orderId: order.id });
                      }}
                      onDelete={() => deleteOrder(order.id)}
                    />

                    {order.tps.map((tp) => (
                      <LineButton
                        key={tp.id}
                        top={priceToTop(tp.price)}
                        color={tp.hit ? "#ef4444" : "#22c55e"}
                        label={`${tp.label} • ${tp.closePct}%`}
                        value={tp.price}
                        hit={tp.hit}
                        onMouseDown={() => {
                          setSelectedOrderId(order.id);
                          setDragTarget({ type: "tp", orderId: order.id, tpId: tp.id });
                        }}
                        onClick={() => {
                          setSelectedOrderId(order.id);
                          openLineEditor({ type: "tp", orderId: order.id, tpId: tp.id });
                        }}
                        onDelete={() => deleteTP(order.id, tp.id)}
                      />
                    ))}
                  </div>
                ))}



                {v23EliteEngine.heatZones.map((zone) => {
                  const top = priceToTop(zone.price);
                  if (top === null) return null;
                  const bullish = zone.side === "LONG";
                  const opacity = Math.max(0.12, Math.min(0.42, zone.probability / 240));
                  return (
                    <div key={zone.id} className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top }}>
                      <div className={bullish ? "border-t border-green-300/50" : "border-t border-red-300/50"} />
                      <div className={bullish ? "absolute left-3 -top-3 rounded-md border border-green-400/40 bg-green-500/15 px-2 py-0.5 text-[9px] font-black text-green-200" : "absolute left-3 -top-3 rounded-md border border-red-400/40 bg-red-500/15 px-2 py-0.5 text-[9px] font-black text-red-200"} style={{ opacity }}>
                        {zone.label} · {zone.probability}%
                      </div>
                    </div>
                  );
                })}

                {visualIntelligence.zones.map((zone) => {
                  const top = priceToTop(zone.price);
                  if (top === null) return null;
                  const isBuy = zone.side === "BUY_SIDE";
                  return (
                    <div key={zone.id} className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top }}>
                      <div className={`border-t ${isBuy ? "border-red-400/40" : "border-green-400/40"}`} />
                      <div className={`absolute right-3 -top-3 rounded-md border px-2 py-0.5 text-[9px] font-black ${isBuy ? "border-red-400/40 bg-red-500/10 text-red-300" : "border-green-400/40 bg-green-500/10 text-green-300"}`}>
                        {zone.label}
                      </div>
                    </div>
                  );
                })}

                {visualIntelligence.markers.map((marker) => {
                  const top = priceToTop(marker.price);
                  const left = timeToLeft(marker.time);
                  if (top === null || left === null) return null;
                  const bullish = marker.direction === "LONG";
                  const important = marker.kind === "DECISION" || marker.kind === "BOS" || marker.kind === "CHOCH";
                  return (
                    <div
                      key={marker.id}
                      className="absolute z-30 pointer-events-none select-none"
                      style={{ left: Math.max(4, left - 18), top: bullish ? top + 12 : top - 28 }}
                    >
                      <div className={`rounded-md border px-1.5 py-0.5 text-[8px] font-black shadow-[0_0_16px_rgba(0,0,0,0.85)] ${bullish ? "border-green-400/60 bg-green-500/15 text-green-200" : "border-red-400/60 bg-red-500/15 text-red-200"}`}>
                        {important ? "◆ " : ""}{marker.label}
                      </div>
                    </div>
                  );
                })}

                {signalMarkers
                  .filter((marker) => marker.timeframe === timeframe)
                  .slice(-PRECISION_RULES.maxVisibleSignalMarkers)
                  .map((marker) => {
                    const top = priceToTop(marker.price);
                    const left = timeToLeft(marker.time);
                    if (top === null || left === null) return null;
                    const isLong = marker.direction === "LONG";
                    return (
                      <div
                        key={marker.key}
                        className="absolute z-30 pointer-events-none select-none"
                        style={{ left: Math.max(6, left - 14), top: isLong ? top + 12 : top - 24 }}
                      >
                        <div
                          className={`h-3 w-3 rounded-full border text-[7px] font-black flex items-center justify-center shadow-[0_0_18px_rgba(0,0,0,0.85)] ${
                            isLong
                              ? "border-green-500/70 bg-green-500/30 text-green-200"
                              : "border-red-500/70 bg-red-500/30 text-red-200"
                          }`}
                        >
                          {isLong ? "L" : "S"}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {!hideUI && (
              <div className={`${terminalPanel} mt-3 p-4`}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-[0.18em] text-[#ffc247]">Active Trade Overview</h3>
                  <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] text-[#8b9098]">{activeExecutionTradeView?.status || "WAITING"}</span>
                </div>
                <div className="grid gap-2 text-xs md:grid-cols-5">
                  <div className="rounded-xl border border-zinc-800 bg-black/50 p-2"><p className="text-[#8b9098]">Position</p><p className={activeExecutionTradeView?.side === "LONG" ? "font-bold text-green-400" : "font-bold text-red-400"}>{activeExecutionTradeView?.side || "NONE"}</p></div>
                  <div className="rounded-xl border border-zinc-800 bg-black/50 p-2"><p className="text-[#8b9098]">Size</p><p className="font-bold">{activeExecutionTradeView?.size?.toFixed(4) || "--"}</p></div>
                  <div className="rounded-xl border border-zinc-800 bg-black/50 p-2"><p className="text-[#8b9098]">Entry / Mark</p><p className="font-bold">{activeExecutionTradeView ? formatPrice(activeExecutionTradeView.entry) : "--"} / {livePrice ? formatPrice(livePrice) : "--"}</p></div>
                  <div className="rounded-xl border border-zinc-800 bg-black/50 p-2"><p className="text-[#8b9098]">PnL / ROE</p><p className="font-bold">{activeExecutionTradeView && livePrice ? `${(((activeExecutionTradeView.side === "LONG" ? livePrice - activeExecutionTradeView.entry : activeExecutionTradeView.entry - livePrice) * activeExecutionTradeView.size).toFixed(2))} / ${((((activeExecutionTradeView.side === "LONG" ? livePrice - activeExecutionTradeView.entry : activeExecutionTradeView.entry - livePrice) * activeExecutionTradeView.size) / Math.max(activeExecutionTradeView.margin, 0.0001) * 100).toFixed(2))}%` : "--"}</p></div>
                  <div className="rounded-xl border border-zinc-800 bg-black/50 p-2"><p className="text-[#8b9098]">Margin / SL</p><p className="font-bold">{activeExecutionTradeView ? `${activeExecutionTradeView.margin.toFixed(2)} / ${formatPrice(activeExecutionTradeView.sl)}` : "--"}</p></div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {["Signal Received", "Validated", "Executed", "Managed"].map((step) => (
                    <span key={step} className="rounded-lg border border-zinc-800 bg-black/40 px-2 py-1 text-[10px] text-[#8b9098]">{step}</span>
                  ))}
                  <div className="ml-auto grid grid-cols-2 gap-2 text-[11px]">
                    <button
                      onClick={() => createOrder("LONG")}
                      disabled={!canExecuteLong}
                      className={`rounded-lg px-3 py-1.5 font-bold ${
                        canExecuteLong
                          ? "border border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/15"
                          : "border border-zinc-800 bg-zinc-900 text-zinc-500 cursor-not-allowed opacity-60"
                      }`}
                    >
                      Open Long
                    </button>
                    <button
                      onClick={() => createOrder("SHORT")}
                      disabled={!canExecuteShort}
                      className={`rounded-lg px-3 py-1.5 font-bold ${
                        canExecuteShort
                          ? "border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/15"
                          : "border border-zinc-800 bg-zinc-900 text-zinc-500 cursor-not-allowed opacity-60"
                      }`}
                    >
                      Open Short
                    </button>
                  </div>
                </div>
              </div>
            )}

            {orders.length > 0 && (
              <div className={`${card} mt-4 overflow-hidden`}>
                <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-md bg-zinc-800 px-2 py-1 font-bold text-white">Detailed</span>
                    <span className="rounded-md bg-black px-2 py-1 text-gray-400">Lite</span>
                    <span className="rounded-md bg-black px-2 py-1 text-gray-400">Filter: All</span>
                  </div>
                  <button onClick={() => setOrders([])} className="rounded-lg bg-black px-3 py-1.5 text-[10px] text-gray-300 border border-zinc-800 hover:border-red-500 hover:text-red-400">
                    Close all
                  </button>
                </div>

                <div className="max-h-[360px] overflow-auto">
                  {orders.map((order) => {
                    const mark = livePrice || order.entry;
                    const pnl = orderPnL(order);
                    const roi = orderRoi(order);
                    const size = Number(order.size) || 0;
                    const leverage = Math.max(1, Number(order.leverage) || 1);
                    const sideColor = order.side === "LONG" ? "text-green-400" : "text-red-400";
                    const pnlColor = pnl >= 0 ? "text-green-400" : "text-red-400";

                    return (
                      <div
                        key={order.id}
                        onClick={() => setSelectedOrderId(order.id)}
                        className={`border-b border-zinc-900 p-4 transition ${
                          selectedOrderId === order.id ? "bg-yellow-500/[0.035]" : "bg-black/20 hover:bg-white/[0.025]"
                        }`}
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="h-4 w-4 rounded-full bg-orange-500 text-[10px] font-black text-black flex items-center justify-center">₿</span>
                            <span className={`text-sm font-black ${sideColor}`}>
                              {selectedSymbol} · Isolated · {order.side} · {leverage}x
                            </span>
                            <span className="text-xs text-gray-500">#{String(order.id).slice(-4)}</span>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              closeOrder(order.id);
                            }}
                            className="text-xs text-gray-500 hover:text-red-400"
                          >
                            Close
                          </button>
                        </div>

                        <div className="grid gap-4 text-xs md:grid-cols-4">
                          <div className="space-y-2">
                            <div>
                              <p className="text-gray-500">Position</p>
                              <p className="font-bold">{size.toFixed(4)} BTC</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Unrealized PnL</p>
                              <p className={`font-bold ${pnlColor}`}>{pnl.toFixed(4)} USDT / {roi.toFixed(2)}%</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Est. liquidation price</p>
                              <p className="font-bold text-orange-400">{formatPrice(estimatedLiquidation(order))}</p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div>
                              <p className="text-gray-500">Entry price</p>
                              <p className="font-bold">{formatPrice(order.entry)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Mark price</p>
                              <p className="font-bold">{formatPrice(mark)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Margin</p>
                              <p className="font-bold">{positionMargin(order).toFixed(4)} USDT</p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div>
                              <p className="text-gray-500">Margin Rate</p>
                              <p className="font-bold">{(100 / leverage).toFixed(2)}%</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Breakeven price</p>
                              <p className="font-bold">{formatPrice(breakevenPrice(order))}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">TP / SL</p>
                              <p className="font-bold text-gray-300">{order.tps.length} TP / SL active</p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <label>
                                <span className="text-gray-500">Close price</span>
                                <input
                                  value={formatPrice(mark)}
                                  readOnly
                                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-[#1f1f24] px-2 py-2 text-xs outline-none"
                                />
                              </label>
                              <label>
                                <span className="text-gray-500">Close quantity</span>
                                <input
                                  type="number"
                                  value={size}
                                  onChange={(e) => updateOrder(order.id, { size: Number(e.target.value) })}
                                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-[#1f1f24] px-2 py-2 text-xs outline-none focus:border-yellow-700"
                                />
                              </label>
                            </div>

                            <div className="grid grid-cols-4 gap-2">
                              <button onClick={(e) => { e.stopPropagation(); closePartial(order.id, 100); }} className="rounded-lg bg-white px-2 py-2 text-xs font-bold text-black hover:bg-gray-200">Close</button>
                              <button onClick={(e) => { e.stopPropagation(); closePartial(order.id, 100); }} className="rounded-lg bg-zinc-800 px-2 py-2 text-xs font-bold hover:bg-zinc-700">Flash</button>
                              <button onClick={(e) => { e.stopPropagation(); reverseOrder(order); }} className="rounded-lg bg-zinc-800 px-2 py-2 text-xs font-bold hover:bg-zinc-700">Reverse</button>
                              <button onClick={(e) => { e.stopPropagation(); if (order.tps[0]) openLineEditor({ type: "tp", orderId: order.id, tpId: order.tps[0].id }); else addTP(order.id); }} className="rounded-lg bg-zinc-800 px-2 py-2 text-xs font-bold hover:bg-zinc-700">TP/SL</button>
                            </div>

                            <div className="grid grid-cols-4 gap-1">
                              {[25, 50, 75, 100].map((pct) => (
                                <button
                                  key={pct}
                                  onClick={(e) => { e.stopPropagation(); closePartial(order.id, pct); }}
                                  className="rounded-md border border-zinc-800 bg-black py-1 text-[10px] text-gray-400 hover:border-yellow-700 hover:text-yellow-400"
                                >
                                  {pct}%
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {smartFibEnabled && (
              <div className={`${terminalPanel} mt-3 p-4`}>
                <SmartFibDashboard context={smartFibContext} />
              </div>
            )}

            {!hideUI && (
              <div className="mt-4 grid gap-3 lg:grid-cols-4">
                <div className={`${terminalPanel} p-4`}>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#8b9098]">Performance Today</p>
                  <p className="mt-2 text-xl font-black text-[#00e676]">
                    {tradeLog.length ? `${tradeLog.filter((t) => t.result === "WIN").length}/${tradeLog.length}` : "0/0"}
                  </p>
                  <div className="mt-3 h-12 rounded-lg bg-gradient-to-r from-[#ff8a00]/20 via-[#ffc247]/20 to-[#00e676]/10" />
                </div>
                <div className={`${terminalPanel} p-4`}>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#8b9098]">AI Engine Status</p>
                  <div className="mt-2 flex items-center gap-3">
                    <img src="/wolvrene-logo.png" alt="Wolvrene AI" className="h-10 w-10 object-contain opacity-90" />
                    <div className="text-[11px] text-[#8b9098]">
                      <p>Market Scan: Active</p>
                      <p>Liquidity Analysis: Active</p>
                      <p>Structure Mapping: Active</p>
                      <p>Volume Analysis: Active</p>
                      <p>Execution Engine: Active</p>
                    </div>
                  </div>
                </div>
                <div className={`${terminalPanel} p-4`}>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#8b9098]">Risk Management</p>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-[#ff8a00]/60 text-sm font-black text-[#ffc247]">
                      {Math.min(99, Math.max(1, Math.round((orders.length * 11) + 22)))}%
                    </div>
                    <p className="text-xs text-[#8b9098]">Dynamic exposure based on active orders and AI confidence.</p>
                  </div>
                </div>
                <div className={`${terminalPanel} p-4`}>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#8b9098]">Trade Timeline</p>
                  <div className="mt-2 space-y-1 text-[11px] text-[#8b9098]">
                    {signalFeedRows.slice(0, 4).map((row, index) => (
                      <p key={`timeline-${row.id}-${index}`}>{row.time} · {row.status}</p>
                    ))}
                    {signalFeedRows.length === 0 && <p>No recent timeline events.</p>}
                  </div>
                </div>
              </div>
            )}
          </div>

          {!hideUI && (
            <aside className="min-w-0 space-y-3">
              <div className={`${terminalPanel} relative overflow-hidden p-5`}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm text-gray-400 font-semibold">Precision Signal Console</h2>
                  <span className="text-[10px] px-2 py-1 rounded-full border border-yellow-600/40 text-yellow-500 bg-yellow-500/10">STABLE</span>
                </div>
                <div className="pointer-events-none absolute inset-0 -z-0 rounded-2xl bg-[radial-gradient(circle_at_top_right,rgba(255,138,0,0.12),transparent_46%)]" />

                <p
                  className={`text-3xl font-black ${v25FinalBrain.stateColorClass}`}
                >{v25FinalBrain.displayConsoleState}</p>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-zinc-800 bg-black/60 p-3">
                    <p className="text-gray-500">Risk</p>
                    <p className="font-bold text-yellow-400">{v25FinalBrain.risk}</p>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-black/60 p-3">
                    <p className="text-gray-500">Direction</p>
                    <p className={v25FinalBrain.directionColorClass}>
                      {v25FinalBrain.displayBias}
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="flex justify-between text-xs text-gray-500 mb-2">
                    <span>Signal Confidence</span>
                    <span>{v25FinalBrain.confidence}%</span>
                  </div>
                  <div className="h-3 rounded-full bg-black border border-zinc-800 overflow-hidden">
                    <div
                      className={`h-full ${v25FinalBrain.barColorClass}`}
                      style={{ width: `${v25FinalBrain.confidence}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-zinc-800 bg-black/60 p-3 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-gray-500">Final signal mode</span><span className="text-amber-300">{radarGate.finalSignalMode}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">radarState</span><span>{radarGate.radarState}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">radarBias</span><span>{radarGate.radarBias}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Radar gate result</span><span>{radarGate.radarGateResult}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">legacySignal</span><span>{radarGate.legacySignal || "--"}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Entry</span><span>{v25FinalBrain.entry ? formatPrice(v25FinalBrain.entry) : "--"}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">SL</span><span className="text-red-300">{v25FinalBrain.sl ? formatPrice(v25FinalBrain.sl) : "--"}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">TP1</span><span className="text-green-300">{v25FinalBrain.tp1 ? formatPrice(v25FinalBrain.tp1) : "--"}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">TP2</span><span className="text-green-300">{v25FinalBrain.tp2 ? formatPrice(v25FinalBrain.tp2) : "--"}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">TP3</span><span className="text-green-300">{v25FinalBrain.tp3 ? formatPrice(v25FinalBrain.tp3) : "--"}</span></div>
                </div>

                <p className="text-xs text-gray-400 mt-4">{v25FinalBrain.reason}</p>
                <p className="text-xs text-yellow-500 mt-1">{radarGate.radarGateReason}</p>
                {signalPlan.warning && <p className="text-[11px] text-yellow-500 mt-2">{signalPlan.warning}</p>}

                {decisionSettings.showDecisionPanel && (
                  <div className="mt-4 rounded-2xl border border-yellow-700/30 bg-yellow-500/[0.045] p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-yellow-500 font-black">DECISION BRAIN</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${brainDecision.phase === "EXECUTE" ? "bg-green-500/20 text-green-300" : brainDecision.phase === "SCANNING" ? "bg-red-500/20 text-red-300" : "bg-zinc-800 text-gray-300"}`}>{brainDecision.phase}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-black/60 border border-zinc-800 p-2"><span className="text-gray-500">Quality</span><p className="font-black text-yellow-400">{brainConfidence}%</p></div>
                      <div className="rounded-xl bg-black/60 border border-zinc-800 p-2"><span className="text-gray-500">Trigger</span><p className="font-black">{decisionPlan.trigger}</p></div>
                      <div className="rounded-xl bg-black/60 border border-zinc-800 p-2"><span className="text-gray-500">Structure</span><p className="font-black">{decisionPlan.structure}</p></div>
                      <div className="rounded-xl bg-black/60 border border-zinc-800 p-2"><span className="text-gray-500">Liquidity</span><p className="font-black">{decisionPlan.liquidity}</p></div>
                      <div className="rounded-xl bg-black/60 border border-zinc-800 p-2"><span className="text-gray-500">Trigger Quality</span><p className="font-black">{decisionPlan.triggerQuality}</p></div>
                      <div className="rounded-xl bg-black/60 border border-zinc-800 p-2"><span className="text-gray-500">Manage</span><p className="font-black">{managementBrain.action}</p></div>
                      <div className="rounded-xl bg-black/60 border border-zinc-800 p-2"><span className="text-gray-500">Invalidation</span><p className="font-black text-red-300">{decisionPlan.invalidation ? formatPrice(decisionPlan.invalidation) : "--"}</p></div>
                    </div>
                    <p className="text-gray-300">{decisionPlan.action}</p>
                    <p className="text-[11px] text-gray-500">{structureState.summary}</p>
                  </div>
                )}

                <div className="mt-4 rounded-2xl border border-cyan-700/30 bg-cyan-500/[0.05] p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-cyan-300">TRIGGER CHECKLIST</span>
                    <span className="text-[10px] text-gray-400">{activeTradeMode}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["Structure", triggerChecklist.structure],
                      ["Liquidity", triggerChecklist.liquidity],
                      ["Volume", triggerChecklist.volume],
                      ["Trigger", triggerChecklist.trigger],
                      ["RR", triggerChecklist.rr],
                      ["Session", triggerChecklist.session],
                    ].map(([label, ok]) => (
                      <div key={String(label)} className="rounded-lg border border-zinc-800 bg-black/50 px-2 py-1 flex items-center justify-between">
                        <span className="text-gray-400">{label}</span>
                        <span className={ok ? "text-green-400" : "text-red-400"}>{ok ? "✔" : "✖"}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-green-700/30 bg-green-500/[0.04] p-3 text-xs space-y-2 sticky top-2 z-20">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-green-300">ACTIVE TRADE PANEL · PRIORITY</span>
                    <span className="text-[10px] text-gray-400">{activeExecutionTradeView?.status || "NO ACTIVE TRADE"}</span>
                  </div>
                  {activeExecutionTradeView ? (
                    <>
                      <div className="flex justify-between"><span className="text-gray-500">Side</span><span className={activeExecutionTradeView.side === "LONG" ? "text-green-400" : "text-red-400"}>{activeExecutionTradeView.side}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Entry / Live</span><span>{formatPrice(activeExecutionTradeView.entry)} / {livePrice ? formatPrice(livePrice) : "--"}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">PnL $</span><span>{livePrice ? (((activeExecutionTradeView.side === "LONG" ? livePrice - activeExecutionTradeView.entry : activeExecutionTradeView.entry - livePrice) * activeExecutionTradeView.size).toFixed(2)) : "--"}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">PnL %</span><span>{livePrice ? ((((activeExecutionTradeView.side === "LONG" ? livePrice - activeExecutionTradeView.entry : activeExecutionTradeView.entry - livePrice) * activeExecutionTradeView.size) / Math.max(activeExecutionTradeView.margin, 0.0001) * 100).toFixed(2) + "%") : "--"}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">SL</span><span className="text-red-300">{formatPrice(activeExecutionTradeView.sl)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">TP1/2/3</span><span>{activeExecutionTradeView.tp1Hit ? "✔" : "·"} / {activeExecutionTradeView.tp2Hit ? "✔" : "·"} / {activeExecutionTradeView.tp3Hit ? "✔" : "·"}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Dist TP1 / SL</span><span>{livePrice ? `${Math.abs(activeExecutionTradeView.tp1 - livePrice).toFixed(2)} / ${Math.abs(activeExecutionTradeView.sl - livePrice).toFixed(2)}` : "--"}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Time In Trade</span><span>{Math.max(0, Math.floor((Date.now() - normalizeEpochMs(activeExecutionTradeView.openedAt)) / 60000))}m</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Current Action</span><span>{managementBrain.action}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Risk State</span><span>{decisionPlan.risk}</span></div>
                    </>
                  ) : (
                    <p className="text-gray-500">No Active Trade. Engine is waiting for VALIDATE → EXECUTE conditions.</p>
                  )}
                  {lastClosedExecutionTrade && (
                    <div className="mt-2 rounded-xl border border-zinc-800 bg-black/50 p-2">
                      <p className="text-[10px] text-gray-400 mb-1">Last Closed Trade</p>
                      <div className="flex justify-between"><span className="text-gray-500">Side / TF</span><span>{lastClosedExecutionTrade.side} · {lastClosedExecutionTrade.timeframe}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Status</span><span>{lastClosedExecutionTrade.status}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Close Reason</span><span>{lastClosedExecutionTrade.status}</span></div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                  <button onClick={() => { setAiOpen(true); setAiTab("chat"); }} className="rounded-xl border border-yellow-700/50 bg-yellow-500/10 p-3 text-yellow-400 hover:bg-yellow-500/20">
                    Open AI
                  </button>
                  <button onClick={() => runAIQuickAction("analyze")} className="rounded-xl border border-zinc-800 bg-black p-3 hover:border-yellow-700">
                    Analyze Now
                  </button>
                  <button
                    onClick={useSignalPlan}
                    disabled={!brainDecision.direction || brainDecision.phase === "SCANNING" || Boolean(activeExecutionTradeView)}
                    className="rounded-xl border border-green-700/50 bg-green-500/10 p-3 text-green-400 hover:bg-green-500/20 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-black disabled:text-gray-600"
                  >
                    Use Signal
                  </button>
                  <button
                    onClick={sendDiscordSignalNow}
                    disabled={!externalAlertSettings.enabled || !externalAlertSettings.discordWebhook || !brainDecision.direction || brainDecision.phase === "SCANNING"}
                    className="rounded-xl border border-indigo-700/50 bg-indigo-500/10 p-3 text-indigo-300 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-black disabled:text-gray-600"
                    title="Send compact signal format to Discord"
                  >
                    Send Discord Signal
                  </button>
                </div>
              </div>

              <div className={`${terminalPanel} p-4`}> 
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm text-gray-400 font-semibold">Trade Panel</h2>
                  <span className="text-[10px] text-yellow-500">{marginMode.toUpperCase()} / {executionLeverage}x</span>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  <button
                    onClick={() => setMarginMode("isolated")}
                    className={`h-8 rounded-lg text-xs font-bold border ${marginMode === "isolated" ? "bg-zinc-700 border-zinc-500 text-white" : "bg-black border-zinc-800 text-gray-400"}`}
                  >
                    Isolated
                  </button>
                  <button
                    onClick={() => setMarginMode("cross")}
                    className={`h-8 rounded-lg text-xs font-bold border ${marginMode === "cross" ? "bg-zinc-700 border-zinc-500 text-white" : "bg-black border-zinc-800 text-gray-400"}`}
                  >
                    Cross
                  </button>
                  <div className="h-8 rounded-lg bg-black border border-zinc-800 text-xs flex items-center justify-center text-gray-400">
                    Sim
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={() => setOrderType("limit")}
                    className={`h-8 rounded-lg text-xs font-bold border ${orderType === "limit" ? "bg-yellow-600 border-yellow-500 text-black" : "bg-black border-zinc-800 text-gray-400"}`}
                  >
                    Limit
                  </button>
                  <button
                    onClick={() => setOrderType("market")}
                    className={`h-8 rounded-lg text-xs font-bold border ${orderType === "market" ? "bg-yellow-600 border-yellow-500 text-black" : "bg-black border-zinc-800 text-gray-400"}`}
                  >
                    Market
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={() => setOrderSide("LONG")}
                    className={`h-9 rounded-xl border font-bold ${orderSide === "LONG" ? "bg-green-500/20 border-green-500/50 text-green-400" : "bg-black border-zinc-800 text-gray-400"}`}
                  >
                    LONG
                  </button>
                  <button
                    onClick={() => setOrderSide("SHORT")}
                    className={`h-9 rounded-xl border font-bold ${orderSide === "SHORT" ? "bg-red-500/20 border-red-500/50 text-red-400" : "bg-black border-zinc-800 text-gray-400"}`}
                  >
                    SHORT
                  </button>
                </div>

                <div className="space-y-2 mb-3">
                  <label className="block">
                    <span className="text-[11px] text-gray-500">Price USDT</span>
                    <div className="flex gap-2 mt-1">
                      <input
                        type="number"
                        value={draftPrice}
                        onChange={(e) => setDraftPrice(e.target.value)}
                        className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs outline-none focus:border-yellow-700"
                      />
                      <button
                        onClick={() => livePrice && setDraftPrice(livePrice.toFixed(2))}
                        className="px-3 rounded-xl bg-zinc-800 text-[11px] hover:bg-zinc-700"
                      >
                        BBO
                      </button>
                    </div>
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[11px] text-gray-500">Amount USDT</span>
                      <input
                        type="number"
                        value={draftUsd}
                        onChange={(e) => setDraftUsd(e.target.value)}
                        className="w-full mt-1 bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs outline-none focus:border-yellow-700"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] text-gray-500">Leverage</span>
                      <input
                        type="number"
                        min="1"
                        max="125"
                        value={draftLeverage}
                        onChange={(e) => setDraftLeverage(e.target.value)}
                        className="w-full mt-1 bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs outline-none focus:border-yellow-700"
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-xl bg-black/60 border border-zinc-800 p-3 mb-3 text-xs space-y-2">
                  <div className="flex justify-between"><span className="text-gray-500">Notional</span><span>{estimatedNotional.toFixed(2)} USDT</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Base Size</span><span>{executionSize.toFixed(6)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Required Margin</span><span className="text-yellow-400">{estimatedMargin.toFixed(4)} USDT</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Mode</span><span>{marginMode === "isolated" ? "Isolated" : "Cross"}</span></div>
                </div>

                <button
                  onClick={() => {
                    storageSet<WolvreneUserPrefs>(userPrefsKey(), { selectedSymbol, timeframe, marginMode, orderType, orderSide, draftPrice, draftUsd, draftLeverage, terminalTab, hideUI, smartFibEnabled });
                    addJournal("User settings saved: symbol, timeframe, order panel, and layout.");
                  }}
                  className="w-full h-9 rounded-xl bg-zinc-900 border border-yellow-700/40 text-yellow-300 text-xs font-black mb-3 hover:bg-zinc-800"
                >
                  Save Settings
                </button>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button
                    onClick={() => createOrder("LONG")}
                    disabled={!canExecuteLong}
                    className={`h-10 rounded-xl font-bold ${
                      canExecuteLong
                        ? "bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-500 cursor-not-allowed opacity-60"
                    }`}
                  >
                    Open Long
                  </button>
                  <button
                    onClick={() => createOrder("SHORT")}
                    disabled={!canExecuteShort}
                    className={`h-10 rounded-xl font-bold ${
                      canExecuteShort
                        ? "bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-500 cursor-not-allowed opacity-60"
                    }`}
                  >
                    Open Short
                  </button>
                </div>

                {selectedOrder ? (
                  <div className="space-y-3 text-sm border-t border-zinc-800 pt-4">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Selected</span>
                      <span className={selectedOrder.side === "LONG" ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                        {selectedOrder.side} #{String(selectedOrder.id).slice(-4)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl bg-black/60 border border-zinc-800 p-3">
                        <p className="text-gray-500">Entry</p>
                        <p className="font-bold">{formatPrice(selectedOrder.entry)}</p>
                      </div>
                      <div className="rounded-xl bg-black/60 border border-zinc-800 p-3">
                        <p className="text-gray-500">Mark</p>
                        <p className="font-bold">{formatPrice(livePrice || selectedOrder.entry)}</p>
                      </div>
                      <div className="rounded-xl bg-black/60 border border-zinc-800 p-3">
                        <p className="text-gray-500">PnL / ROI</p>
                        <p className={orderPnL(selectedOrder) >= 0 ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                          {orderPnL(selectedOrder).toFixed(4)} / {orderRoi(selectedOrder).toFixed(2)}%
                        </p>
                      </div>
                      <div className="rounded-xl bg-black/60 border border-zinc-800 p-3">
                        <p className="text-gray-500">Liq. Est.</p>
                        <p className="text-orange-400 font-bold">{formatPrice(estimatedLiquidation(selectedOrder))}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={selectedOrder.size}
                        onChange={(e) => updateOrder(selectedOrder.id, { size: Number(e.target.value) })}
                        className="bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs"
                        placeholder="Size"
                      />
                      <input
                        type="number"
                        value={selectedOrder.leverage}
                        onChange={(e) => updateOrder(selectedOrder.id, { leverage: Number(e.target.value) })}
                        className="bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs"
                        placeholder="Leverage"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => addTP(selectedOrder.id)}
                        className="w-full h-9 rounded-xl bg-black border border-zinc-800 text-xs hover:border-yellow-700"
                      >
                        Add TP
                      </button>
                      <button
                        onClick={() => createOrder(selectedOrder.side === "LONG" ? "SHORT" : "LONG", livePrice || selectedOrder.entry)}
                        className="w-full h-9 rounded-xl bg-black border border-zinc-800 text-xs hover:border-yellow-700"
                      >
                        Reverse
                      </button>
                    </div>

                    <button
                      onClick={() => deleteOrder(selectedOrder.id)}
                      className="w-full h-9 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-400"
                    >
                      Delete Selected Order
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No selected order.</p>
                )}
              </div>

              <div className={`${terminalPanel} p-4`}>
                <h2 className="text-sm text-gray-400 font-semibold mb-3">Orders List</h2>
                <div className="space-y-2 max-h-48 overflow-auto pr-1">
                  {orders.length === 0 && <p className="text-sm text-gray-500">No orders yet.</p>}

                  {orders.map((order) => (
                    <button
                      key={order.id}
                      onClick={() => setSelectedOrderId(order.id)}
                      className={`w-full text-left rounded-xl border p-3 transition ${
                        selectedOrderId === order.id ? "border-yellow-600 bg-black/80" : "border-zinc-800 bg-black/40"
                      }`}
                    >
                      <div className="flex justify-between">
                        <span className={order.side === "LONG" ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                          {order.side}
                        </span>
                        <span className="text-xs text-gray-500">#{String(order.id).slice(-4)}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Entry {formatPrice(order.entry)}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className={`${terminalPanel} p-4`}>
                <h2 className="text-sm text-gray-400 font-semibold mb-3">Active Alerts</h2>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={() => addAlert(undefined, "above")}
                    className="rounded-xl border border-zinc-800 bg-black p-3 text-xs hover:border-yellow-700"
                  >
                    Alert Above
                  </button>
                  <button
                    onClick={() => addAlert(undefined, "below")}
                    className="rounded-xl border border-zinc-800 bg-black p-3 text-xs hover:border-yellow-700"
                  >
                    Alert Below
                  </button>
                </div>

                <div className="space-y-2 max-h-40 overflow-auto pr-1">
                  {alerts.length === 0 && <p className="text-sm text-gray-500">No alerts.</p>}

                  {alerts.map((alert) => (
                    <div key={alert.id} className="rounded-xl border border-zinc-800 bg-black/40 p-3">
                      <div className="flex justify-between items-center">
                        <span className={alert.hit ? "text-red-400 text-xs font-bold" : "text-yellow-400 text-xs font-bold"}>
                          {alert.hit ? "HIT" : alert.side.toUpperCase()}
                        </span>
                        <button onClick={() => deleteAlert(alert.id)} className="text-xs text-gray-500 hover:text-red-400">
                          Delete
                        </button>
                      </div>
                      <p className="text-sm mt-1">{formatPrice(alert.price)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`${terminalPanel} p-4`}>
                <h2 className="text-sm text-gray-400 font-semibold mb-3">Command Center</h2>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button onClick={() => setHideUI(true)} className="rounded-xl border border-zinc-800 bg-black p-3 hover:border-yellow-700">
                    Hide UI
                  </button>
                  <button onClick={resetDashboard} className="rounded-xl border border-zinc-800 bg-black p-3 hover:border-yellow-700">
                    Reset
                  </button>
                  <button onClick={() => setJournalOpen(true)} className="rounded-xl border border-zinc-800 bg-black p-3 hover:border-yellow-700">
                    Journal
                  </button>
                  <button onClick={() => { setAiOpen(true); setAiTab("chat"); }} className="rounded-xl border border-yellow-700/50 bg-yellow-500/10 p-3 text-yellow-400 hover:bg-yellow-500/20">
                    AI Command
                  </button>
                  <button onClick={() => setAlertsOpen(true)} className="rounded-xl border border-zinc-800 bg-black p-3 hover:border-yellow-700">
                    Alerts
                  </button>
                </div>
              </div>
            </aside>
          )}
        </div>

        {aiOpen && (
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-hidden overscroll-none"
            onWheel={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onTouchMove={(e) => e.stopPropagation()}
          >
            <div
              className="bg-[#111116] border border-[#302817] rounded-2xl w-full max-w-6xl h-[88vh] max-h-[88vh] overflow-hidden shadow-[0_0_55px_rgba(216,155,0,0.22)]"
              onWheel={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
                <div>
                  <h2 className="text-2xl font-black tracking-wide" style={{ color: gold, textShadow: "0 0 14px rgba(216,155,0,0.45)" }}>
                    WOLVRENE AI COMMAND — LIVE BRIDGE
                  </h2>
                  <p className="text-xs text-gray-500">Real AI bridge · {timeframe} · {session} · {bias} · Orders {orders.length} · Alerts {alerts.length}</p>
                </div>
                <button onClick={() => setAiOpen(false)} className="text-2xl text-gray-400 hover:text-white">×</button>
              </div>

              <div
                className="grid lg:grid-cols-[minmax(0,1fr)_330px] h-[calc(88vh-73px)] overflow-hidden min-h-0"
                onWheel={(e) => e.stopPropagation()}
              >
                <div className="min-w-0 flex flex-col min-h-0 overflow-hidden">
                  <div className="flex gap-2 border-b border-zinc-800 p-3 text-xs overflow-x-auto">
                    {[
                      ["chat", "Chat"],
                      ["insights", "Insights"],
                      ["trade", "Trade Help"],
                      ["context", "Live Context"],
                      ["analytics", "Backtest"],
                      ["learning", "Learning"],
                    ].map(([tab, label]) => (
                      <button
                        key={tab}
                        onClick={() => setAiTab(tab as AITab)}
                        className={`rounded-xl px-4 py-2 border whitespace-nowrap ${
                          aiTab === tab ? "bg-yellow-600 border-yellow-500 text-black font-black" : "bg-black border-zinc-800 text-gray-400 hover:border-yellow-700"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div
                    ref={aiScrollRef}
                    onWheel={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.scrollTop += e.deltaY;
                    }}
                    onTouchMove={(e) => e.stopPropagation()}
                    className="h-full min-h-0 overflow-y-scroll overscroll-contain p-4 scroll-smooth"
                    style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
                  >
                    {aiTab === "chat" && (
                      <div className="space-y-3">
                        {aiMessages.map((message) => (
                          <div key={message.id} className={`rounded-2xl border p-4 ${message.role === "assistant" ? "bg-black/70 border-yellow-700/25" : "bg-zinc-900 border-zinc-800"}`}>
                            <div className="flex justify-between text-[10px] uppercase tracking-wider text-gray-500 mb-2">
                              <span>{message.role === "assistant" ? "Wolvrene AI" : "You"}</span>
                              <span>{message.time}</span>
                            </div>
                            <p className="whitespace-pre-line text-sm leading-6 text-gray-200">{message.text}</p>
                          </div>
                        ))}

                        {aiThinking && (
                          <div className="rounded-2xl border border-yellow-700/40 bg-yellow-500/5 p-4">
                            <div className="flex items-center gap-3">
                              <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
                              <p className="text-sm text-yellow-400 font-bold">WOLVRENE AI is processing sanitized UnifiedWolvreneBrain context...</p>
                            </div>
                            <p className="mt-2 text-xs text-gray-500">AI reads unified brain payload + selected signal/trade context + live market/radar state + chart snapshot.</p>
                          </div>
                        )}

                        <div ref={aiMessagesEndRef} />
                      </div>
                    )}

                    {aiTab === "insights" && (
                      <div className="space-y-3">
                        {aiInsights.map((note, index) => (
                          <div key={index} className="rounded-2xl border border-zinc-800 bg-black/70 p-4">
                            <p className="text-xs text-yellow-500 mb-2">Insight #{index + 1}</p>
                            <p className="text-sm text-gray-200">{note}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {aiTab === "trade" && (
                      <div className="space-y-3">
                        {selectedOrder ? (
                          <div className="rounded-2xl border border-zinc-800 bg-black/70 p-4 text-sm space-y-2">
                            <div className="flex justify-between"><span className="text-gray-500">Selected</span><span className={selectedOrder.side === "LONG" ? "text-green-400 font-bold" : "text-red-400 font-bold"}>{selectedOrder.side} #{String(selectedOrder.id).slice(-4)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Entry</span><span>{formatPrice(selectedOrder.entry)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Mark</span><span>{formatPrice(livePrice || selectedOrder.entry)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">PnL / ROI</span><span className={orderPnL(selectedOrder) >= 0 ? "text-green-400" : "text-red-400"}>{orderPnL(selectedOrder).toFixed(2)} / {orderRoi(selectedOrder).toFixed(2)}%</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">SL</span><span>{formatPrice(selectedOrder.sl)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">TPs</span><span>{selectedOrder.tps.length}</span></div>
                            <button onClick={() => runAIQuickAction("manage")} className="mt-3 w-full rounded-xl bg-yellow-600 py-3 text-black font-black">Analyze Selected Trade</button>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-zinc-800 bg-black/70 p-4 text-sm text-gray-400">No selected trade. Open or select an order first.</div>
                        )}
                      </div>
                    )}

                    {aiTab === "context" && (
                      <div className="space-y-3">
                        <div className="rounded-2xl border border-yellow-700/25 bg-yellow-500/5 p-4">
                          <p className="text-xs text-yellow-500 mb-3 font-bold">LIVE CONTEXT SNAPSHOT</p>
                          <div className="grid md:grid-cols-2 gap-3 text-sm">
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Symbol</span><span>{unifiedLiveContext.symbol}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Timeframe</span><span>{unifiedLiveContext.timeframe}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Mode</span><span>{unifiedLiveContext.mode}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Live Price</span><span>{livePrice ? formatPrice(livePrice) : "Waiting"}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Session</span><span>{unifiedLiveContext.session}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Direction</span><span>{sanitizedBrainPayload.direction || "WAIT"}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Confidence</span><span>{sanitizedBrainPayload.confidence}%</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Orders</span><span>{orders.length}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Alerts</span><span>{alerts.length}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Funding</span><span>{marketStats.funding}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">24H Change</span><span>{marketStats.change}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Candles Trend</span><span>{unifiedLiveContext.trend}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Volatility</span><span>{unifiedLiveContext.volatility} · {candlesSummary.rangePct.toFixed(2)}%</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Heartbeat</span><span>{unifiedLiveContext.heartbeat}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">AI Source</span><span>{aiContext.source}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Strategy</span><span>{sanitizedBrainPayload.strategyProfile.name}</span></div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-zinc-800 bg-black/70 p-4 text-sm">
                          <p className="text-xs text-gray-500 mb-2">Selected Trade Context</p>
                          {selectedOrder ? (
                            <div className="space-y-2">
                              <div className="flex justify-between"><span className="text-gray-500">Side</span><span className={selectedOrder.side === "LONG" ? "text-green-400" : "text-red-400"}>{selectedOrder.side}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Entry</span><span>{formatPrice(selectedOrder.entry)}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">SL</span><span>{formatPrice(selectedOrder.sl)}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">TP Count</span><span>{selectedOrder.tps.length}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">PnL / ROI</span><span className={orderPnL(selectedOrder) >= 0 ? "text-green-400" : "text-red-400"}>{orderPnL(selectedOrder).toFixed(2)} / {orderRoi(selectedOrder).toFixed(2)}%</span></div>
                            </div>
                          ) : (
                            <p className="text-gray-400">No selected order. AI will analyze market context only.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {aiTab === "analytics" && (
                      <div className="space-y-3">
                        <div className="rounded-2xl border border-yellow-700/25 bg-yellow-500/5 p-4">
                          <p className="text-xs text-yellow-500 mb-3 font-bold">BACKTEST DASHBOARD</p>
                          <div className="grid md:grid-cols-2 gap-3 text-sm">
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Tracked Results</span><span>{backtestStats.trades}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Win Rate</span><span>{backtestStats.winRate.toFixed(2)}%</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Profit Factor</span><span>{backtestStats.profitFactor.toFixed(2)}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Best Session</span><span>{backtestStats.bestSession}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Best Timeframe</span><span>{backtestStats.bestTimeframe}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Gross Win / Loss</span><span>{backtestStats.grossWin.toFixed(2)} / {backtestStats.grossLoss.toFixed(2)}</span></div>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-zinc-800 bg-black/70 p-4">
                          <p className="text-xs text-yellow-500 mb-3 font-bold">STRATEGY PERFORMANCE (LOGGED TRADES)</p>
                          {strategyPerformance.length === 0 ? (
                            <p className="text-sm text-gray-400">No closed logged trades yet.</p>
                          ) : (
                            <div className="space-y-2 text-xs">
                              {strategyPerformance.slice(0, 6).map((item) => (
                                <div key={item.strategyName} className="rounded-xl border border-zinc-800 bg-black/60 p-3">
                                  <p className="text-yellow-300 font-bold">{item.strategyName}</p>
                                  <p className="text-gray-300">Trades: {item.tradeCount} · Win Rate: {item.winRate}% · Avg RR: {item.avgRR}</p>
                                  <p className="text-gray-500">Best Session: {item.bestSession} · Worst Session: {item.worstSession} · Drawdown: {item.drawdown}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {aiTab === "learning" && (
                      <div className="space-y-3">
                        <div className="rounded-2xl border border-yellow-700/25 bg-yellow-500/5 p-4">
                          <p className="text-xs text-yellow-500 mb-3 font-bold">ADAPTIVE LEARNING ENGINE</p>
                          <div className="grid md:grid-cols-2 gap-3 text-sm">
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Wins / Losses</span><span>{learningStats.wins} / {learningStats.losses}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Total Samples</span><span>{learningStats.total}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Current Boost</span><span>{learningBoost}</span></div>
                          </div>
                          <button onClick={() => setLearningWeights(defaultLearningWeights)} className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-300 hover:bg-red-500/20">Reset Learning Weights</button>
                        </div>
                        <div className="rounded-2xl border border-zinc-800 bg-black/70 p-4 text-sm space-y-3">
                          <p className="text-xs text-gray-500">Trade Manager + External Alerts</p>
                          <div className="rounded-xl border border-yellow-700/25 bg-yellow-500/5 p-3 space-y-2">
                            <p className="text-[11px] font-black text-yellow-500">v20 Intelligence Core Settings</p>
                            <label className="flex items-center justify-between gap-3"><span>Decision Brain Enabled</span><input type="checkbox" checked={decisionSettings.enabled} onChange={(e) => setDecisionSettings((p) => ({ ...p, enabled: e.target.checked }))} /></label>
                            <label className="flex items-center justify-between gap-3"><span>Show Decision Panel</span><input type="checkbox" checked={decisionSettings.showDecisionPanel} onChange={(e) => setDecisionSettings((p) => ({ ...p, showDecisionPanel: e.target.checked }))} /></label>
                            <label className="flex items-center justify-between gap-3"><span>Require Trigger For Execute</span><input type="checkbox" checked={decisionSettings.requireTriggerForExecute} onChange={(e) => setDecisionSettings((p) => ({ ...p, requireTriggerForExecute: e.target.checked }))} /></label>
                            <label className="flex items-center justify-between gap-3"><span>Pro Signal Only</span><input type="checkbox" checked={decisionSettings.proSignalOnly} onChange={(e) => setDecisionSettings((p) => ({ ...p, proSignalOnly: e.target.checked }))} /></label>
                            <label className="block text-xs text-gray-500">Spawn / Validate / Execute Quality</label>
                            <div className="grid grid-cols-3 gap-2">
                              <input type="number" value={decisionSettings.spawnConfidence} onChange={(e) => setDecisionSettings((p) => ({ ...p, spawnConfidence: Number(e.target.value) || 54 }))} className="rounded-xl border border-zinc-800 bg-black px-2 py-2 text-xs outline-none" />
                              <input type="number" value={decisionSettings.validateConfidence} onChange={(e) => setDecisionSettings((p) => ({ ...p, validateConfidence: Number(e.target.value) || 68 }))} className="rounded-xl border border-zinc-800 bg-black px-2 py-2 text-xs outline-none" />
                              <input type="number" value={decisionSettings.executeConfidence} onChange={(e) => setDecisionSettings((p) => ({ ...p, executeConfidence: Number(e.target.value) || 82 }))} className="rounded-xl border border-zinc-800 bg-black px-2 py-2 text-xs outline-none" />
                            </div>
                          </div>
                          <label className="flex items-center justify-between gap-3"><span>Auto Move SL to BE after TP1</span><input type="checkbox" checked={tradeManagerSettings.autoMoveBE} onChange={(e) => setTradeManagerSettings((p) => ({ ...p, autoMoveBE: e.target.checked }))} /></label>
                          <label className="flex items-center justify-between gap-3"><span>Auto Partial Close on TP</span><input type="checkbox" checked={tradeManagerSettings.autoPartialClose} onChange={(e) => setTradeManagerSettings((p) => ({ ...p, autoPartialClose: e.target.checked }))} /></label>
                          <label className="flex items-center justify-between gap-3"><span>Trailing SL after TP</span><input type="checkbox" checked={tradeManagerSettings.trailingEnabled} onChange={(e) => setTradeManagerSettings((p) => ({ ...p, trailingEnabled: e.target.checked }))} /></label>
                          <label className="flex items-center justify-between gap-3"><span>External Alerts Enabled</span><input type="checkbox" checked={externalAlertSettings.enabled} onChange={(e) => setExternalAlertSettings((p) => ({ ...p, enabled: e.target.checked }))} /></label>
                          <label className="flex items-center justify-between gap-3"><span>Discord Compact Signal Format</span><input type="checkbox" checked={externalAlertSettings.discordSignalOnly} onChange={(e) => setExternalAlertSettings((p) => ({ ...p, discordSignalOnly: e.target.checked }))} /></label>
                          <label className="flex items-center justify-between gap-3"><span>Auto Send Discord Signals</span><input type="checkbox" checked={externalAlertSettings.autoDiscordSignals} onChange={(e) => setExternalAlertSettings((p) => ({ ...p, autoDiscordSignals: e.target.checked }))} /></label>
                          <input value={externalAlertSettings.discordWebhook} onChange={(e) => setExternalAlertSettings((p) => ({ ...p, discordWebhook: e.target.value }))} placeholder="Discord webhook URL" className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2 text-xs outline-none" />
                          <label className="block text-xs text-gray-500">Min Discord signal confidence</label>
                          <input type="number" min={1} max={100} value={externalAlertSettings.minSignalConfidence} onChange={(e) => setExternalAlertSettings((p) => ({ ...p, minSignalConfidence: Math.max(1, Math.min(100, Number(e.target.value) || 62)) }))} className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2 text-xs outline-none" />
                          <input value={externalAlertSettings.telegramWebhook} onChange={(e) => setExternalAlertSettings((p) => ({ ...p, telegramWebhook: e.target.value }))} placeholder="Telegram / bot webhook URL" className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2 text-xs outline-none" />
                          <input value={externalAlertSettings.emailWebhook} onChange={(e) => setExternalAlertSettings((p) => ({ ...p, emailWebhook: e.target.value }))} placeholder="Email webhook URL" className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2 text-xs outline-none" />
                          <div className="rounded-xl border border-zinc-800 bg-black/60 p-3 space-y-2">
                            <p className="text-[11px] font-black text-yellow-500">Signal Subscriptions</p>
                            <div className="grid grid-cols-4 gap-1 text-[10px]">
                              {["1m", "3m", "5m", "15m", "30m", "1H", "4H", "1D"].map((tf) => (
                                <label key={tf} className="flex items-center gap-1">
                                  <input type="checkbox" checked={signalSubscriptionSettings.timeframes[tf] !== false} onChange={(e) => setSignalSubscriptionSettings((p) => ({ ...p, timeframes: { ...p.timeframes, [tf]: e.target.checked } }))} />
                                  <span>{tf}</span>
                                </label>
                              ))}
                            </div>
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-1"><input type="checkbox" checked={signalSubscriptionSettings.modes.SCALP} onChange={(e) => setSignalSubscriptionSettings((p) => ({ ...p, modes: { ...p.modes, SCALP: e.target.checked } }))} /><span>SCALP</span></label>
                              <label className="flex items-center gap-1"><input type="checkbox" checked={signalSubscriptionSettings.modes.SWING} onChange={(e) => setSignalSubscriptionSettings((p) => ({ ...p, modes: { ...p.modes, SWING: e.target.checked } }))} /><span>SWING</span></label>
                            </div>
                            <input type="number" value={signalSubscriptionSettings.minConfidence} onChange={(e) => setSignalSubscriptionSettings((p) => ({ ...p, minConfidence: Math.max(1, Math.min(100, Number(e.target.value) || 70)) }))} className="w-full rounded-lg border border-zinc-800 bg-black px-2 py-1 text-xs" />
                            <input type="number" value={signalSubscriptionSettings.maxFeedRows} onChange={(e) => setSignalSubscriptionSettings((p) => ({ ...p, maxFeedRows: Math.max(3, Math.min(50, Number(e.target.value) || 12)) }))} className="w-full rounded-lg border border-zinc-800 bg-black px-2 py-1 text-xs" />
                            <label className="flex items-center justify-between"><span>Allow Multi-Timeframe Trades</span><input type="checkbox" checked={signalSubscriptionSettings.allowMultiTimeframeTrades} onChange={(e) => setSignalSubscriptionSettings((p) => ({ ...p, allowMultiTimeframeTrades: e.target.checked }))} /></label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-zinc-800 p-3">

                    <div className="flex gap-2">
                      <input
                        value={aiInput}
                        onChange={(e) => setAiInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !aiThinking) sendAIMessage(); }}
                        placeholder="Ask Wolvrene AI about this market, trade, risk, or entry..."
                        disabled={aiThinking}
                        className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm outline-none focus:border-yellow-700 disabled:opacity-60"
                      />
                      <button disabled={aiThinking} onClick={() => sendAIMessage()} className="rounded-xl bg-yellow-600 px-5 py-3 text-sm font-black text-black hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60">{aiThinking ? "Thinking" : "Send"}</button>
                    </div>
                  </div>
                </div>

                <div className="border-l border-zinc-800 bg-black/35 p-4 space-y-3 overflow-y-auto overscroll-contain">
                  <div className="rounded-2xl border border-zinc-800 bg-black/70 p-3">
                    <p className="text-[11px] text-gray-500 mb-2">Explanation Mode</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(["Beginner", "Trader", "Pro"] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setAiExplanationMode(mode)}
                          className={`rounded-lg px-2 py-1 text-xs border ${aiExplanationMode === mode ? "border-yellow-500 bg-yellow-500/15 text-yellow-300" : "border-zinc-800 text-gray-400 hover:border-yellow-700"}`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                  <h3 className="text-sm font-bold text-gray-300">Quick Actions</h3>
                  {[
                    ["analyze", "Analyze BTC Now"],
                    ["entry", "Best Entry?"],
                    ["risk", "Risk Check"],
                    ["manage", "Manage Trade"],
                    ["session", "Session Outlook"],
                  ].map(([action, label]) => (
                    <button
                      key={action}
                      onClick={() => runAIQuickAction(action as "analyze" | "entry" | "risk" | "manage" | "session")}
                      className="w-full rounded-xl border border-zinc-800 bg-[#09090b] p-3 text-left text-sm hover:border-yellow-700 hover:text-yellow-400"
                    >
                      {label}
                    </button>
                  ))}

                  <div className="rounded-2xl border border-yellow-700/25 bg-yellow-500/5 p-4">
                    <p className="text-xs text-yellow-500 mb-2">AI Bridge Status: {aiBridgeStatus.toUpperCase()}</p>
                    <p className="text-xs leading-5 text-gray-400">AI reads unified terminal context (brain, radar, signal feed, selected trade, active trade, chart snapshot, and Smart Fib engine context) with intent guard + rate protection.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {contextMenu.open && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="fixed z-[60] w-52 rounded-xl border border-zinc-700 bg-[#111116] p-2 shadow-2xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <p className="px-3 py-2 text-xs text-gray-500">Price: {formatPrice(contextMenu.price)}</p>

            <button onClick={() => addAlert(contextMenu.price, "above")} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-zinc-800">
              Alert Above
            </button>

            <button onClick={() => addAlert(contextMenu.price, "below")} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-zinc-800">
              Alert Below
            </button>

            <button onClick={() => createOrder("LONG", contextMenu.price)} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-zinc-800">
              Long Limit Here
            </button>

            <button onClick={() => createOrder("SHORT", contextMenu.price)} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-zinc-800">
              Short Limit Here
            </button>

            <button
              onClick={() => {
                navigator.clipboard?.writeText(contextMenu.price.toFixed(2));
                setContextMenu({ open: false, x: 0, y: 0, price: 0 });
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-zinc-800"
            >
              Copy Price
            </button>

            <button onClick={resetDashboard} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-zinc-800">
              Reset Chart
            </button>

            <button
              onClick={() => {
                setSmartFibEnabled(!smartFibEnabled);
                setContextMenu({ open: false, x: 0, y: 0, price: 0 });
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-zinc-800"
            >
              Smart Fib: {smartFibEnabled ? "ON" : "OFF"}
            </button>

            <button
              onClick={() => {
                setSmartFibSettingsOpen(true);
                setContextMenu({ open: false, x: 0, y: 0, price: 0 });
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-zinc-800"
            >
              Smart Fib Settings
            </button>

            <button
              onClick={() => {
                setSettingsOpen(true);
                setContextMenu({ open: false, x: 0, y: 0, price: 0 });
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-zinc-800"
            >
              Chart Settings
            </button>
          </div>
        )}

        {hideUI && (
          <button
            onClick={() => setHideUI(false)}
            className="fixed bottom-5 right-5 z-40 rounded-xl border border-yellow-700 bg-black px-4 py-3 text-yellow-400 shadow-xl"
          >
            Show UI
          </button>
        )}

        {lineEditor && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[#151519] border border-[#303038] rounded-2xl w-full max-w-md p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold">
                  {lineEditor.type === "tp"
                    ? "Take Profit Control"
                    : lineEditor.type === "sl"
                    ? "Stop Loss Control"
                    : lineEditor.type === "entry"
                    ? "Entry Control"
                    : "Alert Control"}
                </h2>
                <button onClick={() => setLineEditor(null)} className="text-2xl text-gray-400 hover:text-white">
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="text-xs text-gray-500">Price</span>
                  <input
                    type="number"
                    value={Number(editorCurrentPrice.toFixed(2))}
                    onChange={(e) => {
                      const price = Number(e.target.value);

                      if (!lineEditor) return;

                      if (lineEditor.type === "alert") updateAlert(lineEditor.alertId, { price, hit: false });
                      if (lineEditor.type === "entry" && editorOrderValue) updateOrder(editorOrderValue.id, { entry: price });
                      if (lineEditor.type === "sl" && editorOrderValue) updateOrder(editorOrderValue.id, { sl: price });
                      if (lineEditor.type === "tp" && editorOrderValue && editorTPValue) {
                        updateTP(editorOrderValue.id, editorTPValue.id, { price });
                      }
                    }}
                    className="w-full mt-1 bg-black border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-yellow-700"
                  />
                </label>

                {lineEditor.type === "tp" && editorOrderValue && editorTPValue && (
                  <>
                    <div className="rounded-xl bg-black/70 border border-zinc-800 p-4">
                      <div className="flex justify-between text-xs text-gray-500 mb-2">
                        <span>Close Size</span>
                        <span>{editorTPValue.closePct}%</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={editorTPValue.closePct}
                        onChange={(e) => updateTP(editorOrderValue.id, editorTPValue.id, { closePct: Number(e.target.value) })}
                        className="w-full"
                      />

                      <div className="grid grid-cols-4 gap-2 mt-3">
                        {[25, 50, 75, 100].map((pct) => (
                          <button
                            key={pct}
                            onClick={() => updateTP(editorOrderValue.id, editorTPValue.id, { closePct: pct })}
                            className="rounded-lg bg-zinc-800 py-2 text-xs hover:bg-zinc-700"
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl bg-black/70 border border-zinc-800 p-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Profit</span>
                        <span className="text-green-400">
                          {profitPct(editorOrderValue.side, editorOrderValue.entry, editorTPValue.price).toFixed(2)}%
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        deleteTP(editorOrderValue.id, editorTPValue.id);
                        setLineEditor(null);
                      }}
                      className="w-full rounded-xl bg-red-500/15 border border-red-500/30 py-3 text-sm font-bold text-red-400 hover:bg-red-500/25"
                    >
                      Delete This TP
                    </button>
                  </>
                )}

                {lineEditor.type === "sl" && editorOrderValue && (
                  <div className="rounded-xl bg-black/70 border border-zinc-800 p-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Risk</span>
                      <span className="text-red-400">
                        {riskPct(editorOrderValue.side, editorOrderValue.entry, editorOrderValue.sl).toFixed(2)}%
                      </span>
                    </div>

                    <button
                      onClick={() => updateOrder(editorOrderValue.id, { sl: editorOrderValue.entry })}
                      className="w-full mt-4 rounded-xl bg-zinc-800 py-2 text-xs hover:bg-zinc-700"
                    >
                      Move SL to Breakeven
                    </button>
                  </div>
                )}

                {lineEditor.type === "alert" && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => updateAlert(lineEditor.alertId, { side: "above", hit: false })}
                      className="rounded-xl bg-zinc-800 py-3 text-sm hover:bg-zinc-700"
                    >
                      Above
                    </button>
                    <button
                      onClick={() => updateAlert(lineEditor.alertId, { side: "below", hit: false })}
                      className="rounded-xl bg-zinc-800 py-3 text-sm hover:bg-zinc-700"
                    >
                      Below
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setLineEditor(null)}
                  className="w-full rounded-xl py-3 font-bold text-black"
                  style={{ backgroundColor: gold }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {journalOpen && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[#151519] border border-[#303038] rounded-2xl w-full max-w-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-2xl font-bold">Wolvrene Journal</h2>
                <button onClick={() => setJournalOpen(false)} className="text-2xl text-gray-400 hover:text-white">
                  ×
                </button>
              </div>

              <textarea
                value={journalNote}
                onChange={(e) => setJournalNote(e.target.value)}
                placeholder="Write market note, trade idea, or signal observation..."
                className="w-full h-28 bg-black border border-zinc-800 rounded-xl p-4 text-sm outline-none focus:border-yellow-700"
              />

              <div className="flex gap-3 mt-3">
                <button onClick={saveJournalNote} className="px-5 py-3 rounded-xl text-black font-bold" style={{ backgroundColor: gold }}>
                  Save Note
                </button>
                <button onClick={clearJournal} className="px-5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700">
                  Clear
                </button>
              </div>

              <div className="mt-5 space-y-3 max-h-72 overflow-auto">
                {journalEntries.length === 0 && <p className="text-sm text-gray-500">No journal entries yet.</p>}

                {journalEntries.map((entry) => (
                  <div key={entry.id} className="bg-black/70 border border-zinc-800 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-2">{entry.time}</p>
                    <p className="text-sm text-gray-200">{entry.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {alertsOpen && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[#151519] border border-[#303038] rounded-2xl w-full max-w-xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-2xl font-bold">Price Alerts</h2>
                <button onClick={() => setAlertsOpen(false)} className="text-2xl text-gray-400 hover:text-white">
                  ×
                </button>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => addAlert(undefined, "above")}
                    className="rounded-xl border border-yellow-700 bg-black p-3 text-sm hover:bg-zinc-900"
                  >
                    New Above
                  </button>
                  <button
                    onClick={() => addAlert(undefined, "below")}
                    className="rounded-xl border border-yellow-700 bg-black p-3 text-sm hover:bg-zinc-900"
                  >
                    New Below
                  </button>
                </div>

                <div className="space-y-2 max-h-80 overflow-auto">
                  {alerts.length === 0 && <p className="text-sm text-gray-500">No alerts.</p>}

                  {alerts.map((alert) => (
                    <div key={alert.id} className="rounded-xl bg-black border border-zinc-800 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={alert.hit ? "text-red-400 text-sm font-bold" : "text-yellow-400 text-sm font-bold"}>
                            {alert.hit ? "HIT" : alert.side.toUpperCase()}
                          </p>
                          <p className="text-sm">{formatPrice(alert.price)}</p>
                        </div>

                        <div className="flex gap-2">
                          <button onClick={() => openLineEditor({ type: "alert", alertId: alert.id })} className="text-xs text-gray-400 hover:text-white">
                            Edit
                          </button>
                          <button onClick={() => deleteAlert(alert.id)} className="text-xs text-red-400">
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={alert.enabled}
                            onChange={(e) => updateAlert(alert.id, { enabled: e.target.checked })}
                          />
                          Enabled
                        </label>

                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={alert.sound}
                            onChange={(e) => updateAlert(alert.id, { sound: e.target.checked })}
                          />
                          Sound
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={beep} className="px-5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700">
                  Test Sound
                </button>
              </div>
            </div>
          </div>
        )}

        {settingsOpen && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[#151519] border border-[#303038] rounded-2xl w-full max-w-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Chart Settings</h2>
                <button onClick={() => setSettingsOpen(false)} className="text-2xl text-gray-400 hover:text-white">
                  ×
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {[
                  ["Bull Candle", "bullColor"],
                  ["Bear Candle", "bearColor"],
                  ["Background", "backgroundColor"],
                  ["Text", "textColor"],
                  ["Grid Color", "gridColor"],
                ].map(([label, key]) => (
                  <label key={key} className="flex items-center justify-between bg-black/70 border border-zinc-800 p-4 rounded-xl">
                    <span className="text-sm text-gray-300">{label}</span>
                    <input
                      type="color"
                      value={settings[key as keyof ChartSettings] as string}
                      onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                    />
                  </label>
                ))}

                <label className="flex items-center justify-between bg-black/70 border border-zinc-800 p-4 rounded-xl">
                  <span className="text-sm text-gray-300">Show Grid</span>
                  <input
                    type="checkbox"
                    checked={settings.showGrid}
                    onChange={(e) => setSettings({ ...settings, showGrid: e.target.checked })}
                    className="w-5 h-5"
                  />
                </label>
              </div>

              <div className="flex justify-between mt-8">
                <button onClick={() => setSettings(defaultSettings)} className="bg-zinc-800 px-5 py-3 rounded-xl hover:bg-zinc-700">
                  Reset Default
                </button>
                <button onClick={() => setSettingsOpen(false)} className="px-6 py-3 rounded-xl font-bold text-black" style={{ backgroundColor: gold }}>
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {smartFibSettingsOpen && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[#151519] border border-[#303038] rounded-2xl w-full max-w-4xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Smart Fib Settings</h2>
                <button onClick={() => setSmartFibSettingsOpen(false)} className="text-2xl text-gray-400 hover:text-white">
                  ×
                </button>
              </div>

              <SmartFibSettingsPanel
                settings={smartFibSettings}
                onSettingsChange={(newSettings) => {
                  setSmartFibSettings({ ...smartFibSettings, ...newSettings });
                  smartFibEngine.updateSettings(newSettings);
                }}
                onReset={() => {
                  setSmartFibSettings({ ...SMART_FIB_DEFAULTS });
                  smartFibEngine.updateSettings(SMART_FIB_DEFAULTS);
                }}
              />

              <div className="flex justify-end mt-8">
                <button onClick={() => setSmartFibSettingsOpen(false)} className="px-6 py-3 rounded-xl font-bold text-black" style={{ backgroundColor: gold }}>
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// WOLVRENE v33 PRECISION BUILD FINAL: one-brain decision, multi-asset selector, compact stable labels, signal cooldown, deep history, liquidity filtering.

// WOLVRENE v34 LEVEL 2 SIGNAL ELITE FINAL: persistent candle history, elite AI score, MTF confluence, journal UI, analytics UI, backtest UI, stricter signal gate.

// WOLVRENE v35 INSTITUTIONAL AI PRO REAL FINAL: all planned v35 modules are wired into state, scoring, journal, auto-close, analytics, session sniper, and UI panels.


/*
SERVER ROUTE NEEDED:
Create this file in your Next.js project:

app/api/wolvrene/access/check/route.ts

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { email } = await req.json();

  // Replace this mock with Whop API / database membership check.
  // Return active: true only for paid VIP members.
  const allowedEmails = (process.env.WOLVRENE_ALLOWED_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

  const active = allowedEmails.includes(String(email || "").toLowerCase());

  return NextResponse.json({
    active,
    message: active ? "Access granted" : "No active VIP subscription found",
  });
}
*/
