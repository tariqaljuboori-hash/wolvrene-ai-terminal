import type { SMART_FIB_DEFAULTS } from "./SmartFibDefaults";

export interface SmartFibPivot {
  type: "HIGH" | "LOW";
  index: number;
  time: number;
  price: number;
  confirmedAtIndex: number;
  strength?: number;
}

export interface SmartFibMapCandidate {
  swingHigh: SmartFibPivot;
  swingLow: SmartFibPivot;
  range: number;
  setupType: "LONG_MAP" | "SHORT_MAP";
  quality: number;
  age: number;
  invalidated: boolean;
}

export interface SmartFibLevel {
  level: number;
  price: number;
  name: string;
  enabled: boolean;
  priority: number;
  quality?: string;
  zoneType?: "SNIPER" | "SILVER" | "SUPPORT" | "NONE";
  distance?: number;
  distanceAtr?: number;
}

export interface SmartFibTradeLevels {
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  zone: string;
  invalidation?: number;
}

export interface SmartFibSignal {
  id: string;
  timestamp: number;
  symbol: string;
  timeframe: string;
  type:
    | "NEW_SWING_PAIR"
    | "NEW_FIB_MAP"
    | "SNIPER_TOUCH"
    | "SNIPER_CONFIRM"
    | "SECOND_GOLD_TOUCH"
    | "EARLY_VALID"
    | "FRONT_RUN"
    | "LONG_SIGNAL"
    | "SHORT_SIGNAL"
    | "TP1_HIT"
    | "TP2_HIT"
    | "TP3_HIT"
    | "SL_HIT"
    | "FIB_INVALIDATED"
    | "HTF_CONFLICT"
    | "MTF_STACK";
  side: "LONG" | "SHORT" | "NONE";
  setupType: "LONG_MAP" | "SHORT_MAP" | "WAITING";
  level?: number;
  levelName?: string;
  price?: number;
  entry?: number;
  sl?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  score?: number;
  qualityClass?: string;
  executable: boolean;
  status: "WATCH" | "VALIDATED" | "EXECUTABLE" | "INVALIDATED" | "MANAGED";
  reason: string;
}

export interface SmartFibBox {
  type: "DEMAND" | "SUPPLY";
  high: number;
  low: number;
  strength: number;
  touches: number;
  retests: number;
  quality: string;
}

export interface SmartFibContext {
  enabled: boolean;
  settings?: typeof SMART_FIB_DEFAULTS;

  symbol: string;
  timeframe: string;

  mapState:
    | "DISABLED"
    | "WAITING_FOR_CANDLES"
    | "WAITING_FOR_SWING_PAIR"
    | "RANGE_TOO_SMALL"
    | "COMPRESSED_LEVELS"
    | "LONG_MAP"
    | "SHORT_MAP"
    | "INVALIDATED"
    | "REANCHORED"
    | "FALLBACK_ACTIVE";

  setupType: "LONG_MAP" | "SHORT_MAP" | "WAITING";

  swingHigh?: number;
  swingLow?: number;
  swingHighIndex?: number;
  swingLowIndex?: number;
  swingHighTime?: number;
  swingLowTime?: number;
  swingHighPivot?: SmartFibPivot;
  swingLowPivot?: SmartFibPivot;
  swingQualityScore?: number;
  swingSelectionReason?: string;
  swingAgeCandles?: number;

  activeRange?: number;
  activeFibLevels: SmartFibLevel[];
  confirmedPivots: SmartFibPivot[];

  activeMap?: SmartFibMapCandidate;
  mapCandidates: SmartFibMapCandidate[];

  invalidationReason?: string;
  reanchorReason?: string;
  fallbackReason?: string;

  atr?: number;
  rangeQuality?: "TOO_SMALL" | "COMPRESSED" | "GOOD";

  currentZoneState?: "NONE" | "SILVER_WATCH" | "SILVER_ACTIVE" | "SNIPER_WATCH" | "SNIPER_ACTIVE" | "SNIPER_CONFLICT";
  closestImportantLevel?: SmartFibLevel & { distance: number; distanceAtr: number };

  activeBoxes: SmartFibBox[];

  currentSignal?: SmartFibSignal;
  tradeLevels?: SmartFibTradeLevels;

  dashboardSummary: string;
  lastSignals: SmartFibSignal[];
}

export interface SmartFibEntryCandidate {
  level: number;
  levelName: string;
  price: number;
  score: number;
  quality: string;
  executable: boolean;
}

export interface SmartFibTrade {
  side: "LONG" | "SHORT";
  entry: number;
  size: number;
  sl: number;
  tp1: number;
  tp2?: number;
  tp3?: number;
  tpHits: boolean[];
  pnl: number;
  roe: number;
  status: "ACTIVE" | "CLOSED_TP" | "CLOSED_SL";
}