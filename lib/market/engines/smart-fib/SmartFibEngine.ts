import type { Candle } from "@/types/trading";
import { SMART_FIB_DEFAULTS } from "./SmartFibDefaults";
import { calculateATR, calculateEMA, findPivotHighs, findPivotLows, calculateFibLevels, calculateLevelScore } from "./SmartFibMath";
import type { SmartFibContext, SmartFibSignal, SmartFibBox } from "./SmartFibTypes";

export class SmartFibEngine {
  private settings = { ...SMART_FIB_DEFAULTS };
  private context: SmartFibContext = {
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
  };

  private candles: Candle[] = [];
  private lastProcessedIndex = -1;

  updateSettings(newSettings: Partial<typeof SMART_FIB_DEFAULTS>): void {
    this.settings = { ...this.settings, ...newSettings };
  }

  getContext(): SmartFibContext {
    return { ...this.context };
  }

  processCandles(newCandles: Candle[]): SmartFibSignal[] {
    this.candles = [...this.candles, ...newCandles];
    const signals: SmartFibSignal[] = [];

    for (let i = this.lastProcessedIndex + 1; i < this.candles.length; i++) {
      const candleSignals = this.processCandle(i);
      signals.push(...candleSignals);
    }

    this.lastProcessedIndex = this.candles.length - 1;
    return signals;
  }

  private processCandle(index: number): SmartFibSignal[] {
    const signals: SmartFibSignal[] = [];
    const candle = this.candles[index];

    if (!candle) return signals;

    // Update swing detection
    this.updateSwingDetection(index);

    // Update fib map
    this.updateFibMap(index);

    // Update boxes
    this.updateBoxes(index);

    // Check for level touches and signals
    const touchSignals = this.checkLevelTouches(index);
    signals.push(...touchSignals);

    // Update context summary
    this.updateDashboardSummary();

    return signals;
  }

  private updateSwingDetection(index: number): void {
    if (this.candles.length < this.settings.swingPivotLeft + this.settings.swingPivotRight + 1) return;

    const highs = findPivotHighs(this.candles, this.settings.swingPivotLeft, this.settings.swingPivotRight);
    const lows = findPivotLows(this.candles, this.settings.swingPivotLeft, this.settings.swingPivotRight);

    // Find recent swing pair
    const recentHigh = highs[highs.length - 1];
    const recentLow = lows[lows.length - 1];

    if (recentHigh && recentLow && recentHigh.index > recentLow.index) {
      // Potential SHORT_MAP: high then low
      this.context.setupType = "SHORT_MAP";
      this.context.swingHigh = recentHigh.value;
      this.context.swingLow = recentLow.value;
      this.context.swingHighIndex = recentHigh.index;
      this.context.swingLowIndex = recentLow.index;
      this.context.activeRange = recentHigh.value - recentLow.value;
    } else if (recentLow && recentHigh && recentLow.index > recentHigh.index) {
      // Potential LONG_MAP: low then high
      this.context.setupType = "LONG_MAP";
      this.context.swingHigh = recentHigh.value;
      this.context.swingLow = recentLow.value;
      this.context.swingHighIndex = recentHigh.index;
      this.context.swingLowIndex = recentLow.index;
      this.context.activeRange = recentHigh.value - recentLow.value;
    }
  }

  private updateFibMap(index: number): void {
    if (!this.context.swingHigh || !this.context.swingLow || !this.context.activeRange) {
      this.context.mapState = "WAITING";
      return;
    }

    this.context.mapState = this.context.setupType as "LONG_MAP" | "SHORT_MAP";

    const levels = this.settings.fibLevels.filter(l => l.show).map(l => l.value);
    const fibPrices = calculateFibLevels(this.context.swingHigh, this.context.swingLow, levels);

    this.context.activeFibLevels = fibPrices.map(fp => fp.price);

    // Identify key levels
    this.context.sniperLevels = fibPrices
      .filter(fp => fp.level === 0.882 || fp.level === 0.941)
      .map(fp => fp.price);

    this.context.strongestLevels = this.context.sniperLevels; // Simplified
  }

  private updateBoxes(index: number): void {
    if (!this.settings.enableBoxes || !this.context.activeRange) return;

    // Create demand box near swing low
    if (this.context.swingLow) {
      const demandBox: SmartFibBox = {
        type: "DEMAND",
        high: this.context.swingLow + (this.context.activeRange * 0.1),
        low: this.context.swingLow - (this.context.activeRange * 0.05),
        strength: 75,
        touches: 0,
        retests: 0,
        quality: "STRONG",
      };
      this.context.activeBoxes = [demandBox];
      this.context.bestDemandBox = demandBox;
    }

    // Create supply box near swing high
    if (this.context.swingHigh) {
      const supplyBox: SmartFibBox = {
        type: "SUPPLY",
        high: this.context.swingHigh + (this.context.activeRange * 0.05),
        low: this.context.swingHigh - (this.context.activeRange * 0.1),
        strength: 75,
        touches: 0,
        retests: 0,
        quality: "STRONG",
      };
      this.context.activeBoxes.push(supplyBox);
      this.context.bestSupplyBox = supplyBox;
    }
  }

  private checkLevelTouches(index: number): SmartFibSignal[] {
    const signals: SmartFibSignal[] = [];
    const candle = this.candles[index];
    const atr = calculateATR(this.candles.slice(0, index + 1), this.settings.atrLength);

    for (const levelPrice of this.context.activeFibLevels) {
      const score = calculateLevelScore(
        candle,
        levelPrice,
        atr,
        this.settings.touchMode,
        this.settings.touchAtrTol,
        this.settings.minWickRatio,
        this.settings.minBodyRatio
      );

      if (score >= 75) {
        const level = this.settings.fibLevels.find(l => {
          const expectedPrice = this.context.setupType === "LONG_MAP"
            ? this.context.swingLow! + (this.context.activeRange! * l.value)
            : this.context.swingHigh! - (this.context.activeRange! * (1 - l.value));
          return Math.abs(expectedPrice - levelPrice) < 0.001;
        });

        const signal: SmartFibSignal = {
          id: `fib-${index}-${levelPrice}`,
          timestamp: candle.time,
          symbol: "BTCUSDT", // placeholder
          timeframe: "1h", // placeholder
          type: score >= 90 ? "SNIPER_TOUCH" : "EARLY_VALID",
          side: this.context.setupType === "LONG_MAP" ? "LONG" : "SHORT",
          setupType: this.context.setupType,
          level: level?.value,
          levelName: level?.name,
          price: levelPrice,
          score,
          qualityClass: score >= 90 ? "EXTREME SNIPER" : score >= 75 ? "STRONG ENTRY" : "WATCH",
          executable: score >= 90,
          status: score >= 90 ? "EXECUTABLE" : "WATCH",
          reason: `Level touched with score ${score}`,
        };

        signals.push(signal);
        this.context.lastSignals.push(signal);
        this.context.lastTouchedLevel = levelPrice;
        this.context.lastReactionQuality = signal.qualityClass;
        this.context.bestLevelQuality = signal.qualityClass;
      }
    }

    return signals;
  }

  private updateDashboardSummary(): void {
    this.context.dashboardSummary = `Map: ${this.context.mapState} | Range: ${this.context.activeRange?.toFixed(2) || 'N/A'} | Levels: ${this.context.activeFibLevels.length} | Boxes: ${this.context.activeBoxes.length} | Last Quality: ${this.context.lastReactionQuality || 'None'}`;
  }

  enable(): void {
    this.context.enabled = true;
  }

  disable(): void {
    this.context.enabled = false;
  }
}