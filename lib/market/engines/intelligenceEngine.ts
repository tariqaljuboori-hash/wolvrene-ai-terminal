import { isStale } from '../utils/time';
import type { MarketIntelligence, MarketSnapshot } from '../types';
import { buildLiquidityMap } from './liquidityEngine';
import { detectTrap } from './trapEngine';
import { buildRisk } from './riskEngine';

export function buildMarketIntelligence(snapshot: MarketSnapshot): MarketIntelligence {
  if (!snapshot.price || snapshot.candles.length < 5) return { exchange: snapshot.exchange, symbol: snapshot.symbol, interval: snapshot.interval, price: snapshot.price, state: 'DATA_UNAVAILABLE', bias: 'UNKNOWN', session: snapshot.session, liquidityLevels: [], latestSweep: null, fundingBias: snapshot.funding.bias, openInterestBias: snapshot.openInterest.bias, longShortBias: snapshot.longShort.bias, orderFlow: snapshot.orderFlow, liquidationMap: snapshot.liquidationMap, optionsMap: snapshot.optionsMap, onChainFlow: snapshot.onChainFlow, invalidation: null, targetLiquidity: null, nextDangerZone: null, confidence: 25, riskNotes: ['Core exchange data unavailable.'], decisionSummary: 'Data unavailable.', tacticalPlan: { condition: 'Wait', confirmationNeeded: 'Need core exchange feed', invalidationLogic: 'N/A', targetLogic: 'N/A', noTradeReason: 'DATA_UNAVAILABLE' }, timestamp: Date.now(), stale: true, errors: snapshot.errors };

  const liquidityLevels = buildLiquidityMap(snapshot);
  const trap = detectTrap(snapshot, liquidityLevels);
  const risk = buildRisk(snapshot.price, liquidityLevels, trap.latestSweep);

  const nearLiquidity = liquidityLevels.some((l) => (l.distancePct ?? 99) < 0.35);
  const state = trap.latestSweep ? (trap.reaction ? 'REACTION_CONFIRMED' : 'LIQUIDITY_SWEPT') : nearLiquidity ? 'HUNT_BUILDING' : 'NO_TRADE';
  const bias = trap.latestSweep?.direction === 'DOWN' ? 'BULLISH_REACTION' : trap.latestSweep?.direction === 'UP' ? 'BEARISH_REACTION' : 'NEUTRAL';
  const coreSignals = [snapshot.orderFlow.delta, snapshot.funding.rate, snapshot.openInterest.value, snapshot.markPrice].filter((x) => x != null).length;
  const confidence = Math.max(45, Math.min(86, (state === 'REACTION_CONFIRMED' ? 75 : state === 'LIQUIDITY_SWEPT' ? 62 : 52) + coreSignals * 2));

  return {
    exchange: snapshot.exchange, symbol: snapshot.symbol, interval: snapshot.interval, price: snapshot.price,
    state, bias, session: snapshot.session, liquidityLevels, latestSweep: trap.latestSweep,
    fundingBias: snapshot.funding.bias, openInterestBias: snapshot.openInterest.bias, longShortBias: snapshot.longShort.bias,
    orderFlow: snapshot.orderFlow, liquidationMap: snapshot.liquidationMap, optionsMap: snapshot.optionsMap, onChainFlow: snapshot.onChainFlow,
    invalidation: risk.invalidation, targetLiquidity: risk.targetLiquidity, nextDangerZone: risk.nextDangerZone,
    confidence,
    riskNotes: [...risk.riskNotes, snapshot.liquidationMap.source === 'derived' ? 'Liquidation zones are Derived / Estimated from exchange behavior, not official provider heatmaps.' : ''],
    decisionSummary: `${snapshot.symbol} ${state}. Core exchange intelligence is active${snapshot.liquidationMap.source === 'derived' ? '; liquidation pressure is derived/estimated.' : '.'}`,
    tacticalPlan: { condition: 'No trade before hunt, trap, reaction, risk checks.', confirmationNeeded: 'Sweep + reaction + non-conflicting crowding/order-flow context.', invalidationLogic: 'Invalidate on reclaim failure / structure break.', targetLogic: 'Target nearest opposite liquidity.', noTradeReason: confidence < 75 ? 'Setup incomplete or confidence below threshold.' : undefined },
    timestamp: Date.now(), stale: isStale(snapshot.timestamp), errors: snapshot.errors,
  };
}
