import type { Candle } from "@/types/trading";
import { SMART_FIB_DEFAULTS } from "./SmartFibDefaults";
import { calculateATR } from "./SmartFibMath";
import type { SmartFibContext, SmartFibSignal, SmartFibPivot, SmartFibMapCandidate, SmartFibLevel, SmartFibBox } from "./SmartFibTypes";

export class SmartFibEngine {
  private settings = { ...SMART_FIB_DEFAULTS };
  private contexts = new Map<string, SmartFibContext>(); // key: symbol_timeframe
  private candles = new Map<string, Candle[]>(); // key: symbol_timeframe
  private lastSignalTime: Map<string, number> = new Map(); // levelKey -> timestamp

  updateSettings(newSettings: Partial<typeof SMART_FIB_DEFAULTS>): void {
    this.settings = { ...this.settings, ...newSettings };
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
      settings: { ...this.settings }
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

    const key = this.getContextKey(symbol, timeframe);
    if (!this.candles.has(key)) {
      this.candles.set(key, []);
    }
    const contextCandles = this.candles.get(key)!;
    contextCandles.push(...newCandles);

    const signals: SmartFibSignal[] = [];

    // Process each new candle
    for (const candle of newCandles) {
      const candleSignals = this.processCandle(context, candle);
      signals.push(...candleSignals);
    }

    return signals;
  }

  private processCandle(context: SmartFibContext, candle: Candle): SmartFibSignal[] {
    const signals: SmartFibSignal[] = [];

    if (context.mapState === "DISABLED") return signals;

    // Update ATR
    this.updateATR(context, candle);

    // Update pivot detection
    this.updatePivotDetection(context, candle);

    // Update map selection
    this.updateMapSelection(context, candle);

    // Check for level touches and signals
    const touchSignals = this.checkLevelTouches(context, candle);
    signals.push(...touchSignals);

    // Update boxes
    this.updateBoxes(context, candle);

    // Update trade levels and executable status
    this.updateTradeLevels(context, candle.close);
    
    // Generate current executable signal if setup is valid
    const executableSignal = this.getCurrentExecutableSignal(context, candle.close, candle.time as number);
    if (executableSignal) {
      context.currentSignal = executableSignal;
      // Only add executable signals that haven't been added recently
      if (executableSignal.executable && !signals.some(s => s.executable)) {
        signals.push(executableSignal);
      }
    }

    // Update dashboard
    this.updateDashboardSummary(context);

    return signals;
  }

  private updateATR(context: SmartFibContext, candle: Candle): void {
    // Simple ATR calculation
    if (!context.atr) {
      context.atr = Math.abs(candle.high - candle.low) * 0.02; // Rough estimate
    } else {
      context.atr = (context.atr * 13 + Math.abs(candle.high - candle.low)) / 14;
    }
  }

  private updatePivotDetection(context: SmartFibContext, candle: Candle): void {
    const key = this.getContextKey(context.symbol, context.timeframe);
    const contextCandles = this.candles.get(key) || [];
    
    if (contextCandles.length < this.settings.pivotLeft + this.settings.pivotRight + 1) {
      context.mapState = "WAITING_FOR_CANDLES";
      return;
    }

    const currentIndex = contextCandles.length - 1;
    const lookback = Math.min(contextCandles.length, this.settings.pivotLeft + this.settings.pivotRight + 1);

    // Check for swing high
    let isSwingHigh = true;
    for (let i = 1; i <= this.settings.pivotLeft; i++) {
      if (currentIndex - i >= 0 && contextCandles[currentIndex - i].high >= candle.high) {
        isSwingHigh = false;
        break;
      }
    }
    for (let i = 1; i <= this.settings.pivotRight; i++) {
      if (currentIndex + i < contextCandles.length && contextCandles[currentIndex + i].high >= candle.high) {
        isSwingHigh = false;
        break;
      }
    }

    // Check for swing low
    let isSwingLow = true;
    for (let i = 1; i <= this.settings.pivotLeft; i++) {
      if (currentIndex - i >= 0 && contextCandles[currentIndex - i].low <= candle.low) {
        isSwingLow = false;
        break;
      }
    }
    for (let i = 1; i <= this.settings.pivotRight; i++) {
      if (currentIndex + i < contextCandles.length && contextCandles[currentIndex + i].low <= candle.low) {
        isSwingLow = false;
        break;
      }
    }

    // Add confirmed pivots
    if (isSwingHigh) {
      const pivot: SmartFibPivot = {
        type: "HIGH",
        index: currentIndex,
        time: candle.time,
        price: candle.high,
        confirmedAtIndex: currentIndex,
      };
      context.confirmedPivots.push(pivot);
    }

    if (isSwingLow) {
      const pivot: SmartFibPivot = {
        type: "LOW",
        index: currentIndex,
        time: candle.time,
        price: candle.low,
        confirmedAtIndex: currentIndex,
      };
      context.confirmedPivots.push(pivot);
    }

    // Keep only recent pivots
    const maxPivots = 20;
    if (context.confirmedPivots.length > maxPivots) {
      context.confirmedPivots = context.confirmedPivots.slice(-maxPivots);
    }
  }

  private updateMapSelection(context: SmartFibContext, candle: Candle): void {
    if (context.confirmedPivots.length < 2) {
      context.mapState = "WAITING_FOR_SWING_PAIR";
      return;
    }

    // Build candidate maps from recent alternating pivots
    const candidates: SmartFibMapCandidate[] = [];
    const recentPivots = context.confirmedPivots.slice(-10); // Last 10 pivots

    for (let i = 0; i < recentPivots.length - 1; i++) {
      for (let j = i + 1; j < recentPivots.length; j++) {
        const pivot1 = recentPivots[i];
        const pivot2 = recentPivots[j];

        if (pivot1.type === pivot2.type) continue; // Must be alternating

        let swingHigh: SmartFibPivot;
        let swingLow: SmartFibPivot;
        let setupType: "LONG_MAP" | "SHORT_MAP";

        if (pivot1.type === "HIGH" && pivot2.type === "LOW") {
          // HIGH then LOW = SHORT_MAP
          swingHigh = pivot1;
          swingLow = pivot2;
          setupType = "SHORT_MAP";
        } else if (pivot1.type === "LOW" && pivot2.type === "HIGH") {
          // LOW then HIGH = LONG_MAP
          swingLow = pivot1;
          swingHigh = pivot2;
          setupType = "LONG_MAP";
        } else {
          continue;
        }

        const range = swingHigh.price - swingLow.price;
        if (range <= 0) continue;

        // Validate range
        const atr = context.atr || (range * 0.02);
        const rangeValid = range >= atr * this.settings.minSwingRangeAtr &&
                          range >= swingHigh.price * this.settings.minSwingRangePercent;

        if (!rangeValid) continue;

        // Check age
        const age = context.confirmedPivots.length - j;
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

        candidates.push(candidate);
      }
    }

    context.mapCandidates = candidates;

    // Select best candidate
    if (candidates.length === 0) {
      context.mapState = "WAITING_FOR_SWING_PAIR";
      context.activeMap = undefined;
      return;
    }

    // Sort by quality (higher is better)
    candidates.sort((a, b) => b.quality - a.quality);
    const bestCandidate = candidates[0];

    // Check if we need to change active map
    const needsChange = !context.activeMap ||
                       context.activeMap.swingHigh.index !== bestCandidate.swingHigh.index ||
                       context.activeMap.swingLow.index !== bestCandidate.swingLow.index;

    if (needsChange) {
      context.activeMap = bestCandidate;
      context.setupType = bestCandidate.setupType;
      context.swingHigh = bestCandidate.swingHigh.price;
      context.swingLow = bestCandidate.swingLow.price;
      context.swingHighIndex = bestCandidate.swingHigh.index;
      context.swingLowIndex = bestCandidate.swingLow.index;
      context.swingHighPivot = bestCandidate.swingHigh;
      context.swingLowPivot = bestCandidate.swingLow;
      context.activeRange = bestCandidate.range;

      // Generate fib levels
      this.generateFibLevels(context);

      // Check for compression
      this.checkLevelCompression(context);

      if (context.rangeQuality === "COMPRESSED") {
        context.mapState = "COMPRESSED_LEVELS";
      } else {
        context.mapState = bestCandidate.setupType;
      }
    }

    // Check invalidation
    this.checkInvalidation(context, candle);
  }

  private calculateMapQuality(range: number, atr: number, age: number): number {
    let quality = 0;

    // Range quality
    const rangeRatio = range / atr;
    if (rangeRatio >= 2) quality += 50;
    else if (rangeRatio >= 1) quality += 30;
    else if (rangeRatio >= 0.5) quality += 10;

    // Age penalty
    quality -= age * 2;

    return Math.max(0, quality);
  }

  private generateFibLevels(context: SmartFibContext): void {
    if (!context.activeMap || !context.activeRange) {
      context.activeFibLevels = [];
      return;
    }

    const levels: SmartFibLevel[] = [];

    for (const levelConfig of this.settings.fibLevels) {
      if (!levelConfig.show) continue;

      let price: number;
      if (context.setupType === "LONG_MAP") {
        // LONG_MAP: levels from swingHigh downward
        price = context.swingHigh! - context.activeRange * levelConfig.value;
      } else {
        // SHORT_MAP: levels from swingLow upward
        price = context.swingLow! + context.activeRange * levelConfig.value;
      }

      const level: SmartFibLevel = {
        level: levelConfig.value,
        price,
        name: levelConfig.name,
        enabled: true,
        priority: this.getLevelPriority(levelConfig.value),
      };

      levels.push(level);
    }

    context.activeFibLevels = levels;
  }

  private getLevelPriority(level: number): number {
    // Higher priority for more important levels
    if (level === 0.882 || level === 0.941) return 10;
    if (level === 0.618 || level === 0.786) return 8;
    if (level === 0.5 || level === 1.0) return 6;
    return 4;
  }

  private checkLevelCompression(context: SmartFibContext): void {
    if (!context.activeFibLevels.length || !context.atr) {
      context.rangeQuality = "GOOD";
      return;
    }

    // Check spacing between important levels
    const importantLevels = context.activeFibLevels
      .filter(l => l.priority >= 8)
      .sort((a, b) => a.price - b.price);

    if (importantLevels.length < 2) {
      context.rangeQuality = "GOOD";
      return;
    }

    let minSpacing = Infinity;
    for (let i = 1; i < importantLevels.length; i++) {
      const spacing = Math.abs(importantLevels[i].price - importantLevels[i-1].price);
      minSpacing = Math.min(minSpacing, spacing);
    }

    // Convert to pixel spacing estimate (rough)
    const pixelSpacing = minSpacing / (context.atr * 0.01); // Rough estimate

    if (pixelSpacing < this.settings.minVisualLevelSpacingPx) {
      context.rangeQuality = "COMPRESSED";
    } else if (context.activeRange! < context.atr! * this.settings.minSwingRangeAtr) {
      context.rangeQuality = "TOO_SMALL";
    } else {
      context.rangeQuality = "GOOD";
    }
  }

  private checkInvalidation(context: SmartFibContext, candle: Candle): void {
    if (!context.activeMap || context.mapState === "INVALIDATED") return;

    const buffer = this.calculateInvalidationBuffer(context);
    let invalidated = false;
    let reason = "";

    if (context.setupType === "LONG_MAP") {
      // LONG_MAP invalidation: price breaks below swingLow
      const invalidationLevel = context.swingLow! - buffer;
      if (candle.close < invalidationLevel || candle.low < invalidationLevel) {
        invalidated = true;
        reason = `Price broke below swing low (${context.swingLow!.toFixed(2)})`;
      }
    } else {
      // SHORT_MAP invalidation: price breaks above swingHigh
      const invalidationLevel = context.swingHigh! + buffer;
      if (candle.close > invalidationLevel || candle.high > invalidationLevel) {
        invalidated = true;
        reason = `Price broke above swing high (${context.swingHigh!.toFixed(2)})`;
      }
    }

    if (invalidated) {
      context.activeMap.invalidated = true;
      context.mapState = "INVALIDATED";
      context.invalidationReason = reason;
      context.activeFibLevels = [];

      // Try to find replacement map
      this.tryReanchor(context);

      // Generate invalidation signal
      const signal: SmartFibSignal = {
        id: `fib-invalidation-${context.symbol}-${context.timeframe}-${candle.time}`,
        timestamp: candle.time,
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
  }

  private calculateInvalidationBuffer(context: SmartFibContext): number {
    const atr = context.atr || 1;

    switch (this.settings.invalidationMode) {
      case "ATR_BUFFER":
        return atr * this.settings.invalidationAtrBuffer;
      case "PERCENT_BUFFER":
        return context.activeRange! * this.settings.invalidationPercentBuffer;
      case "TICK_BUFFER":
        return this.settings.invalidationTickBuffer;
      default:
        return atr * 0.1;
    }
  }

  private tryReanchor(context: SmartFibContext): void {
    if (!this.settings.enableFallback) return;

    // Try to find a valid fallback map
    const validCandidates = context.mapCandidates.filter(c => !c.invalidated);

    if (validCandidates.length > 0) {
      // Sort by quality and recency
      validCandidates.sort((a, b) => {
        const qualityDiff = b.quality - a.quality;
        if (Math.abs(qualityDiff) > 10) return qualityDiff;
        return a.age - b.age; // Prefer more recent
      });

      const fallbackCandidate = validCandidates[0];

      // Apply the fallback
      context.activeMap = fallbackCandidate;
      context.setupType = fallbackCandidate.setupType;
      context.swingHigh = fallbackCandidate.swingHigh.price;
      context.swingLow = fallbackCandidate.swingLow.price;
      context.swingHighIndex = fallbackCandidate.swingHigh.index;
      context.swingLowIndex = fallbackCandidate.swingLow.index;
      context.swingHighPivot = fallbackCandidate.swingHigh;
      context.swingLowPivot = fallbackCandidate.swingLow;
      context.activeRange = fallbackCandidate.range;

      this.generateFibLevels(context);
      this.checkLevelCompression(context);

      if (context.rangeQuality === "COMPRESSED") {
        context.mapState = "COMPRESSED_LEVELS";
      } else {
        context.mapState = "FALLBACK_ACTIVE";
      }

      context.fallbackReason = `Reanchored to ${fallbackCandidate.setupType} (${fallbackCandidate.swingHigh.price.toFixed(2)}-${fallbackCandidate.swingLow.price.toFixed(2)})`;
    } else {
      context.mapState = "WAITING_FOR_SWING_PAIR";
      context.activeMap = undefined;
    }
  }

  private checkLevelTouches(context: SmartFibContext, candle: Candle): SmartFibSignal[] {
    const signals: SmartFibSignal[] = [];

    if (!context.activeFibLevels.length) return signals;

    for (const fibLevel of context.activeFibLevels) {
      if (!fibLevel.enabled) continue;

      // Check if candle touches the level
      const tolerance = this.calculateTouchTolerance(context, fibLevel.price);
      const touched = Math.abs(candle.low - fibLevel.price) <= tolerance ||
                     Math.abs(candle.high - fibLevel.price) <= tolerance ||
                     (candle.low <= fibLevel.price && candle.high >= fibLevel.price);

      if (touched) {
        // Check cooldown
        const levelKey = `${fibLevel.level}`;
        const lastTime = this.lastSignalTime.get(levelKey) || 0;
        const timeSinceLast = candle.time - lastTime;
        const cooldownMs = this.settings.cooldownBars * 60000; // Assume 1min candles

        if (timeSinceLast < cooldownMs) continue;

        // Generate signal
        const signal: SmartFibSignal = {
          id: `fib-touch-${context.symbol}-${context.timeframe}-${fibLevel.level}-${candle.time}`,
          timestamp: candle.time,
          symbol: context.symbol,
          timeframe: context.timeframe,
          type: "SNIPER_TOUCH",
          side: context.setupType === "LONG_MAP" ? "LONG" : "SHORT",
          setupType: context.setupType,
          level: fibLevel.level,
          levelName: fibLevel.name,
          price: fibLevel.price,
          executable: false, // Will be determined by higher logic
          status: "WATCH",
          reason: `Touched ${fibLevel.name} at ${fibLevel.price.toFixed(2)}`,
        };

        signals.push(signal);
        this.lastSignalTime.set(levelKey, candle.time);
      }
    }

    // Deduplicate and update context
    context.lastSignals.push(...signals);
    this.deduplicateSignals(context);

    return signals;
  }

  private calculateTouchTolerance(context: SmartFibContext, levelPrice: number): number {
    // Use ATR-based tolerance
    return (context.atr || 1) * 0.1;
  }

  private updateBoxes(context: SmartFibContext, candle: Candle): void {
    if (!this.settings.enableBoxes || !context.activeMap) {
      context.activeBoxes = [];
      return;
    }

    // Create boxes based on active map
    const boxes: SmartFibBox[] = [];

    if (context.setupType === "LONG_MAP") {
      // Demand box near swing low
      const demandBox: SmartFibBox = {
        type: "DEMAND",
        high: context.swingLow! + (context.activeRange! * 0.1),
        low: Math.max(0, context.swingLow! - (context.activeRange! * 0.05)),
        strength: 75,
        touches: 0,
        retests: 0,
        quality: "STRONG",
      };
      boxes.push(demandBox);
    } else {
      // Supply box near swing high
      const supplyBox: SmartFibBox = {
        type: "SUPPLY",
        high: context.swingHigh! + (context.activeRange! * 0.05),
        low: context.swingHigh! - (context.activeRange! * 0.1),
        strength: 75,
        touches: 0,
        retests: 0,
        quality: "STRONG",
      };
      boxes.push(supplyBox);
    }

    context.activeBoxes = boxes;
  }

  private updateDashboardSummary(context: SmartFibContext): void {
    let summary = `Smart Fib ${context.mapState}`;

    if (context.timeframe) {
      summary += ` | ${context.timeframe}`;
    }

    if (context.mapState === "LONG_MAP" || context.mapState === "SHORT_MAP") {
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
    // Keep only recent signals, remove duplicates
    const recentSignals = context.lastSignals
      .filter(s => s.timestamp > Date.now() - 3600000) // Last hour
      .sort((a, b) => b.timestamp - a.timestamp);

    // Remove duplicates by type and level
    const seen = new Set<string>();
    context.lastSignals = recentSignals.filter(signal => {
      const key = `${signal.type}-${signal.level}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 10); // Keep max 10
  }

  // ZONE DETECTION: Find strongest entry zone based on Smart Fib logic
  findStrongestEntryZone(context: SmartFibContext, currentPrice: number): { level: number; name: string; price: number; quality: string } | null {
    if (!context.activeFibLevels.length || context.mapState === "DISABLED") return null;

    // Priority zones: sniper first, then gold/silver reaction zones
    const sniperLevels = context.activeFibLevels.filter(l => l.level === 0.882 || l.level === 0.941);
    const reactionLevels = context.activeFibLevels.filter(l => l.level === 0.618 || l.level === 0.65);

    // Determine which zones are "active" (price nearby or valid for retest)
    const tolerance = (context.atr || (currentPrice * 0.01)) * 0.15;

    // Check sniper zones first
    for (const level of sniperLevels.sort((a, b) => b.priority - a.priority)) {
      const distance = Math.abs(currentPrice - level.price);
      if (distance <= tolerance * 2) {
        return {
          level: level.level,
          name: level.name,
          price: level.price,
          quality: distance < tolerance ? "ACTIVE" : "NEARBY"
        };
      }
    }

    // Check reaction zones
    for (const level of reactionLevels.sort((a, b) => b.priority - a.priority)) {
      const distance = Math.abs(currentPrice - level.price);
      if (distance <= tolerance * 2) {
        return {
          level: level.level,
          name: level.name,
          price: level.price,
          quality: distance < tolerance ? "ACTIVE" : "NEARBY"
        };
      }
    }

    return null;
  }

  // TRADE LEVEL GENERATION: Create entry/SL/TP from Smart Fib map
  generateExecutableTradeLevels(context: SmartFibContext, currentPrice: number): SmartFibTradeLevels | null {
    if (!context.activeMap || !context.activeRange || context.mapState === "DISABLED") return null;

    const range = context.activeRange;
    const atr = context.atr || (range * 0.05);

    let entry: number;
    let sl: number;
    let tp1: number;
    let tp2: number;
    let tp3: number;

    if (context.setupType === "LONG_MAP") {
      // LONG setup: entries from sniper/gold/silver zones
      const sniperZone = context.activeFibLevels.find(l => l.level === 0.882 || l.level === 0.941);
      const goldZone = context.activeFibLevels.find(l => l.level === 0.618 || l.level === 0.65);
      
      // Entry priority: sniper > gold > current price with buffer
      entry = sniperZone ? sniperZone.price : goldZone ? goldZone.price : context.swingLow! + (range * 0.618);
      
      // SL: below swing low with invalidation buffer
      const buffer = this.calculateInvalidationBuffer(context);
      sl = Math.max(context.swingLow! - buffer, currentPrice - atr * 2);
      
      // TPs: follow swing structure progression
      tp1 = entry + range * 0.382;  // First profit target
      tp2 = entry + range * 0.618;  // Secondary target
      tp3 = entry + range * 1.0;    // Extended target at swing high

    } else {
      // SHORT setup: entries from sniper/gold/silver zones (mirrored)
      const sniperZone = context.activeFibLevels.find(l => l.level === 0.882 || l.level === 0.941);
      const goldZone = context.activeFibLevels.find(l => l.level === 0.618 || l.level === 0.65);
      
      entry = sniperZone ? sniperZone.price : goldZone ? goldZone.price : context.swingHigh! - (range * 0.618);
      
      const buffer = this.calculateInvalidationBuffer(context);
      sl = Math.min(context.swingHigh! + buffer, currentPrice + atr * 2);
      
      tp1 = entry - range * 0.382;
      tp2 = entry - range * 0.618;
      tp3 = entry - range * 1.0;
    }

    return { entry, sl, tp1, tp2, tp3 };
  }

  // EXECUTION STATUS: Determine if a Smart Fib setup is executable
  determineExecutableStatus(context: SmartFibContext, currentPrice: number): { executable: boolean; reason: string; zone?: string } {
    if (!context.enabled) {
      return { executable: false, reason: "Smart Fib disabled" };
    }

    if (context.mapState === "DISABLED" || context.mapState === "WAITING_FOR_CANDLES" || context.mapState === "WAITING_FOR_SWING_PAIR") {
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

    // Check if price is near a valid entry zone
    const zone = this.findStrongestEntryZone(context, currentPrice);
    if (!zone) {
      return { executable: false, reason: "Price not near Smart Fib entry zone", zone: "NONE" };
    }

    // If we have a valid zone and valid setup, it's executable
    return { executable: true, reason: `Smart Fib ${context.setupType} with ${zone.name}`, zone: zone.name };
  }

  // CURRENT SIGNAL: Get the best executable signal for current state
  getCurrentExecutableSignal(context: SmartFibContext, currentPrice: number, timestamp: number): SmartFibSignal | null {
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
      type: "LONG_SIGNAL",
      side,
      setupType: context.setupType,
      level: zone?.level,
      levelName: zone?.name,
      price: tradeLevels.entry,
      entry: tradeLevels.entry,
      sl: tradeLevels.sl,
      tp1: tradeLevels.tp1,
      tp2: tradeLevels.tp2,
      tp3: tradeLevels.tp3,
      score: 85, // Base score for valid Smart Fib setup
      executable: true,
      status: "EXECUTABLE",
      reason: `Smart Fib ${context.setupType} executable at ${zone?.name} zone`,
    };
  }

  // Store trade levels in context for reference
  updateTradeLevels(context: SmartFibContext, currentPrice: number): void {
    const levels = this.generateExecutableTradeLevels(context, currentPrice);
    if (levels) {
      context.tradeLevels = levels;
    }
  }
}