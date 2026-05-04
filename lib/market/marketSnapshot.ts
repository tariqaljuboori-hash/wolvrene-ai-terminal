import { classifyFunding, classifyLongShort, classifyOpenInterest } from './engines/leverageEngine';
import { buildOrderFlow } from './engines/orderFlowEngine';
import { buildSessionState } from './engines/sessionEngine';
import { buildVolumeProfile } from './engines/volumeProfileEngine';
import { getExchangeConnector } from './exchanges';
import type { ExchangeId, MarketSnapshot } from './types';
import { normalizeInterval } from './utils/intervals';
import { buildDerivedLiquidationLevels } from './engines/derivedLiquidationEngine';

export async function getMarketSnapshot({ exchange = 'bitget', symbol = 'BTCUSDT', interval = '15m', limit = 300 }: { exchange?: ExchangeId; symbol?: string; interval?: string; limit?: number; includeProfessionalProviders?: boolean }): Promise<MarketSnapshot> {
  const conn = getExchangeConnector(exchange);
  const iv = normalizeInterval(interval);
  const [candles, price, markPrice, orderBook, funding, oi, oiHistory, trades, longShort] = await Promise.all([
    conn.getCandles(symbol, iv, limit), conn.getPrice(symbol), conn.getMarkPrice(symbol), conn.getOrderBook(symbol, 50),
    conn.getFunding(symbol), conn.getOpenInterest(symbol), conn.getOpenInterestHistory(symbol, iv, 50), conn.getRecentTrades(symbol, 200), conn.getLongShortRatio(symbol),
  ]);
  const p = price ?? candles.at(-1)?.close ?? null;
  const oiPrev = oiHistory.at(-2)?.value ?? null;
  const fundingN = { ...funding, bias: classifyFunding(funding.rate) };
  const oiN = { ...oi, history: oiHistory, bias: classifyOpenInterest(oi.value, oiPrev) };
  const lsN = { ...longShort, bias: classifyLongShort(longShort.ratio, longShort.longPct, longShort.shortPct) };
  const preSnapshot = { exchange, symbol, interval: iv, price: p, markPrice: markPrice ?? p, timestamp: Date.now(), candles, recentTrades: trades, orderBook, funding: fundingN, openInterest: oiN, longShort: lsN };
  const derivedLevels = buildDerivedLiquidationLevels(preSnapshot as MarketSnapshot);
  return {
    ...preSnapshot,
    session: buildSessionState(candles),
    orderFlow: buildOrderFlow(trades, candles),
    volumeProfile: buildVolumeProfile(candles),
    liquidationMap: {
      levels: derivedLevels,
      nearestAbove: derivedLevels.find((l) => p != null && l.price > p) || null,
      nearestBelow: derivedLevels.filter((l) => p != null && l.price < p).sort((a, b) => b.price - a.price)[0] || null,
      source: 'derived',
      unavailableReason: 'Derived / Estimated liquidation proxy from exchange data. Not an official heatmap.',
    },
    optionsMap: { levels: [], maxPain: null, source: 'unavailable', unavailableReason: 'Optional provider not configured. Core exchange intelligence remains active.' },
    onChainFlow: { exchangeInflow: null, exchangeOutflow: null, netflow: null, stablecoinInflow: null, whaleActivity: 'UNKNOWN', source: 'unavailable', unavailableReason: 'Optional provider not configured. Core exchange intelligence remains active.' },
    errors: [],
    sourceStatus: { exchange: candles.length && p != null ? 'ok' : 'error', providers: 'unavailable' },
  };
}
