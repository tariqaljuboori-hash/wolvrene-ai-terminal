import type { SMART_FIB_DEFAULTS } from "./SmartFibDefaults";

/**
 * Unified Smart Fib zone state type used consistently throughout the system.
 * - NONE: No zone activity
 * - MAP_ONLY: Map valid but price not near important fib levels
 * - SILVER_WATCH: Price approaching 0.65 / 0.618 levels
 * - SILVER_ACTIVE: Price at 0.65 / 0.618 levels (within range)
 * - SNIPER_WATCH: Price approaching 0.882 / 0.941 levels
 * - SNIPER_ACTIVE: Price at 0.882 / 0.941 levels (within range)
 * - SNIPER_CONFLICT: Price near sniper levels but conflicting with structure
 * - SILVER_CONFLICT: Price near silver levels but conflicting with structure
 */
export type SmartFibZoneState =
  | "NONE"
  | "MAP_ONLY"
  | "SILVER_WATCH"
  | "SILVER_ACTIVE"
  | "SILVER_CONFLICT"
  | "SNIPER_WATCH"
  | "SNIPER_ACTIVE"
  | "SNIPER_CONFLICT";

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
  source?: "RECENT_ADJACENT" | "RECENT_NON_ADJACENT" | "DOMINANT_FALLBACK";
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
  selectedCandidateSource?: "RECENT_ADJACENT" | "RECENT_NON_ADJACENT" | "DOMINANT_FALLBACK" | "FIRST_BOOT";

  invalidationReason?: string;
  reanchorReason?: string;
  fallbackReason?: string;

  atr?: number;
  rangeQuality?: "TOO_SMALL" | "COMPRESSED" | "GOOD";

  currentZoneState?: SmartFibZoneState;
  closestImportantLevel?: SmartFibLevel & { distance: number; distanceAtr: number };

  // Sniper state detection (0.882 / 0.941 sniper zones)
  smartFibSniperState?: "NONE" | "SNIPER_WATCH" | "SNIPER_ARMED" | "SNIPER_REACTION" | "SNIPER_FAILED";
  smartFibSniperLevelName?: "SNIPER_GOLD_882" | "SNIPER_EXTREME_941" | null;
  smartFibSniperLevelPrice?: number | null;
  smartFibSniperDistanceAtr?: number | null;
  smartFibSniperTouched?: boolean;
  smartFibSniperRejected?: boolean;
  smartFibSniperDirection?: "LONG" | "SHORT" | null;
  smartFibSniperReason?: string;

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