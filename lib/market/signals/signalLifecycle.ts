export type SignalState =
  | "SCANNING"
  | "WATCH"
  | "VALIDATED"
  | "EXECUTABLE"
  | "EXECUTED"
  | "MANAGED"
  | "CLOSED_TP"
  | "CLOSED_SL"
  | "CANCELLED"
  | "INVALIDATED"
  | "BLOCKED";

export interface Signal {
  id: string;
  symbol: string;
  timeframe: string;
  normalizedDirection: "LONG" | "SHORT" | "WAIT" | "NONE";
  radarState: string;
  triggerKey: string;
  levelOrEntry?: number;
  candleTime: number;
  state: SignalState;
  createdAt: number;
  updatedAt: number;
  reason?: string;
}

class SignalLifecycleEngine {
  private signals: Map<string, Signal> = new Map();
  private maxSignals = 100;
  private cooldownMs = 30000; // 30 seconds per symbol/timeframe/direction

  generateSignalId(symbol: string, timeframe: string, direction: string, radarState: string, triggerKey: string, levelOrEntry?: number): string {
    return `${symbol}-${timeframe}-${direction}-${radarState}-${triggerKey}-${levelOrEntry || 'none'}`;
  }

  addSignal(signal: Omit<Signal, 'id' | 'createdAt' | 'updatedAt'>): boolean {
    const id = this.generateSignalId(signal.symbol, signal.timeframe, signal.normalizedDirection, signal.radarState, signal.triggerKey, signal.levelOrEntry);

    // Check cooldown
    const existing = this.signals.get(id);
    if (existing && Date.now() - existing.updatedAt < this.cooldownMs) {
      return false; // Cooldown active
    }

    const newSignal: Signal = {
      ...signal,
      id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.signals.set(id, newSignal);

    // Limit max signals
    if (this.signals.size > this.maxSignals) {
      const oldest = Array.from(this.signals.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
      this.signals.delete(oldest[0]);
    }

    return true;
  }

  updateSignal(id: string, updates: Partial<Pick<Signal, 'state' | 'reason'>>): boolean {
    const signal = this.signals.get(id);
    if (!signal) return false;

    signal.state = updates.state ?? signal.state;
    signal.reason = updates.reason ?? signal.reason;
    signal.updatedAt = Date.now();
    return true;
  }

  getSignals(symbol?: string, timeframe?: string, direction?: string): Signal[] {
    return Array.from(this.signals.values())
      .filter(s =>
        (!symbol || s.symbol === symbol) &&
        (!timeframe || s.timeframe === timeframe) &&
        (!direction || s.normalizedDirection === direction)
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getActiveSignals(): Signal[] {
    return this.getSignals().filter(s => !['CLOSED_TP', 'CLOSED_SL', 'CANCELLED', 'INVALIDATED'].includes(s.state));
  }

  getExecutableSignals(): Signal[] {
    return this.getSignals().filter(s => s.state === 'EXECUTABLE');
  }

  invalidateOldSignals(maxAgeMs: number = 5 * 60 * 1000): void {
    const now = Date.now();
    for (const [id, signal] of this.signals.entries()) {
      if (now - signal.updatedAt > maxAgeMs && !['EXECUTED', 'MANAGED'].includes(signal.state)) {
        signal.state = 'INVALIDATED';
        signal.updatedAt = now;
      }
    }
  }
}

export const signalLifecycleEngine = new SignalLifecycleEngine();