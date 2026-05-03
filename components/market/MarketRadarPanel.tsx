"use client";
import { useEffect, useRef, useState } from 'react';
import type { MarketIntelligence } from '@/lib/market/types';
import { MarketStateBadge } from './MarketStateBadge';
import { LiquidityMapPanel } from './LiquidityMapPanel';
import { OrderFlowPanel } from './OrderFlowPanel';
import { ProviderStatusPanel } from './ProviderStatusPanel';

export default function MarketRadarPanel({ defaultSymbol = 'BTCUSDT', defaultInterval = '15m', defaultExchange = 'bitget', onIntelligenceChange }: { defaultSymbol?: string; defaultInterval?: string; defaultExchange?: string; onIntelligenceChange?: (i: MarketIntelligence | null) => void; }) {
  const [exchange, setExchange] = useState(defaultExchange);
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [interval, setRadarInterval] = useState(defaultInterval);
  const [providers, setProviders] = useState(true);
  const [data, setData] = useState<MarketIntelligence | null>(null);
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const c = useRef<AbortController | null>(null);

  useEffect(() => { fetch('/api/market/providers/status').then((r) => r.json()).then(setStatus).catch(() => {}); }, []);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      c.current?.abort(); c.current = new AbortController();
      const r = await fetch(`/api/market/intelligence?exchange=${exchange}&symbol=${symbol}&interval=${interval}&providers=${providers}&limit=80`, { signal: c.current.signal, cache: 'no-store' });
      const j = await r.json(); if (mounted) { setData(j); onIntelligenceChange?.(j); }
    };
    load(); const id = setInterval(load, 30000);
    return () => { mounted = false; clearInterval(id); c.current?.abort(); };
  }, [exchange, symbol, interval, providers, onIntelligenceChange]);

  const providerConfigured = Object.values(status).some(Boolean);
  const coreStatus = data?.price != null && (data?.state !== 'DATA_UNAVAILABLE') ? 'Active' : data ? 'Partial' : 'Unavailable';

  return <div className='rounded-2xl border border-amber-700/40 p-3 bg-black/40 space-y-2 text-amber-100'>
    <div className='flex gap-2 text-xs'>
      <select value={exchange} onChange={(e) => setExchange(e.target.value)}>{['bitget', 'binance', 'bybit', 'okx'].map((x) => <option key={x}>{x}</option>)}</select>
      <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>{['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT'].map((x) => <option key={x}>{x}</option>)}</select>
      <select value={interval} onChange={(e) => setRadarInterval(e.target.value)}>{['5m', '15m', '1H', '4H'].map((x) => <option key={x}>{x}</option>)}</select>
      <label><input type='checkbox' checked={providers} onChange={(e) => setProviders(e.target.checked)} /> Providers</label>
    </div>

    <div className='text-xs rounded border border-zinc-700 p-2'>Core Exchange Intelligence: <b>{coreStatus}</b></div>
    <div className='text-xs rounded border border-zinc-700 p-2'>Professional Data Providers: <b>{providerConfigured ? 'Optional / Configured' : 'Optional / Not configured'}</b><div className='text-zinc-400'>Optional provider not configured. Core exchange intelligence remains active.</div></div>

    {!data ? <div>Loading...</div> : <>
      <div className='flex gap-2 items-center'><MarketStateBadge state={data.state} /><span>{data.bias}</span><span>Conf {data.confidence}</span><span>Price {data.price ?? 'Unavailable'}</span></div>
      <OrderFlowPanel flow={data.orderFlow} />
      <LiquidityMapPanel levels={data.liquidityLevels} />
      <div className='text-xs'>{data.decisionSummary}</div>
      <ProviderStatusPanel status={status} />
    </>}
  </div>;
}
