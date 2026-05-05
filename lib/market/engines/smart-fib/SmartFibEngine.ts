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
    this.settings = { ...this.settings, ...newSettings };

    for (const context of this.contexts.values()) {
      this.resetContextMap(context);

      if (context.enabled) {
        context.mapState = "WAITING_FOR_CANDLES";
      }
    }
  }

  private resetContextMap(context: SmartFibContext): void {
    context.setupType = "WAITING";
    context.swingHigh = undefined;
    context.swingLow = undefined;
    context.swingHighIndex = undefined;
    context.swingLowIndex = undefined;
    context.swingHighPivot = undefined;
    context.swingLowPivot = undefined;
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

    candidates.sort((a, b) => {
      const qualityDiff = b.quality - a.quality;
      if (Math.abs(qualityDiff) > 5) return qualityDiff;
      return a.age - b.age;
    });

    const bestCandidate = candidates[0];

    const needsChange =
      !context.activeMap ||
      context.activeMap.swingHigh.index !== bestCandidate.swingHigh.index ||
      context.activeMap.swingLow.index !== bestCandidate.swingLow.index ||
      context.activeMap.setupType !== bestCandidate.setupType;

    if (needsChange) {
      this.applyMapCandidate(context, bestCandidate);
    }

    this.checkInvalidation(context, candle);
  }

  private buildMapCandidates(context: SmartFibContext, candle: Candle): SmartFibMapCandidate[] {
    const candidates: SmartFibMapCandidate[] = [];
    const recentPivots = context.confirmedPivots.slice(-24);
    const currentIndex = this.getCandlesForContext(context).length - 1;

    for (let i = 0; i < recentPivots.length - 1; i++) {
      for (let j = i + 1; j < recentPivots.length; j++) {
        const pivot1 = recentPivots[i];
        const pivot2 = recentPivots[j];

        if (pivot1.type === pivot2.type) continue;

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
          continue;
        }

        const range = swingHigh.price - swingLow.price;
        if (range <= 0) continue;

        const atr = context.atr || range * 0.02;
        const referencePrice = Math.max(candle.close || swingHigh.price, 0.000001);

        const rangeValid =
          range >= atr * this.settings.minSwingRangeAtr &&
          range >= referencePrice * this.settings.minSwingRangePercent;

        if (!rangeValid) continue;

        const age = Math.max(0, currentIndex - Math.max(swingHigh.index, swingLow.index));
        if (age > this.settings.maxMapAgeBars) continue;

        const candidate: SmartFibMapCandidate = {
          swingHigh,
          swingLow,
          range,
          setupType,
          quality: this.calculateMapQuality(range, atr, age),
          age,
          invalidated: false,
        };

        if (!this.isCandidateInvalidated(candidate, candle)) {
          candidates.push(candidate);
        }
      }
    }

    return candidates;
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
    context.activeMap = candidate;
    context.setupType = candidate.setupType;
    context.swingHigh = candidate.swingHigh.price;
    context.swingLow = candidate.swingLow.price;
    context.swingHighIndex = candidate.swingHigh.index;
    context.swingLowIndex = candidate.swingLow.index;
    context.swingHighPivot = candidate.swingHigh;
    context.swingLowPivot = candidate.swingLow;
    context.activeRange = candidate.range;
    context.invalidationReason = undefined;
    context.fallbackReason = undefined;

    this.generateFibLevels(context);
    this.checkLevelCompression(context);

    if (context.rangeQuality === "COMPRESSED") {
      context.mapState = "COMPRESSED_LEVELS";
    } else if (context.rangeQuality === "TOO_SMALL") {
      context.mapState = "RANGE_TOO_SMALL";
    } else {
      context.mapState = candidate.setupType;
    }
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

      levels.push({
        level: levelConfig.value,
        price,
        name: levelConfig.name,
        enabled: true,
        priority: this.getLevelPriority(levelConfig.value),
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
  ): { level: number; name: string; price: number; quality: string } | null {
    if (!context.activeFibLevels.length || context.mapState === "DISABLED") return null;

    const sniperLevels = context.activeFibLevels.filter(
      (level) => level.level === 0.882 || level.level === 0.941
    );

    const reactionLevels = context.activeFibLevels.filter(
      (level) => level.level === 0.618 || level.level === 0.65
    );

    const tolerance = (context.atr || currentPrice * 0.01) * 0.15;

    for (const level of sniperLevels.sort((a, b) => b.priority - a.priority)) {
      const distance = Math.abs(currentPrice - level.price);

      if (distance <= tolerance * 2) {
        return {
          level: level.level,
          name: level.name || "SNIPER",
          price: level.price,
          quality: distance < tolerance ? "ACTIVE" : "NEARBY",
        };
      }
    }

    for (const level of reactionLevels.sort((a, b) => b.priority - a.priority)) {
      const distance = Math.abs(currentPrice - level.price);

      if (distance <= tolerance * 2) {
        return {
          level: level.level,
          name: level.level === 0.618 ? "SILVER" : "GOLD",
          price: level.price,
          quality: distance < tolerance ? "ACTIVE" : "NEARBY",
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