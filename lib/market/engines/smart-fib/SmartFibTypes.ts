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

export interface SmartFibContext {
  enabled: boolean;
  mapState: "WAITING" | "LONG_MAP" | "SHORT_MAP";
  setupType: "LONG_MAP" | "SHORT_MAP" | "WAITING";
  swingHigh?: number;
  swingLow?: number;
  swingHighIndex?: number;
  swingLowIndex?: number;
  activeRange?: number;
  activeFibLevels: number[];
  strongestLevels: number[];
  sniperLevels: number[];
  secondGoldLevels: number[];
  activeBoxes: SmartFibBox[];
  bestDemandBox?: SmartFibBox;
  bestSupplyBox?: SmartFibBox;
  lastTouchedLevel?: number;
  lastReactionQuality?: string;
  bestLevelQuality?: string;
  entryCandidates: SmartFibEntryCandidate[];
  currentSignal?: SmartFibSignal;
  activeTrade?: SmartFibTrade;
  tradeLevels?: SmartFibTradeLevels;
  invalidation?: string;
  htfAlignment?: "BULLISH" | "BEARISH" | "NEUTRAL" | "CONFLICT";
  emaConfluence?: number;
  dashboardSummary: string;
  lastSignals: SmartFibSignal[];
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

export interface SmartFibTradeLevels {
  entry: number;
  sl: number;
  tp1: number;
  tp2?: number;
  tp3?: number;
}