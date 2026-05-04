"use client";

import { useEffect, useRef, useState } from "react";

import type { MarketIntelligence } from "@/lib/market/types";

import { MarketStateBadge } from "./MarketStateBadge";
import { OrderFlowPanel } from "./OrderFlowPanel";
import { ProviderStatusPanel } from "./ProviderStatusPanel";

// Conflict-safe unified panel implementation.

type Props = {
  defaultSymbol?: string;
  defaultInterval?: string;
  defaultExchange?: string;
  onIntelligenceChange?: (intelligence: MarketIntelligence | null) => void;
};

export default function MarketRadarPanel({
  defaultSymbol = "BTCUSDT",
  defaultInterval = "15m",
  defaultExchange = "bitget",
  onIntelligenceChange,
}: Props) {
  const [exchange, setExchange] = useState(defaultExchange);
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [interval, setRadarInterval] = useState(defaultInterval);
  const [providers, setProviders] = useState(true);
  const [data, setData] = useState<MarketIntelligence | null>(null);
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    fetch("/api/market/providers/status", { signal: controller.signal })
      .then((r) => r.json())
      .then((json) => {
        if (mounted) setStatus(json);
      })
      .catch((error: unknown) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const requestId = ++requestIdRef.current;
      controllerRef.current?.abort();
      controllerRef.current = new AbortController();
      try {
        const response = await fetch(
          `/api/market/intelligence?exchange=${exchange}&symbol=${symbol}&interval=${interval}&providers=${providers}&limit=80`,
          { signal: controllerRef.current.signal, cache: "no-store" }
        );

        const json = await response.json();

        if (mounted && requestId === requestIdRef.current) {
          setData(json);
          onIntelligenceChange?.(json);
        }
      } catch (error: unknown) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }
      }
    };

    load();
    const id = setInterval(load, 30000);

    return () => {
      mounted = false;
      clearInterval(id);
      controllerRef.current?.abort();
    };
  }, [exchange, symbol, interval, providers, onIntelligenceChange]);

  const providerConfigured = Object.values(status).some(Boolean);
  const coreStatus =
    data?.price != null && data.state !== "DATA_UNAVAILABLE"
      ? "Active"
      : data
      ? "Partial"
      : "Unavailable";

  return (
    <div className="rounded-2xl border border-amber-700/40 bg-black/40 p-3 text-amber-100 space-y-2">
      <div className="flex gap-2 text-xs">
        <select value={exchange} onChange={(e) => setExchange(e.target.value)}>
          {["bitget", "binance", "bybit", "okx"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
          {["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select value={interval} onChange={(e) => setRadarInterval(e.target.value)}>
          {["5m", "15m", "1H", "4H"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={providers}
            onChange={(e) => setProviders(e.target.checked)}
          />{" "}
          Providers
        </label>
      </div>

      <div className="rounded border border-zinc-700 p-2 text-xs">
        Core Exchange Intelligence: <b>{coreStatus}</b>
      </div>
      <div className="rounded border border-zinc-700 p-2 text-xs">
        Professional Data Providers: <b>{providerConfigured ? "Optional / Configured" : "Optional / Not configured"}</b>
        <div className="text-zinc-400">
          Optional provider not configured. Core exchange intelligence remains active.
        </div>
      </div>

      {!data ? (
        <div>Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded border border-zinc-700 p-2">State: <span className="font-bold">{data.state}</span></div>
            <div className="rounded border border-zinc-700 p-2">Bias: <span className="font-bold">{data.bias}</span></div>
            <div className="rounded border border-zinc-700 p-2">Confidence: <span className="font-bold">{data.confidence.toFixed(1)}%</span></div>
            <div className="rounded border border-zinc-700 p-2">Price: <span className="font-bold">{data.price != null ? data.price.toFixed(2) : "Unavailable"}</span></div>
          </div>
          <div className="flex items-center gap-2">
            <MarketStateBadge state={data.state} />
            <span>{data.decisionSummary}</span>
          </div>
          <div className="rounded border border-zinc-700 p-2 text-xs">
            <div className="font-semibold mb-1">Liquidity Map (Top 5)</div>
            <div className="space-y-1">
              {data.liquidityLevels.slice(0, 5).map((l) => (
                <div key={l.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2">
                  <span>{l.type}</span>
                  <span>{l.price.toFixed(2)}</span>
                  <span className="rounded px-1 border border-zinc-600">{l.side}</span>
                  <span>{l.strength}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded border border-zinc-700 p-2 text-xs">
            <div className="font-semibold mb-1">Derived Hunt / Liquidation Pressure</div>
            <div>{data.liquidationMap.source === "derived" ? "Derived / Estimated from exchange behavior." : "Unavailable"}</div>
          </div>
          <div className="rounded border border-zinc-700 p-2 text-xs">
            <div className="font-semibold mb-1">Order Flow</div>
            <OrderFlowPanel flow={{...data.orderFlow, delta: data.orderFlow.delta != null ? Number(data.orderFlow.delta.toFixed(2)) : null, cvd: data.orderFlow.cvd != null ? Number(data.orderFlow.cvd.toFixed(2)) : null}} />
          </div>
          <div className="rounded border border-zinc-700 p-2 text-xs">
            <div className="font-semibold mb-1">Risk Notes</div>
            <div>{data.riskNotes[0] || "No risk note."}</div>
          </div>
          <div className="rounded border border-zinc-700 p-2 text-xs">
            <div className="font-semibold mb-1">Tactical Plan</div>
            <div>{data.tacticalPlan.condition}</div>
          </div>
          <details className="rounded border border-zinc-700 p-2 text-xs">
            <summary>Provider details</summary>
            <ProviderStatusPanel status={status} />
          </details>
        </>
      )}
    </div>
  );
}
