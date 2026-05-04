import type { SmartFibSignal } from "./SmartFibTypes";

export class SmartFibSignals {
  private signals: SmartFibSignal[] = [];
  private maxSignals = 100;

  addSignal(signal: SmartFibSignal): void {
    this.signals.push(signal);
    if (this.signals.length > this.maxSignals) {
      this.signals.shift();
    }
  }

  getSignals(type?: SmartFibSignal["type"], side?: SmartFibSignal["side"]): SmartFibSignal[] {
    return this.signals.filter(s =>
      (!type || s.type === type) &&
      (!side || s.side === side)
    );
  }

  getLatestSignal(): SmartFibSignal | undefined {
    return this.signals[this.signals.length - 1];
  }

  getExecutableSignals(): SmartFibSignal[] {
    return this.signals.filter(s => s.executable && s.status === "EXECUTABLE");
  }

  clearOldSignals(maxAge: number): void {
    const now = Date.now();
    this.signals = this.signals.filter(s => now - s.timestamp < maxAge);
  }
}