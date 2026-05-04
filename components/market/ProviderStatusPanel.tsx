export function ProviderStatusPanel({ status }: { status: Record<string, boolean> }) {
  const coreStatus = [
    { key: "exchange_candles", label: "Exchange Candles", state: "Active" },
    { key: "exchange_ticker", label: "Exchange Ticker", state: "Active" },
    { key: "funding_engine", label: "Funding Engine", state: "Active / Estimated" },
    { key: "session_engine", label: "Session Engine", state: "Active" },
    { key: "order_flow_proxy", label: "Order Flow Proxy", state: "Derived" },
    { key: "liquidity_map_proxy", label: "Liquidity Map Proxy", state: "Derived" },
    { key: "volume_profile_proxy", label: "Volume Profile Proxy", state: "Derived" },
    { key: "risk_engine", label: "Risk Engine", state: "Active" },
    { key: "radar_engine", label: "Radar Engine", state: "Active" },
    { key: "precision_engine", label: "Precision Engine", state: "Active" },
    { key: "ai_context_bridge", label: "AI Context Bridge", state: "Active" },
  ];

  const hasConfiguredProfessionalProvider = Object.values(status).some(Boolean);

  return (
    <div className="space-y-2 text-xs">
      <div className="rounded border border-zinc-700/70 bg-black/30 p-2 text-zinc-300">
        Professional providers: <b>{hasConfiguredProfessionalProvider ? "Optional / Configured" : "Optional / Not configured"}</b>
      </div>
      <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
        {coreStatus.map((item) => (
          <div key={item.key} className="rounded border border-zinc-700/60 bg-black/30 px-2 py-1">
            <span className="text-zinc-400">{item.label}</span>: <span className="font-semibold text-zinc-200">{item.state}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
