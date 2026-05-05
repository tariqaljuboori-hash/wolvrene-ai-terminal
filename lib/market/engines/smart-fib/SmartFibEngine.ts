import type { Candle } from "@/types/trading";
import { SMART_FIB_DEFAULTS } from "./SmartFibDefaults";
import type {
  SmartFibContext,
  SmartFibSignal,
  SmartFibPivot,
  SmartFibMapCandidate,
  SmartFibLevel,
  SmartFibBox,
  SmartFibTradeLevels,
} from "./SmartFibTypes";

export class SmartFibEngine {
  private settings = { ...SMART_FIB_DEFAULTS };
  private contexts = new Map<string, SmartFibContext>();
  private candles = new Map<string, Candle[]>();
  private lastSignalTime: Map<string, number> = new Map();

  updateSettings(newSettings: Partial<typeof SMART_FIB_DEFAULTS>): void {
    const oldSettings = { ...this.settings };
    this.settings = { ...this.settings, ...newSettings };

    // List of settings that require map rebuild
    const rebuildTriggers = [
      "pivotLeft",
      "pivotRight",
      "minSwingRangeAtr",
      "minSwingRangePercent",
      "maxMapAgeBars",
      "protectDominantMap",
      "enableFallback",
      "smartFibSwingSelectionMode",
    ];

    const shouldRebuild = rebuildTriggers.some(
      (key) => oldSettings[key as keyof typeof SMART_FIB_DEFAULTS] !== newSettings[key as keyof typeof SMART_FIB_DEFAULTS]
    );

    for (const context of this.contexts.values()) {
      if (shouldRebuild) {
        // Trigger full rebuild from stored candles
        const key = this.getContextKey(context.symbol, context.timeframe);
        const storedCandles = this.candles.get(key) || [];
        
        this.resetContextMap(context);
        context.enabled = true;
        
        if (storedCandles.length > 0) {
          context.mapState = "WAITING_FOR_CANDLES";
          // Will trigger rebuild on next processCandle call or manually
          this.rebuildFromCandles(context, key, storedCandles);
        } else {
          context.mapState = "WAITING_FOR_CANDLES";
        }
      } else {
        // Just reset the map without full rebuild
        this.resetContextMap(context);
        if (context.enabled) {
          context.mapState = "WAITING_FOR_CANDLES";
        }
      }
    }
  }

  private resetContextMap(context: SmartFibContext): void {
    context.setupType = "WAITING";
    context.swingHigh = undefined;
    context.swingLow = undefined;
    context.swingHighIndex = undefined;
    context.swingLowIndex = undefined;
    context.swingHighTime = undefined;
    context.swingLowTime = undefined;
    context.swingHighPivot = undefined;
    context.swingLowPivot = undefined;
    context.swingQualityScore = undefined;
    context.swingSelectionReason = undefined;
    context.swingAgeCandles = undefined;
    context.activeRange = undefined;
    context.activeFibLevels = [];
    context.confirmedPivots = [];
    context.activeMap = undefined;
    context.mapCandidates = [];
    context.invalidationReason = undefined;
    context.reanchorReason = undefined;
    context.fallbackReason = undefined;
    context.atr = undefined;
    context.rangeQuality = undefined;
    context.activeBoxes = [];
    context.currentSignal = undefined;
    context.tradeLevels = undefined;
    context.currentZoneState = "NONE";
    context.closestImportantLevel = undefined;
    context.dashboardSummary = "Smart Fib rebuilding...";
  }

  private getContextKey(symbol: string, timeframe: string): string {
    return `${symbol}_${timeframe}`;
  }

  private getOrCreateContext(symbol: string, timeframe: string): SmartFibContext {
    const key = this.getContextKey(symbol, timeframe);

    if (!this.contexts.has(key)) {
      this.contexts.set(key, {
        enabled: false,
        symbol,
        timeframe,
        mapState: "DISABLED",
        setupType: "WAITING",
        activeFibLevels: [],
        confirmedPivots: [],
        mapCandidates: [],
        activeBoxes: [],
        dashboardSummary: "Smart Fib Engine initializing...",
        lastSignals: [],
      });
    }

    return this.contexts.get(key)!;
  }

  getContext(symbol: string, timeframe: string): SmartFibContext {
    const context = this.getOrCreateContext(symbol, timeframe);

    return {
      ...context,
      settings: { ...this.settings },
    };
  }

  enable(symbol: string, timeframe: string): void {
    const context = this.getOrCreateContext(symbol, timeframe);
    context.enabled = true;
    context.mapState = "WAITING_FOR_CANDLES";
    this.updateDashboardSummary(context);
  }

  disable(symbol: string, timeframe: string): void {
    const context = this.getOrCreateContext(symbol, timeframe);
    context.enabled = false;
    context.mapState = "DISABLED";
    context.activeFibLevels = [];
    context.activeBoxes = [];
    context.currentSignal = undefined;
    context.tradeLevels = undefined;
    this.updateDashboardSummary(context);
  }

  processCandles(symbol: string, timeframe: string, newCandles: Candle[]): SmartFibSignal[] {
    const context = this.getOrCreateContext(symbol, timeframe);
    if (!context.enabled) return [];
    if (!newCandles.length) return [];

    const key = this.getContextKey(symbol, timeframe);
    const existingCandles = this.candles.get(key) || [];

    const candleMap = new Map<number, Candle>();

    for (const candle of existingCandles) {
      candleMap.set(Number(candle.time), candle);
    }

    for (const candle of newCandles) {
      candleMap.set(Number(candle.time), candle);
    }

    const mergedCandles = Array.from(candleMap.values())
      .filter(
        (candle) =>
          Number.isFinite(Number(candle.time)) &&
          Number.isFinite(candle.open) &&
          Number.isFinite(candle.high) &&
          Number.isFinite(candle.low) &&
          Number.isFinite(candle.close)
      )
      .sort((a, b) => Number(a.time) - Number(b.time));

    const maxCandles = Math.max(500, this.settings.maxMapAgeBars * 4);
    const trimmedCandles = mergedCandles.slice(-maxCandles);

    const previousLength = existingCandles.length;
    const shouldFullRebuild =
      previousLength === 0 ||
      context.confirmedPivots.length === 0 ||
      context.activeFibLevels.length === 0 ||
      newCandles.length > 5;

    if (shouldFullRebuild) {
      return this.rebuildFromCandles(context, key, trimmedCandles);
    }

    this.candles.set(key, trimmedCandles);

    const signals: SmartFibSignal[] = [];

    for (const candle of newCandles) {
      const candleSignals = this.processCandle(context, candle);
      signals.push(...candleSignals);
    }

    return signals;
  }

  private rebuildFromCandles(
    context: SmartFibContext,
    key: string,
    candles: Candle[]
  ): SmartFibSignal[] {
    const wasEnabled = context.enabled;
    const symbol = context.symbol;
    const timeframe = context.timeframe;
    const lastSignals = context.lastSignals;

    this.resetContextMap(context);

    context.enabled = wasEnabled;
    context.symbol = symbol;
    context.timeframe = timeframe;
    context.lastSignals = lastSignals;
    context.mapState = candles.length ? "WAITING_FOR_SWING_PAIR" : "WAITING_FOR_CANDLES";

    const signals: SmartFibSignal[] = [];
    const runningCandles: Candle[] = [];

    for (const candle of candles) {
      runningCandles.push(candle);
      this.candles.set(key, [...runningCandles]);

      const candleSignals = this.processCandle(context, candle);
      signals.push(...candleSignals);
    }

    this.candles.set(key, candles);
    this.updateDashboardSummary(context);

    return signals;
  }

  private processCandle(context: SmartFibContext, candle: Candle): SmartFibSignal[] {
    const signals: SmartFibSignal[] = [];

    if (context.mapState === "DISABLED") return signals;

    this.updateATR(context, candle);
    this.updatePivotDetection(context);
    this.updateMapSelection(context, candle);

    // Update closest level and zone state with current price
    this.updateClosestLevelWithPrice(context, candle.close);
    this.updateZoneStateWithPrice(context, candle.close);

    const touchSignals = this.checkLevelTouches(context, candle);
    signals.push(...touchSignals);

    this.updateBoxes(context, candle);
    this.updateTradeLevels(context, candle.close);

    const executableSignal = this.getCurrentExecutableSignal(
      context,
      candle.close,
      Number(candle.time)
    );

    if (executableSignal) {
      context.currentSignal = executableSignal;

      if (executableSignal.executable && !signals.some((signal) => signal.executable)) {
        signals.push(executableSignal);
      }
    }

    this.updateDashboardSummary(context);

    return signals;
  }

  private updateClosestLevelWithPrice(context: SmartFibContext, currentPrice: number): void {
    if (!context.activeFibLevels.length || !context.atr) {
      context.closestImportantLevel = undefined;
      return;
    }

    const importantLevels = context.activeFibLevels.filter(
      (level) => level.level === 0.882 || level.level === 0.941 || level.level === 0.618 || level.level === 0.65
    );

    if (!importantLevels.length) {
      context.closestImportantLevel = undefined;
      return;
    }

    let closest: SmartFibLevel & { distance: number; distanceAtr: number } | undefined;
    let minDistance = Infinity;

    for (const level of importantLevels) {
      const distance = Math.abs(currentPrice - level.price);
      if (distance < minDistance) {
        minDistance = distance;
        closest = {
          ...level,
          distance,
          distanceAtr: distance / context.atr,
        };
      }
    }

    context.closestImportantLevel = closest;
  }

  private updateZoneStateWithPrice(context: SmartFibContext, currentPrice: number): void {
    if (
      !context.activeFibLevels.length ||
      !context.atr ||
      context.mapState === "DISABLED" ||
      context.mapState === "INVALIDATED"
    ) {
      context.currentZoneState = "NONE";
      return;
    }

    const atr = context.atr;
    const sniperTolerance = atr * 0.12; // Tighter tolerance for sniper zones
    const silverTolerance = atr * 0.15; // Slightly wider for silver

    // Check sniper levels first (highest priority)
    const sniperLevels = context.activeFibLevels.filter(
      (level) => level.level === 0.882 || level.level === 0.941
    );

    for (const level of sniperLevels) {
      const distance = Math.abs(currentPrice - level.price);

      if (distance < sniperTolerance) {
        context.currentZoneState = "SNIPER_ACTIVE";
        return;
      } else if (distance < sniperTolerance * 1.8) {
        context.currentZoneState = "SNIPER_WATCH";
        return;
      }
    }

    // Check silver/reaction levels
    const silverLevels = context.activeFibLevels.filter(
      (level) => level.level === 0.618 || level.level === 0.65
    );

    for (const level of silverLevels) {
      const distance = Math.abs(currentPrice - level.price);

      if (distance < silverTolerance) {
        context.currentZoneState = "SILVER_ACTIVE";
        return;
      } else if (distance < silverTolerance * 1.8) {
        context.currentZoneState = "SILVER_WATCH";
        return;
      }
    }

    // If map is valid but price not near any important level
    if (context.mapState === "LONG_MAP" || context.mapState === "SHORT_MAP" || context.mapState === "FALLBACK_ACTIVE") {
      context.currentZoneState = "NONE";
    } else {
      context.currentZoneState = "NONE";
    }
  }

  private updateATR(context: SmartFibContext, candle: Candle): void {
    const trueRange = Math.max(
      Math.abs(candle.high - candle.low),
      Math.abs(candle.high - candle.close),
      Math.abs(candle.low - candle.close),
      candle.close * 0.001
    );

    if (!context.atr) {
      context.atr = trueRange;
    } else {
      context.atr = (context.atr * 13 + trueRange) / 14;
    }
  }

  private updatePivotDetection(context: SmartFibContext): void {
    const key = this.getContextKey(context.symbol, context.timeframe);
    const contextCandles = this.candles.get(key) || [];
    const pivotLeft = Math.max(1, Math.floor(this.settings.pivotLeft));
    const pivotRight = Math.max(1, Math.floor(this.settings.pivotRight));
    const requiredCandles = pivotLeft + pivotRight + 1;

    if (contextCandles.length < requiredCandles) {
      context.mapState = "WAITING_FOR_CANDLES";
      return;
    }

    const candidateIndex = contextCandles.length - 1 - pivotRight;
    if (candidateIndex < pivotLeft) return;

    const candidate = contextCandles[candidateIndex];
    if (!candidate) return;

    let isSwingHigh = true;
    let isSwingLow = true;

    for (let i = candidateIndex - pivotLeft; i <= candidateIndex + pivotRight; i++) {
      if (i === candidateIndex) continue;

      const comparisonCandle = contextCandles[i];
      if (!comparisonCandle) continue;

      if (comparisonCandle.high >= candidate.high) {
        isSwingHigh = false;
      }

      if (comparisonCandle.low <= candidate.low) {
        isSwingLow = false;
      }

      if (!isSwingHigh && !isSwingLow) break;
    }

    if (isSwingHigh) {
      this.addPivot(context, {
        type: "HIGH",
        index: candidateIndex,
        time: Number(candidate.time),
        price: candidate.high,
        confirmedAtIndex: contextCandles.length - 1,
      });
    }

    if (isSwingLow) {
      this.addPivot(context, {
        type: "LOW",
        index: candidateIndex,
        time: Number(candidate.time),
        price: candidate.low,
        confirmedAtIndex: contextCandles.length - 1,
      });
    }

    const maxPivots = 80;
    if (context.confirmedPivots.length > maxPivots) {
      context.confirmedPivots = context.confirmedPivots.slice(-maxPivots);
    }
  }

  private addPivot(context: SmartFibContext, pivot: SmartFibPivot): void {
    const duplicate = context.confirmedPivots.some(
      (existingPivot) =>
        existingPivot.type === pivot.type &&
        existingPivot.index === pivot.index &&
        existingPivot.price === pivot.price
    );

    if (duplicate) return;

    const lastPivot = context.confirmedPivots[context.confirmedPivots.length - 1];

    if (lastPivot && lastPivot.type === pivot.type) {
      const shouldReplace =
        (pivot.type === "HIGH" && pivot.price >= lastPivot.price) ||
        (pivot.type === "LOW" && pivot.price <= lastPivot.price);

      if (shouldReplace) {
        context.confirmedPivots[context.confirmedPivots.length - 1] = pivot;
      }

      return;
    }

    context.confirmedPivots.push(pivot);
  }

  private updateMapSelection(context: SmartFibContext, candle: Candle): void {
    if (context.confirmedPivots.length < 2) {
      context.mapState = "WAITING_FOR_SWING_PAIR";
      context.activeMap = undefined;
      context.activeFibLevels = [];
      context.tradeLevels = undefined;
      return;
    }

    const candidates = this.buildMapCandidates(context, candle);
    context.mapCandidates = candidates;

    if (candidates.length === 0) {
      context.mapState = "WAITING_FOR_SWING_PAIR";
      context.activeMap = undefined;
      context.activeFibLevels = [];
      context.tradeLevels = undefined;
      return;
    }

    // RECENCY-FIRST SORTING: Latest valid pair wins
    // Sort by:
    // 1. Candidate source (RECENT_ADJACENT highest priority, then RECENT_NON_ADJACENT, then DOMINANT_FALLBACK)
    // 2. Age of second pivot (newer first)
    // 3. Quality as tiebreaker
    candidates.sort((a, b) => {
      const sourceOrder = { "RECENT_ADJACENT": 0, "RECENT_NON_ADJACENT": 1, "DOMINANT_FALLBACK": 2 };
      const aSourceOrder = sourceOrder[a.source || "DOMINANT_FALLBACK"] ?? 2;
      const bSourceOrder = sourceOrder[b.source || "DOMINANT_FALLBACK"] ?? 2;

      if (aSourceOrder !== bSourceOrder) return aSourceOrder - bSourceOrder;

      // Among same source, newer (lower age) wins
      if (a.age !== b.age) return a.age - b.age;

      // Tiebreaker: higher quality
      return b.quality - a.quality;
    });

    // DEV MODE: Log top candidates
    if (process.env.NODE_ENV !== "production" && candidates.length > 0) {
      const topCandidates = candidates.slice(0, 5);
      console.debug(`[SmartFib ${context.symbol}_${context.timeframe}] Top ${topCandidates.length} candidates:`, 
        topCandidates.map(c => ({
          setup: c.setupType,
          source: c.source || "UNKNOWN",
          range: c.range.toFixed(2),
          age: c.age,
          quality: c.quality.toFixed(1),
          swingHigh: { price: c.swingHigh.price.toFixed(2), index: c.swingHigh.index },
          swingLow: { price: c.swingLow.price.toFixed(2), index: c.swingLow.index },
        }))
      );
    }

    const bestCandidate = candidates[0];
    const mode = context.settings?.smartFibSwingSelectionMode ?? "LATEST_VALID";

    // Determine if we need to change the active map
    if (!context.activeMap) {
      // No active map, apply the best candidate
      this.applyMapCandidate(context, bestCandidate);
      return;
    }

    const sameMap =
      context.activeMap.swingHigh.index === bestCandidate.swingHigh.index &&
      context.activeMap.swingLow.index === bestCandidate.swingLow.index &&
      context.activeMap.setupType === bestCandidate.setupType;

    if (sameMap) {
      // Same pair, no change needed
      return;
    }

    // Map change needed - apply based on selection mode
    if (mode === "LATEST_VALID") {
      // Latest valid pair always wins
      this.applyMapCandidate(context, bestCandidate);
    } else if (mode === "DOMINANT_PROTECTED") {
      // Older dominant map can stay only if clearly stronger and not stale
      const activeSecondIndex = Math.max(context.activeMap.swingHigh.index, context.activeMap.swingLow.index);
      const bestSecondIndex = Math.max(bestCandidate.swingHigh.index, bestCandidate.swingLow.index);

      const isActiveStale = context.activeMap.age && context.activeMap.age > this.settings.maxMapAgeBars * 0.6;
      const isActiveDominantlyStronger = context.activeMap.quality >= bestCandidate.quality + 12 &&
        context.activeMap.range >= bestCandidate.range * 1.6;

      if (isActiveStale || !isActiveDominantlyStronger) {
        this.applyMapCandidate(context, bestCandidate);
      }
    } else {
      this.applyMapCandidate(context, bestCandidate);
    }

    this.checkInvalidation(context, candle);
  }

  private buildMapCandidates(context: SmartFibContext, candle: Candle): SmartFibMapCandidate[] {
    const candidates: SmartFibMapCandidate[] = [];
    const pivots = context.confirmedPivots;
    const currentIndex = this.getCandlesForContext(context).length - 1;
    const contextCandles = this.getCandlesForContext(context);

    if (pivots.length < 2) return candidates;

    // PHASE 1: Recent adjacent opposite pivots (highest priority)
    // These are consecutive opposite-type pivots near the end
    for (let i = pivots.length - 1; i >= 1; i--) {
      const first = pivots[i - 1];
      const second = pivots[i];

      if (first.type !== second.type) {
        const candidate = this.buildCandidate(first, second, "RECENT_ADJACENT", currentIndex, contextCandles, candle);
        if (candidate) {
          candidates.push(candidate);
        }
      }
    }

    // PHASE 2: Recent non-adjacent opposite pivots
    // Find nearest opposite pivot to each recent pivot
    const recentWindow = Math.min(24, pivots.length);
    for (let i = pivots.length - 1; i >= 0; i--) {
      const second = pivots[i];
      let nearestOpposite: SmartFibPivot | undefined;
      let nearestDistance = Infinity;

      for (let j = i - 1; j >= 0; j--) {
        const candidate = pivots[j];
        if (candidate.type !== second.type) {
          const distance = i - j;
          if (distance < nearestDistance && distance >= 2) {
            nearestDistance = distance;
            nearestOpposite = candidate;
          }
        }
      }

      if (nearestOpposite && nearestDistance <= recentWindow) {
        const candidate = this.buildCandidate(nearestOpposite, second, "RECENT_NON_ADJACENT", currentIndex, contextCandles, candle);
        if (candidate && !candidates.some(c =>
          c.swingHigh.index === candidate.swingHigh.index &&
          c.swingLow.index === candidate.swingLow.index
        )) {
          candidates.push(candidate);
        }
      }
    }

    // PHASE 3: Dominant fallback (only if enabled or mode is DOMINANT_PROTECTED)
    const mode = context.settings?.smartFibSwingSelectionMode ?? "LATEST_VALID";
    if (context.settings?.enableFallback || mode === "DOMINANT_PROTECTED") {
      const fallbackWindow = Math.min(16, pivots.length);
      const fallbackPivots = pivots.slice(-fallbackWindow);

      for (let i = 0; i < fallbackPivots.length - 1; i++) {
        for (let j = i + 1; j < fallbackPivots.length; j++) {
          const pivot1 = fallbackPivots[i];
          const pivot2 = fallbackPivots[j];

          if (pivot1.type !== pivot2.type) {
            const candidate = this.buildCandidate(pivot1, pivot2, "DOMINANT_FALLBACK", currentIndex, contextCandles, candle);
            if (candidate && !candidates.some(c =>
              c.swingHigh.index === candidate.swingHigh.index &&
              c.swingLow.index === candidate.swingLow.index
            )) {
              candidates.push(candidate);
            }
          }
        }
      }
    }

    return candidates;
  }

  private buildCandidate(
    pivot1: SmartFibPivot,
    pivot2: SmartFibPivot,
    source: "RECENT_ADJACENT" | "RECENT_NON_ADJACENT" | "DOMINANT_FALLBACK",
    currentIndex: number,
    contextCandles: Candle[],
    candle: Candle
  ): SmartFibMapCandidate | undefined {
    if (pivot1.type === pivot2.type) return undefined;

    let swingHigh: SmartFibPivot;
    let swingLow: SmartFibPivot;
    let setupType: "LONG_MAP" | "SHORT_MAP";

    if (pivot1.type === "LOW" && pivot2.type === "HIGH") {
      swingLow = pivot1;
      swingHigh = pivot2;
      setupType = "LONG_MAP";
    } else if (pivot1.type === "HIGH" && pivot2.type === "LOW") {
      swingHigh = pivot1;
      swingLow = pivot2;
      setupType = "SHORT_MAP";
    } else {
      return undefined;
    }

    const range = swingHigh.price - swingLow.price;
    if (range <= 0) return undefined;

    const atr = Math.max(0.000001, this.getATR(contextCandles) || range * 0.02);
    const referencePrice = Math.max(candle.close || swingHigh.price, 0.000001);

    const rangeValid =
      range >= atr * this.settings.minSwingRangeAtr &&
      range >= referencePrice * this.settings.minSwingRangePercent;

    if (!rangeValid) return undefined;

    const age = Math.max(0, currentIndex - Math.max(swingHigh.index, swingLow.index));
    if (age > this.settings.maxMapAgeBars) return undefined;

    const quality = this.calculateRecencyFirstMapQuality(range, atr, age, source);

    const candidate: SmartFibMapCandidate = {
      swingHigh,
      swingLow,
      range,
      setupType,
      quality,
      age,
      invalidated: false,
      source,
    };

    if (this.isCandidateInvalidated(candidate, candle)) {
      return undefined;
    }

    return candidate;
  }

  private getATR(candles: Candle[]): number {
    if (candles.length < 2) return 0;
    let sumTR = 0;
    const period = Math.min(14, candles.length);

    for (let i = Math.max(0, candles.length - period); i < candles.length; i++) {
      const candle = candles[i];
      const prevClose = i > 0 ? candles[i - 1].close : candle.open;

      const tr = Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - prevClose),
        Math.abs(candle.low - prevClose)
      );

      sumTR += tr;
    }

    return sumTR / period;
  }

  private calculateRecencyFirstMapQuality(
    range: number,
    atr: number,
    age: number,
    source: "RECENT_ADJACENT" | "RECENT_NON_ADJACENT" | "DOMINANT_FALLBACK"
  ): number {
    const rangeRatio = range / Math.max(atr, 0.000001);

    // Base recency score: 55 points, -2.2 points per candle age
    const recencyScore = Math.max(0, 55 - age * 2.2);

    // Range quality score
    const rangeScore =
      rangeRatio >= 5 ? 25 :
      rangeRatio >= 3 ? 20 :
      rangeRatio >= 2 ? 15 :
      rangeRatio >= 1 ? 10 : 0;

    // Source bonus
    const sourceScore =
      source === "RECENT_ADJACENT" ? 14 :
      source === "RECENT_NON_ADJACENT" ? 8 :
      2;

    // Stale penalty
    const stalePenalty = age > this.settings.maxMapAgeBars * 0.6 ? 18 : 0;

    return Math.max(0, Math.min(100, recencyScore + rangeScore + sourceScore - stalePenalty));
  }

  private getCandlesForContext(context: SmartFibContext): Candle[] {
    const key = this.getContextKey(context.symbol, context.timeframe);
    return this.candles.get(key) || [];
  }

  private isCandidateInvalidated(candidate: SmartFibMapCandidate, candle: Candle): boolean {
    const range = candidate.range;
    const buffer = Math.max(range * 0.01, 0);

    if (candidate.setupType === "LONG_MAP") {
      return candle.close < candidate.swingLow.price - buffer;
    }

    return candle.close > candidate.swingHigh.price + buffer;
  }

  private applyMapCandidate(context: SmartFibContext, candidate: SmartFibMapCandidate): void {
    const contextCandles = this.getCandlesForContext(context);
    const currentIndex = contextCandles.length - 1;

    context.activeMap = candidate;
    context.setupType = candidate.setupType;
    context.swingHigh = candidate.swingHigh.price;
    context.swingLow = candidate.swingLow.price;
    context.swingHighIndex = candidate.swingHigh.index;
    context.swingLowIndex = candidate.swingLow.index;
    context.swingHighTime = candidate.swingHigh.time;
    context.swingLowTime = candidate.swingLow.time;
    context.swingHighPivot = candidate.swingHigh;
    context.swingLowPivot = candidate.swingLow;
    context.activeRange = candidate.range;
    context.swingQualityScore = candidate.quality;
    context.swingAgeCandles = Math.max(0, currentIndex - Math.max(candidate.swingHigh.index, candidate.swingLow.index));
    context.selectedCandidateSource = candidate.source || "FIRST_BOOT";
    
    // Generate selection reason
    context.swingSelectionReason = this.generateSelectionReason(candidate, context.swingAgeCandles || 0, candidate.source);
    
    context.invalidationReason = undefined;
    context.fallbackReason = undefined;

    this.generateFibLevels(context);
    this.checkLevelCompression(context);
    // Note: closest level and zone state will be updated when processing candles with current price

    // PART M: Compression is a warning only, not a blocker
    // TOO_SMALL blocks, COMPRESSED allows drawing but marks as warning
    if (context.rangeQuality === "TOO_SMALL") {
      context.mapState = "RANGE_TOO_SMALL";
    } else {
      // Map is valid regardless of compression warning
      context.mapState = candidate.setupType;
    }
  }

  private generateSelectionReason(
    candidate: SmartFibMapCandidate,
    ageCandles: number,
    source?: "RECENT_ADJACENT" | "RECENT_NON_ADJACENT" | "DOMINANT_FALLBACK"
  ): string {
    const reasons: string[] = [];

    // Source information
    if (source === "RECENT_ADJACENT") reasons.push("Recent adjacent pivots");
    else if (source === "RECENT_NON_ADJACENT") reasons.push("Recent non-adjacent pivots");
    else if (source === "DOMINANT_FALLBACK") reasons.push("Dominant fallback");
    else reasons.push("Latest valid");

    // Quality level
    if (candidate.quality >= 70) reasons.push("High quality");
    else if (candidate.quality >= 50) reasons.push("Good quality");
    else reasons.push("Valid quality");

    // Age/freshness
    if (ageCandles < 10) reasons.push("very recent");
    else if (ageCandles < 50) reasons.push("fresh");
    else if (ageCandles < 150) reasons.push("established");
    else reasons.push("reference");

    return reasons.join(" | ");
  }

  private calculateMapQuality(range: number, atr: number, age: number): number {
    let quality = 0;
    const rangeRatio = range / Math.max(atr, 0.000001);

    if (rangeRatio >= 5) quality += 65;
    else if (rangeRatio >= 3) quality += 50;
    else if (rangeRatio >= 2) quality += 35;
    else if (rangeRatio >= 1) quality += 20;

    quality -= age * 1.5;

    return Math.max(0, quality);
  }

  private calculateEnhancedMapQuality(
    range: number,
    atr: number,
    age: number,
    swingHigh: SmartFibPivot,
    swingLow: SmartFibPivot,
    currentIndex: number,
    contextCandles: Candle[],
    currentCandle: Candle,
    setupType: "LONG_MAP" | "SHORT_MAP"
  ): number {
    // Base quality from range/ATR
    const rangeRatio = range / Math.max(atr, 0.000001);
    let quality = 0;

    if (rangeRatio >= 5) quality += 65;
    else if (rangeRatio >= 3) quality += 50;
    else if (rangeRatio >= 2) quality += 35;
    else if (rangeRatio >= 1) quality += 20;

    // Age penalty
    quality -= age * 1.5;

    // Bonus for recent confirmation strength (candles moved away cleanly from swing)
    const swingConfirmCandles = Math.min(3, currentIndex - Math.max(swingHigh.index, swingLow.index));
    let cleanMove = 0;
    if (swingConfirmCandles > 0) {
      for (let i = 0; i < swingConfirmCandles && currentIndex - i >= 0; i++) {
        const checkCandle = contextCandles[currentIndex - i];
        if (!checkCandle) continue;
        
        if (setupType === "LONG_MAP") {
          // After swing low, candles should move up
          if (checkCandle.close > swingLow.price) cleanMove += 3;
        } else {
          // After swing high, candles should move down
          if (checkCandle.close < swingHigh.price) cleanMove += 3;
        }
      }
      quality += cleanMove;
    }

    // Retest/respect bonus: if price bounced back toward swing after moving away
    const testCandles = Math.min(8, currentIndex - Math.max(swingHigh.index, swingLow.index));
    let retestScore = 0;
    if (testCandles > swingConfirmCandles) {
      for (let i = swingConfirmCandles; i < testCandles && currentIndex - i >= 0; i++) {
        const checkCandle = contextCandles[currentIndex - i];
        if (!checkCandle) continue;
        
        if (setupType === "LONG_MAP" && checkCandle.low <= swingLow.price + range * 0.05) {
          retestScore += 2;
        } else if (setupType === "SHORT_MAP" && checkCandle.high >= swingHigh.price - range * 0.05) {
          retestScore += 2;
        }
      }
      quality += Math.min(retestScore, 12);
    }

    // Dominance bonus: if this is clearly the strongest swing pair relative to others
    const dominanceBonus = age < 10 ? 8 : age < 30 ? 5 : 0;
    quality += dominanceBonus;

    // Distance from current price penalty: favor zones not too far from price for scalp
    const distancePercent = Math.abs(currentCandle.close - (setupType === "LONG_MAP" ? swingLow.price : swingHigh.price)) / range;
    if (distancePercent < 0.3) quality += 6;
    else if (distancePercent > 0.8) quality -= 4;

    return Math.max(0, quality);
  }

  private generateFibLevels(context: SmartFibContext): void {
    if (
      !context.activeMap ||
      !context.activeRange ||
      context.swingHigh === undefined ||
      context.swingLow === undefined
    ) {
      context.activeFibLevels = [];
      return;
    }

    const levels: SmartFibLevel[] = [];

    for (const levelConfig of this.settings.fibLevels) {
      if (!levelConfig.show) continue;

      const price =
        context.setupType === "LONG_MAP"
          ? context.swingHigh - context.activeRange * levelConfig.value
          : context.swingLow + context.activeRange * levelConfig.value;

      let zoneType: "SNIPER" | "SILVER" | "SUPPORT" | "NONE" = "SUPPORT";
      if (levelConfig.value === 0.882 || levelConfig.value === 0.941) {
        zoneType = "SNIPER";
      } else if (levelConfig.value === 0.618 || levelConfig.value === 0.65) {
        zoneType = "SILVER";
      }

      levels.push({
        level: levelConfig.value,
        price,
        name: levelConfig.name,
        enabled: true,
        priority: this.getLevelPriority(levelConfig.value),
        zoneType,
      });
    }

    context.activeFibLevels = levels;
  }

  private getLevelPriority(level: number): number {
    if (level === 0.882 || level === 0.941) return 10;
    if (level === 0.65 || level === 0.618 || level === 0.786) return 8;
    if (level === 0.5 || level === 1.0) return 6;
    return 4;
  }

  private checkLevelCompression(context: SmartFibContext): void {
    if (!context.activeFibLevels.length || !context.atr || !context.activeRange) {
      context.rangeQuality = "GOOD";
      return;
    }

    if (context.activeRange < context.atr * this.settings.minSwingRangeAtr) {
      context.rangeQuality = "TOO_SMALL";
      return;
    }

    const importantLevels = context.activeFibLevels
      .filter((level) => level.priority >= 8)
      .sort((a, b) => a.price - b.price);

    if (importantLevels.length < 2) {
      context.rangeQuality = "GOOD";
      return;
    }

    let minSpacing = Infinity;

    for (let i = 1; i < importantLevels.length; i++) {
      const spacing = Math.abs(importantLevels[i].price - importantLevels[i - 1].price);
      minSpacing = Math.min(minSpacing, spacing);
    }

    const pixelSpacingEstimate = minSpacing / Math.max(context.atr * 0.01, 0.000001);

    context.rangeQuality =
      pixelSpacingEstimate < this.settings.minVisualLevelSpacingPx ? "COMPRESSED" : "GOOD";
  }

  private checkInvalidation(context: SmartFibContext, candle: Candle): void {
    if (!context.activeMap || context.mapState === "INVALIDATED") return;

    const buffer = this.calculateInvalidationBuffer(context);
    let invalidated = false;
    let reason = "";

    if (context.setupType === "LONG_MAP") {
      const invalidationLevel = (context.swingLow ?? 0) - buffer;

      if (candle.close < invalidationLevel || candle.low < invalidationLevel) {
        invalidated = true;
        reason = `Price broke below swing low (${(context.swingLow ?? 0).toFixed(2)})`;
      }
    } else if (context.setupType === "SHORT_MAP") {
      const invalidationLevel = (context.swingHigh ?? 0) + buffer;

      if (candle.close > invalidationLevel || candle.high > invalidationLevel) {
        invalidated = true;
        reason = `Price broke above swing high (${(context.swingHigh ?? 0).toFixed(2)})`;
      }
    }

    if (!invalidated) return;

    context.activeMap.invalidated = true;
    context.mapState = "INVALIDATED";
    context.invalidationReason = reason;
    context.activeFibLevels = [];
    context.tradeLevels = undefined;

    this.tryReanchor(context);

    const signal: SmartFibSignal = {
      id: `fib-invalidation-${context.symbol}-${context.timeframe}-${candle.time}`,
      timestamp: Number(candle.time),
      symbol: context.symbol,
      timeframe: context.timeframe,
      type: "FIB_INVALIDATED",
      side: "NONE",
      setupType: context.setupType,
      executable: false,
      status: "INVALIDATED",
      reason,
    };

    context.lastSignals.push(signal);
    this.deduplicateSignals(context);
  }

  private calculateInvalidationBuffer(context: SmartFibContext): number {
    const atr = context.atr || 1;

    switch (this.settings.invalidationMode) {
      case "ATR_BUFFER":
        return atr * this.settings.invalidationAtrBuffer;
      case "PERCENT_BUFFER":
        return (context.activeRange || atr) * this.settings.invalidationPercentBuffer;
      case "TICK_BUFFER":
        return this.settings.invalidationTickBuffer;
      default:
        return atr * 0.1;
    }
  }

  private tryReanchor(context: SmartFibContext): void {
    if (!this.settings.enableFallback) return;

    const validCandidates = context.mapCandidates.filter((candidate) => !candidate.invalidated);

    if (validCandidates.length === 0) {
      context.mapState = "WAITING_FOR_SWING_PAIR";
      context.activeMap = undefined;
      return;
    }

    validCandidates.sort((a, b) => {
      const qualityDiff = b.quality - a.quality;
      if (Math.abs(qualityDiff) > 10) return qualityDiff;
      return a.age - b.age;
    });

    const fallbackCandidate = validCandidates[0];
    this.applyMapCandidate(context, fallbackCandidate);

    if (context.mapState === "LONG_MAP" || context.mapState === "SHORT_MAP") {
      context.mapState = "FALLBACK_ACTIVE";
    }

    context.fallbackReason = `Reanchored to ${fallbackCandidate.setupType} (${fallbackCandidate.swingHigh.price.toFixed(
      2
    )}-${fallbackCandidate.swingLow.price.toFixed(2)})`;
  }

  private checkLevelTouches(context: SmartFibContext, candle: Candle): SmartFibSignal[] {
    const signals: SmartFibSignal[] = [];

    if (!context.activeFibLevels.length) return signals;
    if (context.mapState === "DISABLED" || context.mapState === "INVALIDATED") return signals;
    if (context.rangeQuality === "TOO_SMALL") {
  return signals;
}

    for (const fibLevel of context.activeFibLevels) {
      if (!fibLevel.enabled) continue;

      const tolerance = this.calculateTouchTolerance(context);

      const touched =
        Math.abs(candle.low - fibLevel.price) <= tolerance ||
        Math.abs(candle.high - fibLevel.price) <= tolerance ||
        (candle.low <= fibLevel.price && candle.high >= fibLevel.price);

      if (!touched) continue;

      const levelKey = `${context.symbol}-${context.timeframe}-${context.setupType}-${fibLevel.level}`;
      const lastTime = this.lastSignalTime.get(levelKey) || 0;
      const timeSinceLast = Number(candle.time) - lastTime;
      const cooldownMs = this.settings.cooldownBars * 60000;

      if (timeSinceLast < cooldownMs) continue;

      const signal: SmartFibSignal = {
        id: `fib-touch-${context.symbol}-${context.timeframe}-${fibLevel.level}-${candle.time}`,
        timestamp: Number(candle.time),
        symbol: context.symbol,
        timeframe: context.timeframe,
        type: "SNIPER_TOUCH",
        side: context.setupType === "LONG_MAP" ? "LONG" : "SHORT",
        setupType: context.setupType,
        level: fibLevel.level,
        levelName: fibLevel.name,
        price: fibLevel.price,
        executable: false,
        status: "WATCH",
        reason: `Touched ${fibLevel.name} at ${fibLevel.price.toFixed(2)}`,
      };

      signals.push(signal);
      this.lastSignalTime.set(levelKey, Number(candle.time));
    }

    context.lastSignals.push(...signals);
    this.deduplicateSignals(context);

    return signals;
  }

  private calculateTouchTolerance(context: SmartFibContext): number {
    return (context.atr || 1) * 0.1;
  }

  private updateBoxes(context: SmartFibContext, candle: Candle): void {
    if (!this.settings.enableBoxes || !context.activeMap || !context.activeRange) {
      context.activeBoxes = [];
      return;
    }

    const boxes: SmartFibBox[] = [];

    if (context.setupType === "LONG_MAP") {
      boxes.push({
        type: "DEMAND",
        high: (context.swingLow ?? candle.low) + context.activeRange * 0.1,
        low: Math.max(0, (context.swingLow ?? candle.low) - context.activeRange * 0.05),
        strength: 75,
        touches: 0,
        retests: 0,
        quality: "STRONG",
      });
    } else if (context.setupType === "SHORT_MAP") {
      boxes.push({
        type: "SUPPLY",
        high: (context.swingHigh ?? candle.high) + context.activeRange * 0.05,
        low: (context.swingHigh ?? candle.high) - context.activeRange * 0.1,
        strength: 75,
        touches: 0,
        retests: 0,
        quality: "STRONG",
      });
    }

    context.activeBoxes = boxes;
  }

  private updateDashboardSummary(context: SmartFibContext): void {
    let summary = `Smart Fib ${context.mapState}`;

    if (context.timeframe) {
      summary += ` | ${context.timeframe}`;
    }

    if (
      context.mapState === "LONG_MAP" ||
      context.mapState === "SHORT_MAP" ||
      context.mapState === "FALLBACK_ACTIVE"
    ) {
      summary += ` | ${context.setupType}`;

      if (context.activeRange) {
        summary += ` | Range: ${context.activeRange.toFixed(2)}`;
      }

      if (context.atr) {
        summary += ` | ATR: ${context.atr.toFixed(4)}`;
      }
    }

    if (context.invalidationReason) {
      summary += ` | ${context.invalidationReason}`;
    }

    if (context.fallbackReason) {
      summary += ` | ${context.fallbackReason}`;
    }

    context.dashboardSummary = summary;
  }

  private deduplicateSignals(context: SmartFibContext): void {
    const recentSignals = context.lastSignals
      .filter((signal) => Number(signal.timestamp) > Date.now() - 3600000)
      .sort((a, b) => Number(b.timestamp) - Number(a.timestamp));

    const seen = new Set<string>();

    context.lastSignals = recentSignals
      .filter((signal) => {
        const key = `${signal.type}-${signal.level}-${signal.status}-${signal.side}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 10);
  }

  findStrongestEntryZone(
    context: SmartFibContext,
    currentPrice: number
  ): {
    level: number;
    name: string;
    price: number;
    quality: string;
    zoneType: "SNIPER" | "SILVER" | "SUPPORT" | "NONE";
    distance: number;
    distanceAtr: number;
    priority: number;
    side: "LONG" | "SHORT";
    invalidationPrice: number | null;
  } | null {
    if (!context.activeFibLevels.length || context.mapState === "DISABLED") return null;

    const atr = context.atr || (context.activeRange || 1) * 0.05;
    const tolerance = atr * 0.15;

    // Check sniper levels first (0.882, 0.941)
    const sniperLevels = context.activeFibLevels.filter(
      (level) => level.level === 0.882 || level.level === 0.941
    );

    for (const level of sniperLevels.sort((a, b) => b.priority - a.priority)) {
      const distance = Math.abs(currentPrice - level.price);

      if (distance <= tolerance * 2) {
        const invalidationPrice =
          context.setupType === "LONG_MAP"
            ? (context.swingLow ?? 0) - atr * this.settings.invalidationAtrBuffer
            : (context.swingHigh ?? 0) + atr * this.settings.invalidationAtrBuffer;

        return {
          level: level.level,
          name: level.name || `SNIPER ${level.level}`,
          price: level.price,
          quality: distance < tolerance ? "ACTIVE" : "NEARBY",
          zoneType: "SNIPER",
          distance,
          distanceAtr: distance / atr,
          priority: level.priority,
          side: context.setupType === "LONG_MAP" ? "LONG" : "SHORT",
          invalidationPrice,
        };
      }
    }

    // Check reaction/silver levels (0.618, 0.65)
    const reactionLevels = context.activeFibLevels.filter(
      (level) => level.level === 0.618 || level.level === 0.65
    );

    for (const level of reactionLevels.sort((a, b) => b.priority - a.priority)) {
      const distance = Math.abs(currentPrice - level.price);

      if (distance <= tolerance * 2) {
        const invalidationPrice =
          context.setupType === "LONG_MAP"
            ? (context.swingLow ?? 0) - atr * this.settings.invalidationAtrBuffer
            : (context.swingHigh ?? 0) + atr * this.settings.invalidationAtrBuffer;

        return {
          level: level.level,
          name: level.name || `SILVER ${level.level}`,
          price: level.price,
          quality: distance < tolerance ? "ACTIVE" : "NEARBY",
          zoneType: "SILVER",
          distance,
          distanceAtr: distance / atr,
          priority: level.priority,
          side: context.setupType === "LONG_MAP" ? "LONG" : "SHORT",
          invalidationPrice,
        };
      }
    }

    return null;
  }

  generateExecutableTradeLevels(
    context: SmartFibContext,
    currentPrice: number
  ): SmartFibTradeLevels | null {
    if (!context.activeMap || !context.activeRange || context.mapState === "DISABLED") {
      return null;
    }

    const range = context.activeRange;
    const atr = context.atr || range * 0.05;

    let entry: number;
    let sl: number;
    let tp1: number;
    let tp2: number;
    let tp3: number;
    let zone = "UNKNOWN";

    const sniperZone = context.activeFibLevels.find(
      (level) => level.level === 0.882 || level.level === 0.941
    );

    const goldZone = context.activeFibLevels.find(
      (level) => level.level === 0.618 || level.level === 0.65
    );

    if (context.setupType === "LONG_MAP" || context.mapState === "FALLBACK_ACTIVE") {
      if (sniperZone) {
        entry = sniperZone.price;
        zone = "SNIPER";
      } else if (goldZone) {
        entry = goldZone.price;
        zone = goldZone.level === 0.618 ? "SILVER" : "GOLD";
      } else {
        entry = (context.swingLow ?? currentPrice) + range * 0.618;
        zone = "FALLBACK_618";
      }

      const buffer = this.calculateInvalidationBuffer(context);
      const invalidationPrice = (context.swingLow ?? currentPrice) - buffer;

      sl = Math.max(invalidationPrice, currentPrice - atr * 2);

      tp1 = entry + range * 0.382;
      tp2 = entry + range * 0.618;
      tp3 = entry + range * 1.0;

      return {
        entry,
        sl,
        tp1,
        tp2,
        tp3,
        zone,
      };
    }

    if (context.setupType === "SHORT_MAP") {
      if (sniperZone) {
        entry = sniperZone.price;
        zone = "SNIPER";
      } else if (goldZone) {
        entry = goldZone.price;
        zone = goldZone.level === 0.618 ? "SILVER" : "GOLD";
      } else {
        entry = (context.swingHigh ?? currentPrice) - range * 0.618;
        zone = "FALLBACK_618";
      }

      const buffer = this.calculateInvalidationBuffer(context);
      const invalidationPrice = (context.swingHigh ?? currentPrice) + buffer;

      sl = Math.min(invalidationPrice, currentPrice + atr * 2);

      tp1 = entry - range * 0.382;
      tp2 = entry - range * 0.618;
      tp3 = entry - range * 1.0;

      return {
        entry,
        sl,
        tp1,
        tp2,
        tp3,
        zone,
      };
    }

    return null;
  }

  determineExecutableStatus(
    context: SmartFibContext,
    currentPrice: number
  ): { executable: boolean; reason: string; zone?: string } {
    if (!context.enabled) {
      return { executable: false, reason: "Smart Fib disabled" };
    }

    if (
      context.mapState === "DISABLED" ||
      context.mapState === "WAITING_FOR_CANDLES" ||
      context.mapState === "WAITING_FOR_SWING_PAIR"
    ) {
      return { executable: false, reason: `Smart Fib ${context.mapState}` };
    }

    if (context.mapState === "INVALIDATED") {
      return { executable: false, reason: "Smart Fib swing invalidated" };
    }

    if (context.rangeQuality === "COMPRESSED") {
      return { executable: false, reason: "Smart Fib levels too compressed for reliable entry" };
    }

    if (context.rangeQuality === "TOO_SMALL") {
      return { executable: false, reason: "Smart Fib range too small" };
    }

    const zone = this.findStrongestEntryZone(context, currentPrice);

    if (!zone) {
      return { executable: false, reason: "Price not near Smart Fib entry zone", zone: "NONE" };
    }

    return {
      executable: true,
      reason: `Smart Fib ${context.setupType} with ${zone.name}`,
      zone: zone.name,
    };
  }

  getCurrentExecutableSignal(
    context: SmartFibContext,
    currentPrice: number,
    timestamp: number
  ): SmartFibSignal | null {
    const execution = this.determineExecutableStatus(context, currentPrice);

    if (!execution.executable) {
      return {
        id: `fib-status-${context.symbol}-${context.timeframe}-${timestamp}`,
        timestamp,
        symbol: context.symbol,
        timeframe: context.timeframe,
        type: "NEW_FIB_MAP",
        side: "NONE",
        setupType: context.setupType,
        executable: false,
        status: "WATCH",
        reason: execution.reason,
      };
    }

    const tradeLevels = this.generateExecutableTradeLevels(context, currentPrice);

    if (!tradeLevels) {
      return {
        id: `fib-wait-${context.symbol}-${context.timeframe}-${timestamp}`,
        timestamp,
        symbol: context.symbol,
        timeframe: context.timeframe,
        type: "NEW_FIB_MAP",
        side: "NONE",
        setupType: context.setupType,
        executable: false,
        status: "WATCH",
        reason: "Cannot generate trade levels",
      };
    }

    const side = context.setupType === "LONG_MAP" ? "LONG" : "SHORT";
    const zone = this.findStrongestEntryZone(context, currentPrice);

    return {
      id: `fib-executable-${context.symbol}-${context.timeframe}-${timestamp}`,
      timestamp,
      symbol: context.symbol,
      timeframe: context.timeframe,
      type: side === "LONG" ? "LONG_SIGNAL" : "SHORT_SIGNAL",
      side,
      setupType: context.setupType,
      level: zone?.level,
      levelName: zone?.name || tradeLevels.zone,
      price: tradeLevels.entry,
      entry: tradeLevels.entry,
      sl: tradeLevels.sl,
      tp1: tradeLevels.tp1,
      tp2: tradeLevels.tp2,
      tp3: tradeLevels.tp3,
      score: 85,
      executable: true,
      status: "EXECUTABLE",
      reason: `Smart Fib ${context.setupType} executable at ${
        zone?.name || tradeLevels.zone
      } zone`,
    };
  }

  updateTradeLevels(context: SmartFibContext, currentPrice: number): void {
    const levels = this.generateExecutableTradeLevels(context, currentPrice);

    if (levels) {
      context.tradeLevels = levels;
    } else {
      context.tradeLevels = undefined;
    }
  }
}