"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  createChart,
  IChartApi,
  ISeriesApi,
} from "lightweight-charts";
import { getBitgetCandles, getBitgetTickerStats, TF_SECONDS, TIMEFRAMES } from "@/lib/bitget";
import { createOrderFromPrice, formatPrice, profitPct, riskPct } from "@/lib/tradingMath";
import { loadJson, saveJson } from "@/lib/storage";
import type {
  Candle,
  ChartSettings,
  Direction,
  DragTarget,
  JournalEntry,
  LineEditor,
  PriceAlert,
  TradeOrder,
} from "@/types/trading";

const defaultSettings: ChartSettings = {
  bullColor: "#ffe629",
  bearColor: "#8e24aa",
  backgroundColor: "#000000",
  textColor: "#d1d5db",
  gridColor: "#222222",
  showGrid: true,
};

const card =
  "bg-[#151519]/95 border border-[#24242a] rounded-2xl shadow-[0_0_35px_rgba(0,0,0,0.45)] hover:border-[#3a3020] transition";

const gold = "#d89b00";

export default function WolvreneTerminal() {
  const [timeframe, setTimeframe] = useState("5m");
  const [settings, setSettings] = useState<ChartSettings>(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [hideUI, setHideUI] = useState(false);

  const [orders, setOrders] = useState<TradeOrder[]>([]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [lineEditor, setLineEditor] = useState<LineEditor>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);

  const [session, setSession] = useState("Loading...");
  const [clock, setClock] = useState("--:--:--");
  const [sessionCountdown, setSessionCountdown] = useState("--:--");
  const [wolfMode, setWolfMode] = useState("STALKING");
  const [bias, setBias] = useState("NEUTRAL");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [journalNote, setJournalNote] = useState("");
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0, price: 0 });

  const [marketStats, setMarketStats] = useState({
    high: "--",
    low: "--",
    volume: "--",
    change: "--",
    funding: "--",
  });

  const priceTextRef = useRef<HTMLParagraphElement>(null);
  const statusTextRef = useRef<HTMLSpanElement>(null);
  const latencyTextRef = useRef<HTMLSpanElement>(null);
  const lastTickTextRef = useRef<HTMLSpanElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastCandleRef = useRef<Candle | null>(null);
  const chartAliveRef = useRef(false);
  const timeframeRef = useRef(timeframe);
  const ordersRef = useRef<TradeOrder[]>(orders);
  const alertsRef = useRef<PriceAlert[]>(alerts);
  const lastTickMsRef = useRef<number>(0);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || orders[0] || null,
    [orders, selectedOrderId]
  );

  const confidence = bias === "BULLISH" ? 68 : bias === "BEARISH" ? 61 : 42;

  useEffect(() => {
    timeframeRef.current = timeframe;
  }, [timeframe]);

  useEffect(() => {
    ordersRef.current = orders;
    saveJson("wolvreneOrdersV15", orders);
  }, [orders]);

  useEffect(() => {
    alertsRef.current = alerts;
    saveJson("wolvreneAlertsV15", alerts);
  }, [alerts]);

  useEffect(() => {
    saveJson("wolvreneChartSettings", settings);
  }, [settings]);

  useEffect(() => {
    setSettings(loadJson("wolvreneChartSettings", defaultSettings));
    setOrders(loadJson("wolvreneOrdersV15", [] as TradeOrder[]));
    setAlerts(loadJson("wolvreneAlertsV15", [] as PriceAlert[]));
    setJournalEntries(loadJson("wolvreneJournal", [] as JournalEntry[]));
  }, []);

  function beep() {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.value = 0.08;

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.18);
    } catch {}
  }

  function addJournal(note: string) {
    setJournalEntries((prev) => {
      const updated = [{ id: Date.now(), time: new Date().toLocaleString(), note }, ...prev].slice(0, 50);
      saveJson("wolvreneJournal", updated);
      return updated;
    });
  }

  function saveJournalNote() {
    if (!journalNote.trim()) return;
    addJournal(journalNote.trim());
    setJournalNote("");
  }

  function clearJournal() {
    setJournalEntries([]);
    localStorage.removeItem("wolvreneJournal");
  }

  const reloadCandles = useCallback(async () => {
    const candles = await getBitgetCandles(timeframeRef.current);
    if (!chartAliveRef.current || !candleSeriesRef.current || candles.length === 0) return;

    candleSeriesRef.current.setData(candles);
    lastCandleRef.current = candles[candles.length - 1];

    const first = candles[0]?.close;
    const last = candles[candles.length - 1]?.close;

    if (first && last) {
      if (last > first) {
        setBias("BULLISH");
        setWolfMode("HUNT MODE");
      } else if (last < first) {
        setBias("BEARISH");
        setWolfMode("STALKING");
      } else {
        setBias("NEUTRAL");
        setWolfMode("NO TRADE");
      }
    }

    chartApiRef.current?.timeScale().fitContent();
  }, []);

  function resetDashboard() {
    setHideUI(false);
    setContextMenu({ open: false, x: 0, y: 0, price: 0 });
    chartApiRef.current?.timeScale().fitContent();
    reloadCandles();
  }

  async function getMarketStats() {
    try {
      const row = await getBitgetTickerStats();
      setMarketStats({
        high: row?.high24h ? Number(row.high24h).toLocaleString() : "--",
        low: row?.low24h ? Number(row.low24h).toLocaleString() : "--",
        volume: row?.baseVolume ? Number(row.baseVolume).toLocaleString() : "--",
        change: row?.priceChangePercent ? `${Number(row.priceChangePercent).toFixed(2)}%` : "--",
        funding: row?.fundingRate ? `${(Number(row.fundingRate) * 100).toFixed(4)}%` : "--",
      });
    } catch {}
  }

  function updateSessionClock() {
    const now = new Date();
    const utcHour = now.getUTCHours();

    setClock(now.toLocaleTimeString());

    let nextHour = 0;

    if (utcHour >= 0 && utcHour < 7) {
      setSession("Sydney / Asia Build");
      nextHour = 7;
    } else if (utcHour >= 7 && utcHour < 12) {
      setSession("London Open");
      nextHour = 12;
    } else if (utcHour >= 12 && utcHour < 21) {
      setSession("New York Active");
      nextHour = 21;
    } else {
      setSession("Late NY / Reset Zone");
      nextHour = 24;
    }

    const nowUtcMs =
      now.getUTCHours() * 3600000 +
      now.getUTCMinutes() * 60000 +
      now.getUTCSeconds() * 1000;

    const diff = Math.max(0, nextHour * 3600000 - nowUtcMs);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    setSessionCountdown(`${h}h ${m}m`);
  }

  function priceToTop(price: number) {
    const series = candleSeriesRef.current;
    if (!series) return null;
    const coordinate = series.priceToCoordinate(price);
    return typeof coordinate === "number" ? coordinate : null;
  }

  function coordinateToPrice(clientY: number) {
    const rect = chartContainerRef.current?.getBoundingClientRect();
    const series = candleSeriesRef.current;
    if (!rect || !series) return livePrice || lastCandleRef.current?.close || 0;

    const y = clientY - rect.top;
    const price = series.coordinateToPrice(y);
    return Number(price || livePrice || lastCandleRef.current?.close || 0);
  }

  function createOrder(side: Direction, basePrice?: number) {
    const price = basePrice || livePrice || lastCandleRef.current?.close;
    if (!price) return;

    const order = createOrderFromPrice(side, price);
    setOrders((prev) => [order, ...prev]);
    setSelectedOrderId(order.id);
    addJournal(`${side} limit order created at ${formatPrice(price)}`);
  }

  function updateOrder(orderId: number, patch: Partial<TradeOrder>) {
    setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, ...patch } : order)));
  }

  function updateOrderLine(target: DragTarget, price: number) {
    if (!target) return;

    setOrders((prev) =>
      prev.map((order) => {
        if (target.type === "entry" && order.id === target.orderId) return { ...order, entry: price };
        if (target.type === "sl" && order.id === target.orderId) return { ...order, sl: price };

        if (target.type === "tp" && order.id === target.orderId) {
          return {
            ...order,
            tps: order.tps.map((tp) => (tp.id === target.tpId ? { ...tp, price } : tp)),
          };
        }

        return order;
      })
    );
  }

  function updateTP(orderId: number, tpId: number, patch: Partial<TradeOrder["tps"][number]>) {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId
          ? { ...order, tps: order.tps.map((tp) => (tp.id === tpId ? { ...tp, ...patch } : tp)) }
          : order
      )
    );
  }

  function deleteOrder(orderId: number) {
    setOrders((prev) => prev.filter((order) => order.id !== orderId));
    if (selectedOrderId === orderId) setSelectedOrderId(null);
    addJournal(`Order #${String(orderId).slice(-4)} deleted`);
  }

  function addTP(orderId: number) {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        const base = livePrice || order.entry;
        const nextIndex = order.tps.length + 1;
        const isLong = order.side === "LONG";
        const nextTp = {
          id: Date.now() + Math.floor(Math.random() * 999),
          label: `TP${nextIndex}`,
          price: isLong ? base * (1 + nextIndex * 0.005) : base * (1 - nextIndex * 0.005),
          closePct: 25,
          hit: false,
        };
        return { ...order, tps: [...order.tps, nextTp] };
      })
    );
  }

  function deleteTP(orderId: number, tpId: number) {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;

        const remainingTps = order.tps.filter((tp) => tp.id !== tpId);

        return {
          ...order,
          tps: remainingTps.map((tp, index) => ({ ...tp, label: `TP${index + 1}` })),
        };
      })
    );

    addJournal(`TP removed from order #${String(orderId).slice(-4)}`);
  }

  function addAlert(price?: number, side: "above" | "below" = "above") {
    const alertPrice = price || livePrice || lastCandleRef.current?.close;
    if (!alertPrice) return;

    const alert: PriceAlert = {
      id: Date.now() + Math.floor(Math.random() * 999),
      enabled: true,
      price: alertPrice,
      side,
      sound: true,
      hit: false,
    };

    setAlerts((prev) => [alert, ...prev]);
    addJournal(`Alert created ${side.toUpperCase()} ${formatPrice(alertPrice)}`);
  }

  function updateAlert(alertId: number, patch: Partial<PriceAlert>) {
    setAlerts((prev) => prev.map((alert) => (alert.id === alertId ? { ...alert, ...patch } : alert)));
  }

  function deleteAlert(alertId: number) {
    setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
  }

  function updateAlertLine(target: DragTarget, price: number) {
    if (!target || target.type !== "alert") return;
    setAlerts((prev) =>
      prev.map((alert) =>
        alert.id === target.alertId ? { ...alert, price, hit: false } : alert
      )
    );
  }

  function checkAlertsAndOrders(price: number) {
    setAlerts((prev) =>
      prev.map((alert) => {
        if (!alert.enabled || alert.hit) return alert;
        const hit =
          (alert.side === "above" && price >= alert.price) ||
          (alert.side === "below" && price <= alert.price);

        if (hit) {
          if (alert.sound) beep();
          addJournal(`Alert hit: BTC ${alert.side.toUpperCase()} ${formatPrice(alert.price)}`);
          return { ...alert, hit: true };
        }

        return alert;
      })
    );

    setOrders((prev) =>
      prev.map((order) => {
        let changed = false;
        const isLong = order.side === "LONG";

        const tps = order.tps.map((tp) => {
          if (tp.hit) return tp;
          const hit = isLong ? price >= tp.price : price <= tp.price;

          if (hit) {
            changed = true;
            addJournal(`${tp.label} hit for ${order.side} #${String(order.id).slice(-4)} — close ${tp.closePct}%`);
            return { ...tp, hit: true };
          }

          return tp;
        });

        const slHit = isLong ? price <= order.sl : price >= order.sl;
        if (slHit && order.status !== "CLOSED") {
          changed = true;
          addJournal(`SL hit for ${order.side} #${String(order.id).slice(-4)}`);
          return { ...order, status: "CLOSED", tps };
        }

        return changed ? { ...order, tps } : order;
      })
    );
  }

  function openLineEditor(editor: LineEditor) {
    setLineEditor(editor);
    setContextMenu({ open: false, x: 0, y: 0, price: 0 });
  }

  function editorOrder() {
    if (!lineEditor || !("orderId" in lineEditor)) return null;
    return orders.find((order) => order.id === lineEditor.orderId) || null;
  }

  function editorTP() {
    const order = editorOrder();
    if (!order || !lineEditor || lineEditor.type !== "tp") return null;
    return order.tps.find((tp) => tp.id === lineEditor.tpId) || null;
  }

  useEffect(() => {
    updateSessionClock();
    getMarketStats();

    const clockTimer = setInterval(updateSessionClock, 1000);
    const statsTimer = setInterval(getMarketStats, 15000);

    return () => {
      clearInterval(clockTimer);
      clearInterval(statsTimer);
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;

    chartAliveRef.current = false;
    chartRef.current.innerHTML = "";

    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: fullscreen ? 720 : 520,
      layout: {
        background: { color: settings.backgroundColor },
        textColor: settings.textColor,
      },
      grid: {
        vertLines: { color: settings.showGrid ? settings.gridColor : "transparent" },
        horzLines: { color: settings.showGrid ? settings.gridColor : "transparent" },
      },
      rightPriceScale: { borderColor: "#2b2b31" },
      timeScale: {
        borderColor: "#2b2b31",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 0,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: settings.bullColor,
      downColor: settings.bearColor,
      borderUpColor: settings.bullColor,
      borderDownColor: settings.bearColor,
      wickUpColor: settings.bullColor,
      wickDownColor: settings.bearColor,
      priceLineVisible: true,
    });

    chartApiRef.current = chart;
    candleSeriesRef.current = candleSeries;
    chartAliveRef.current = true;

    reloadCandles();

    const resizeObserver = new ResizeObserver(() => {
      if (!chartAliveRef.current || !chartRef.current || !chartApiRef.current) return;
      requestAnimationFrame(() => {
        if (!chartAliveRef.current || !chartRef.current || !chartApiRef.current) return;
        chartApiRef.current.applyOptions({ width: chartRef.current.clientWidth });
      });
    });

    resizeObserver.observe(chartRef.current);

    return () => {
      chartAliveRef.current = false;
      resizeObserver.disconnect();
      candleSeriesRef.current = null;
      lastCandleRef.current = null;
      chartApiRef.current = null;

      try {
        chart.remove();
      } catch {}
    };
  }, [timeframe, settings, fullscreen, reloadCandles]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let pingTimer: NodeJS.Timeout | null = null;
    let manualClose = false;

    const setStatus = (text: string) => {
      if (statusTextRef.current) statusTextRef.current.textContent = text;
    };

    const updateLiveCandle = (price: number) => {
      if (!chartAliveRef.current) return;

      const series = candleSeriesRef.current;
      const lastCandle = lastCandleRef.current;
      if (!series || !lastCandle) return;

      const tf = TF_SECONDS[timeframeRef.current];
      const now = Math.floor(Date.now() / 1000);
      const currentCandleTime = Math.floor(now / tf) * tf;

      const updatedCandle: Candle =
        currentCandleTime > lastCandle.time
          ? { time: currentCandleTime, open: price, high: price, low: price, close: price }
          : {
              ...lastCandle,
              high: Math.max(lastCandle.high, price),
              low: Math.min(lastCandle.low, price),
              close: price,
            };

      try {
        candleSeriesRef.current?.update(updatedCandle);
        lastCandleRef.current = updatedCandle;
      } catch {}
    };

    const connect = () => {
      manualClose = false;
      setStatus("CONNECTING");
      ws = new WebSocket("wss://ws.bitget.com/v2/ws/public");

      ws.onopen = () => {
        setStatus("LIVE");

        ws?.send(
          JSON.stringify({
            op: "subscribe",
            args: [{ instType: "USDT-FUTURES", channel: "ticker", instId: "BTCUSDT" }],
          })
        );

        pingTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send("ping");
        }, 20000);
      };

      ws.onmessage = (event) => {
        if (event.data === "pong") return;

        const msg = JSON.parse(event.data);
        const lastPriceRaw = msg?.data?.[0]?.lastPr;
        if (!lastPriceRaw) return;

        const price = Number(lastPriceRaw);
        setLivePrice(price);
        lastTickMsRef.current = Date.now();

        if (priceTextRef.current) {
          priceTextRef.current.textContent = price.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
        }

        if (lastTickTextRef.current) lastTickTextRef.current.textContent = "0.0s ago";
        if (latencyTextRef.current) latencyTextRef.current.textContent = "< 1s";

        updateLiveCandle(price);
        checkAlertsAndOrders(price);
      };

      ws.onclose = () => {
        if (pingTimer) clearInterval(pingTimer);
        if (manualClose) return;
        setStatus("RECONNECTING");
        reconnectTimer = setTimeout(connect, 1000);
      };

      ws.onerror = () => {
        setStatus("ERROR");
        ws?.close();
      };
    };

    connect();

    const tickAgeTimer = setInterval(() => {
      if (!lastTickMsRef.current || !lastTickTextRef.current) return;
      const seconds = (Date.now() - lastTickMsRef.current) / 1000;
      lastTickTextRef.current.textContent = `${seconds.toFixed(1)}s ago`;
    }, 500);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        reloadCandles();
        if (!ws || ws.readyState === WebSocket.CLOSED) connect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      manualClose = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(tickAgeTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      ws?.close();
    };
  }, [reloadCandles]);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!dragTarget) return;
      const nextPrice = coordinateToPrice(e.clientY);
      if (!nextPrice) return;

      if (dragTarget.type === "alert") updateAlertLine(dragTarget, nextPrice);
      else updateOrderLine(dragTarget, nextPrice);
    }

    function handleMouseUp() {
      const target = dragTarget;

      if (target) {
        addJournal("Chart line updated by drag");

        if (target.type === "alert") {
          openLineEditor({ type: "alert", alertId: target.alertId });
        }

        if (target.type === "entry") {
          setSelectedOrderId(target.orderId);
          openLineEditor({ type: "entry", orderId: target.orderId });
        }

        if (target.type === "sl") {
          setSelectedOrderId(target.orderId);
          openLineEditor({ type: "sl", orderId: target.orderId });
        }

        if (target.type === "tp") {
          setSelectedOrderId(target.orderId);
          openLineEditor({ type: "tp", orderId: target.orderId, tpId: target.tpId });
        }
      }

      setDragTarget(null);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragTarget]);

  const LineButton = ({
    top,
    color,
    label,
    value,
    dashed = false,
    onMouseDown,
    onClick,
    onDelete,
    hit,
  }: {
    top: number | null;
    color: string;
    label: string;
    value: number;
    dashed?: boolean;
    onMouseDown: () => void;
    onClick: () => void;
    onDelete?: () => void;
    hit?: boolean;
  }) => {
    if (top === null) return null;

    const activeColor = hit ? "#ef4444" : color;
    const isGreen = activeColor.toLowerCase().includes("22c55e") || activeColor.toLowerCase().includes("14b8a6");
    const isYellow = activeColor.toLowerCase().includes("facc15") || activeColor.toLowerCase().includes("d89b00");
    const subtleBg = hit
      ? "rgba(239,68,68,0.14)"
      : isGreen
      ? "rgba(34,197,94,0.13)"
      : isYellow
      ? "rgba(250,204,21,0.13)"
      : "rgba(239,68,68,0.13)";

    const solidBg = hit
      ? "#ef4444"
      : isGreen
      ? "#00c087"
      : isYellow
      ? "#facc15"
      : "#ef4444";

    const textColor = isYellow && !hit ? "#111111" : "#ffffff";

    return (
      <div
        className="absolute left-0 right-0 z-20 group select-none"
        style={{ top }}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMouseDown();
          }}
          className={`h-0 cursor-row-resize ${dashed ? "border-t border-dashed" : "border-t"}`}
          style={{ borderColor: activeColor, opacity: hit ? 0.95 : 0.78 }}
        />

        <div
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMouseDown();
          }}
          className="absolute right-1 -top-[10px] flex h-[20px] items-center cursor-row-resize text-[10px] font-bold tracking-tight drop-shadow-[0_0_8px_rgba(0,0,0,0.85)]"
        >
          <span
            className="h-[20px] flex items-center rounded-l-[3px] border px-2 uppercase"
            style={{
              backgroundColor: subtleBg,
              borderColor: activeColor,
              color: activeColor,
              boxShadow: `0 0 10px ${subtleBg}`,
            }}
          >
            {hit ? "HIT" : label}
          </span>

          <span
            className="h-[20px] flex items-center rounded-r-[3px] px-2 font-black"
            style={{ backgroundColor: solidBg, color: textColor }}
          >
            {formatPrice(value)}
          </span>

          {onDelete && (
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragTarget(null);
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setLineEditor(null);
                setDragTarget(null);
                onDelete();
              }}
              className="ml-[2px] hidden h-[20px] w-[20px] items-center justify-center rounded-[3px] border border-red-500/70 bg-red-500/15 text-[11px] font-black text-red-300 hover:bg-red-500 hover:text-white group-hover:flex"
              title="Delete"
            >
              ×
            </button>
          )}
        </div>
      </div>
    );
  };

  const editorCurrentPrice = useMemo(() => {
    if (!lineEditor) return 0;

    if (lineEditor.type === "alert") {
      return alerts.find((alert) => alert.id === lineEditor.alertId)?.price || 0;
    }

    const order = editorOrder();
    if (!order) return 0;

    if (lineEditor.type === "entry") return order.entry;
    if (lineEditor.type === "sl") return order.sl;

    return editorTP()?.price || 0;
  }, [lineEditor, alerts, orders]);

  const editorOrderValue = editorOrder();
  const editorTPValue = editorTP();

  return (
    <main
      onClick={() => setContextMenu({ open: false, x: 0, y: 0, price: 0 })}
      className="min-h-screen bg-[radial-gradient(circle_at_top,#18120a_0%,#070707_42%,#000_100%)] text-white p-4 overflow-x-hidden"
    >
      <div className={fullscreen ? "w-full max-w-[1800px] mx-auto" : "w-full max-w-7xl mx-auto"}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <img src="/wolvrene-logo.png" alt="Wolvrene Logo" className="w-11 h-11 object-contain" />
              <h1
                className="text-3xl font-black tracking-[0.08em]"
                style={{ color: gold, textShadow: "0 0 16px rgba(216,155,0,0.55)" }}
              >
                WOLVRENE
              </h1>
            </div>
            <p className="text-gray-500 text-xs tracking-wide">BTC AI Dashboard v15.6 — Bitget Style Lines</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:block text-right">
              <p className="text-xs text-gray-500">Local Time</p>
              <p className="text-sm font-bold text-yellow-500">{clock}</p>
            </div>

            <button
              onClick={() => setSettingsOpen(true)}
              className="h-10 px-4 rounded-xl bg-[#16161c] border border-[#2d2d35] text-sm hover:border-yellow-600 hover:text-yellow-400 transition"
            >
              ⚙ Settings
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
          <div className="min-w-0">
            {!hideUI && (
              <>
                <div className="grid md:grid-cols-3 gap-4 mb-4">
                  <div className={`${card} p-5`}>
                    <div className="flex justify-between items-start">
                      <h2 className="text-sm text-gray-400 font-semibold">BTC Tick Price</h2>
                      <span className="text-[10px] px-2 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 animate-pulse">
                        LIVE
                      </span>
                    </div>
                    <p ref={priceTextRef} className="text-3xl font-black mt-2">
                      Loading...
                    </p>
                    <p className="text-xs text-gray-600 mt-2">Bitget WebSocket USDT-FUTURES</p>
                    <p className="text-[11px] mt-2 text-gray-500">
                      Status: <span ref={statusTextRef} className="text-green-400">CONNECTING</span>
                    </p>
                  </div>

                  <div className={`${card} p-5`}>
                    <h2 className="text-sm text-gray-400 font-semibold">Market Session</h2>
                    <p className="text-2xl font-black mt-2" style={{ color: gold }}>
                      {session}
                    </p>
                    <p className="text-xs text-gray-600 mt-2">Next phase: {sessionCountdown}</p>
                  </div>

                  <div className={`${card} p-5`}>
                    <h2 className="text-sm text-gray-400 font-semibold">Wolf Radar</h2>
                    <p className="text-3xl font-black text-yellow-500 mt-2">{wolfMode}</p>
                    <p className="text-xs text-gray-600 mt-2">Bias: {bias}</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-5 gap-3 mb-4">
                  {[
                    ["24H High", `$${marketStats.high}`],
                    ["24H Low", `$${marketStats.low}`],
                    ["24H Volume", marketStats.volume],
                    ["24H Change", marketStats.change],
                    ["Funding", marketStats.funding],
                  ].map(([label, value]) => (
                    <div key={label} className={`${card} p-4`}>
                      <p className="text-[11px] text-gray-500 uppercase tracking-wider">{label}</p>
                      <p className="text-lg font-bold mt-1">{value}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className={`${card} p-4 min-w-0 overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-lg font-bold">BTC Live Candlestick Chart</h2>
                  <p className="text-[11px] text-gray-600">
                    Last Tick: <span ref={lastTickTextRef}>--</span> · Latency:{" "}
                    <span ref={latencyTextRef}>--</span>
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5 items-center rounded-2xl bg-black/50 border border-zinc-800 p-1.5">
                  {["1m", "5m", "15m", "1H", "4H"].map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`h-7 min-w-9 px-2.5 rounded-lg text-[11px] border transition ${
                        timeframe === tf
                          ? "bg-yellow-600 border-yellow-500 text-black font-black shadow-[0_0_18px_rgba(216,155,0,0.35)]"
                          : "bg-[#08080a] border-[#27272f] text-gray-300 hover:text-white hover:border-yellow-700"
                      }`}
                    >
                      {tf}
                    </button>
                  ))}

                  <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                    className="h-7 bg-[#08080a] border border-[#27272f] rounded-lg px-2 text-[11px] text-white outline-none hover:border-yellow-700"
                  >
                    {TIMEFRAMES.map((tf) => (
                      <option key={tf} value={tf}>
                        {tf}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={resetDashboard}
                    className="h-7 px-2.5 rounded-lg text-[11px] bg-[#08080a] border border-[#27272f] hover:border-yellow-700"
                  >
                    Reset
                  </button>

                  <button
                    onClick={() => setFullscreen(!fullscreen)}
                    className="h-7 px-2.5 rounded-lg text-[11px] bg-[#08080a] border border-[#27272f] hover:border-yellow-700 hover:text-yellow-400 transition"
                  >
                    {fullscreen ? "Exit" : "Full"}
                  </button>
                </div>
              </div>

              <div
                ref={chartContainerRef}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();

                  const price = coordinateToPrice(e.clientY);

                  setContextMenu({
                    open: true,
                    x: e.clientX,
                    y: e.clientY,
                    price,
                  });
                }}
                className="relative overflow-hidden rounded-xl border border-zinc-800 bg-black w-full min-w-0"
              >
                <div ref={chartRef} className="w-full min-w-0" />

                {alerts.map((alert) => (
                  <LineButton
                    key={alert.id}
                    top={priceToTop(alert.price)}
                    color={alert.hit ? "#ef4444" : "#facc15"}
                    label={alert.hit ? "ALERT HIT" : `ALERT ${alert.side.toUpperCase()}`}
                    value={alert.price}
                    dashed
                    hit={alert.hit}
                    onMouseDown={() => setDragTarget({ type: "alert", alertId: alert.id })}
                    onClick={() => openLineEditor({ type: "alert", alertId: alert.id })}
                    onDelete={() => deleteAlert(alert.id)}
                  />
                ))}

                {orders.map((order) => (
                  <div key={order.id}>
                    <LineButton
                      top={priceToTop(order.entry)}
                      color={order.side === "LONG" ? "#22c55e" : "#ef4444"}
                      label={`${order.side} ENTRY #${String(order.id).slice(-4)}`}
                      value={order.entry}
                      dashed
                      onMouseDown={() => {
                        setSelectedOrderId(order.id);
                        setDragTarget({ type: "entry", orderId: order.id });
                      }}
                      onClick={() => {
                        setSelectedOrderId(order.id);
                        openLineEditor({ type: "entry", orderId: order.id });
                      }}
                      onDelete={() => deleteOrder(order.id)}
                    />

                    <LineButton
                      top={priceToTop(order.sl)}
                      color="#ef4444"
                      label="SL"
                      value={order.sl}
                      dashed
                      onMouseDown={() => {
                        setSelectedOrderId(order.id);
                        setDragTarget({ type: "sl", orderId: order.id });
                      }}
                      onClick={() => {
                        setSelectedOrderId(order.id);
                        openLineEditor({ type: "sl", orderId: order.id });
                      }}
                      onDelete={() => deleteOrder(order.id)}
                    />

                    {order.tps.map((tp) => (
                      <LineButton
                        key={tp.id}
                        top={priceToTop(tp.price)}
                        color={tp.hit ? "#ef4444" : "#22c55e"}
                        label={`${tp.label} • ${tp.closePct}%`}
                        value={tp.price}
                        hit={tp.hit}
                        onMouseDown={() => {
                          setSelectedOrderId(order.id);
                          setDragTarget({ type: "tp", orderId: order.id, tpId: tp.id });
                        }}
                        onClick={() => {
                          setSelectedOrderId(order.id);
                          openLineEditor({ type: "tp", orderId: order.id, tpId: tp.id });
                        }}
                        onDelete={() => deleteTP(order.id, tp.id)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {!hideUI && (
            <aside className="space-y-4 min-w-0">
              <div className={`${card} p-5`}>
                <h2 className="text-sm text-gray-400 font-semibold mb-3">AI Signal Console</h2>
                <p className="text-3xl font-black text-green-400">WAITING</p>

                <div className="mt-5">
                  <div className="flex justify-between text-xs text-gray-500 mb-2">
                    <span>Confidence</span>
                    <span>{confidence}%</span>
                  </div>
                  <div className="h-3 rounded-full bg-black border border-zinc-800 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-yellow-700 to-yellow-400" style={{ width: `${confidence}%` }} />
                  </div>
                </div>

                <p className="text-xs text-gray-600 mt-4">Engine armed. Waiting for confirmed Wolvrene structure.</p>
              </div>

              <div className={`${card} p-5`}>
                <h2 className="text-sm text-gray-400 font-semibold mb-3">Position Manager</h2>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={() => createOrder("LONG")}
                    className="h-10 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 font-bold hover:bg-green-500/25"
                  >
                    Open Long
                  </button>
                  <button
                    onClick={() => createOrder("SHORT")}
                    className="h-10 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 font-bold hover:bg-red-500/25"
                  >
                    Open Short
                  </button>
                </div>

                {selectedOrder ? (
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Selected</span>
                      <span className={selectedOrder.side === "LONG" ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                        {selectedOrder.side} #{String(selectedOrder.id).slice(-4)}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-gray-500">Entry</span>
                      <span>{formatPrice(selectedOrder.entry)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-gray-500">SL</span>
                      <span>{formatPrice(selectedOrder.sl)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-gray-500">Risk</span>
                      <span className="text-yellow-400">{riskPct(selectedOrder.side, selectedOrder.entry, selectedOrder.sl).toFixed(2)}%</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={selectedOrder.size}
                        onChange={(e) => updateOrder(selectedOrder.id, { size: Number(e.target.value) })}
                        className="bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs"
                        placeholder="Size"
                      />
                      <input
                        type="number"
                        value={selectedOrder.leverage}
                        onChange={(e) => updateOrder(selectedOrder.id, { leverage: Number(e.target.value) })}
                        className="bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs"
                        placeholder="Leverage"
                      />
                    </div>

                    <button
                      onClick={() => addTP(selectedOrder.id)}
                      className="w-full h-9 rounded-xl bg-black border border-zinc-800 text-xs hover:border-yellow-700"
                    >
                      Add TP
                    </button>

                    <button
                      onClick={() => deleteOrder(selectedOrder.id)}
                      className="w-full h-9 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-400"
                    >
                      Delete Selected Order
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No selected order.</p>
                )}
              </div>

              <div className={`${card} p-5`}>
                <h2 className="text-sm text-gray-400 font-semibold mb-3">Orders List</h2>
                <div className="space-y-2 max-h-48 overflow-auto pr-1">
                  {orders.length === 0 && <p className="text-sm text-gray-500">No orders yet.</p>}

                  {orders.map((order) => (
                    <button
                      key={order.id}
                      onClick={() => setSelectedOrderId(order.id)}
                      className={`w-full text-left rounded-xl border p-3 transition ${
                        selectedOrderId === order.id ? "border-yellow-600 bg-black/80" : "border-zinc-800 bg-black/40"
                      }`}
                    >
                      <div className="flex justify-between">
                        <span className={order.side === "LONG" ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                          {order.side}
                        </span>
                        <span className="text-xs text-gray-500">#{String(order.id).slice(-4)}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Entry {formatPrice(order.entry)}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className={`${card} p-5`}>
                <h2 className="text-sm text-gray-400 font-semibold mb-3">Active Alerts</h2>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={() => addAlert(undefined, "above")}
                    className="rounded-xl border border-zinc-800 bg-black p-3 text-xs hover:border-yellow-700"
                  >
                    Alert Above
                  </button>
                  <button
                    onClick={() => addAlert(undefined, "below")}
                    className="rounded-xl border border-zinc-800 bg-black p-3 text-xs hover:border-yellow-700"
                  >
                    Alert Below
                  </button>
                </div>

                <div className="space-y-2 max-h-40 overflow-auto pr-1">
                  {alerts.length === 0 && <p className="text-sm text-gray-500">No alerts.</p>}

                  {alerts.map((alert) => (
                    <div key={alert.id} className="rounded-xl border border-zinc-800 bg-black/40 p-3">
                      <div className="flex justify-between items-center">
                        <span className={alert.hit ? "text-red-400 text-xs font-bold" : "text-yellow-400 text-xs font-bold"}>
                          {alert.hit ? "HIT" : alert.side.toUpperCase()}
                        </span>
                        <button onClick={() => deleteAlert(alert.id)} className="text-xs text-gray-500 hover:text-red-400">
                          Delete
                        </button>
                      </div>
                      <p className="text-sm mt-1">{formatPrice(alert.price)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`${card} p-5`}>
                <h2 className="text-sm text-gray-400 font-semibold mb-3">Command Center</h2>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button onClick={() => setHideUI(true)} className="rounded-xl border border-zinc-800 bg-black p-3 hover:border-yellow-700">
                    Hide UI
                  </button>
                  <button onClick={resetDashboard} className="rounded-xl border border-zinc-800 bg-black p-3 hover:border-yellow-700">
                    Reset
                  </button>
                  <button onClick={() => setJournalOpen(true)} className="rounded-xl border border-zinc-800 bg-black p-3 hover:border-yellow-700">
                    Journal
                  </button>
                  <button onClick={() => setAlertsOpen(true)} className="rounded-xl border border-zinc-800 bg-black p-3 hover:border-yellow-700">
                    Alerts
                  </button>
                </div>
              </div>
            </aside>
          )}
        </div>

        {contextMenu.open && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="fixed z-[60] w-52 rounded-xl border border-zinc-700 bg-[#111116] p-2 shadow-2xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <p className="px-3 py-2 text-xs text-gray-500">Price: {formatPrice(contextMenu.price)}</p>

            <button onClick={() => addAlert(contextMenu.price, "above")} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-zinc-800">
              Alert Above
            </button>

            <button onClick={() => addAlert(contextMenu.price, "below")} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-zinc-800">
              Alert Below
            </button>

            <button onClick={() => createOrder("LONG", contextMenu.price)} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-zinc-800">
              Long Limit Here
            </button>

            <button onClick={() => createOrder("SHORT", contextMenu.price)} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-zinc-800">
              Short Limit Here
            </button>

            <button
              onClick={() => {
                navigator.clipboard?.writeText(contextMenu.price.toFixed(2));
                setContextMenu({ open: false, x: 0, y: 0, price: 0 });
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-zinc-800"
            >
              Copy Price
            </button>

            <button onClick={resetDashboard} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-zinc-800">
              Reset Chart
            </button>

            <button
              onClick={() => {
                setSettingsOpen(true);
                setContextMenu({ open: false, x: 0, y: 0, price: 0 });
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-zinc-800"
            >
              Chart Settings
            </button>
          </div>
        )}

        {hideUI && (
          <button
            onClick={() => setHideUI(false)}
            className="fixed bottom-5 right-5 z-40 rounded-xl border border-yellow-700 bg-black px-4 py-3 text-yellow-400 shadow-xl"
          >
            Show UI
          </button>
        )}

        {lineEditor && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[#151519] border border-[#303038] rounded-2xl w-full max-w-md p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold">
                  {lineEditor.type === "tp"
                    ? "Take Profit Control"
                    : lineEditor.type === "sl"
                    ? "Stop Loss Control"
                    : lineEditor.type === "entry"
                    ? "Entry Control"
                    : "Alert Control"}
                </h2>
                <button onClick={() => setLineEditor(null)} className="text-2xl text-gray-400 hover:text-white">
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="text-xs text-gray-500">Price</span>
                  <input
                    type="number"
                    value={Number(editorCurrentPrice.toFixed(2))}
                    onChange={(e) => {
                      const price = Number(e.target.value);

                      if (!lineEditor) return;

                      if (lineEditor.type === "alert") updateAlert(lineEditor.alertId, { price, hit: false });
                      if (lineEditor.type === "entry" && editorOrderValue) updateOrder(editorOrderValue.id, { entry: price });
                      if (lineEditor.type === "sl" && editorOrderValue) updateOrder(editorOrderValue.id, { sl: price });
                      if (lineEditor.type === "tp" && editorOrderValue && editorTPValue) {
                        updateTP(editorOrderValue.id, editorTPValue.id, { price });
                      }
                    }}
                    className="w-full mt-1 bg-black border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-yellow-700"
                  />
                </label>

                {lineEditor.type === "tp" && editorOrderValue && editorTPValue && (
                  <>
                    <div className="rounded-xl bg-black/70 border border-zinc-800 p-4">
                      <div className="flex justify-between text-xs text-gray-500 mb-2">
                        <span>Close Size</span>
                        <span>{editorTPValue.closePct}%</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={editorTPValue.closePct}
                        onChange={(e) => updateTP(editorOrderValue.id, editorTPValue.id, { closePct: Number(e.target.value) })}
                        className="w-full"
                      />

                      <div className="grid grid-cols-4 gap-2 mt-3">
                        {[25, 50, 75, 100].map((pct) => (
                          <button
                            key={pct}
                            onClick={() => updateTP(editorOrderValue.id, editorTPValue.id, { closePct: pct })}
                            className="rounded-lg bg-zinc-800 py-2 text-xs hover:bg-zinc-700"
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl bg-black/70 border border-zinc-800 p-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Profit</span>
                        <span className="text-green-400">
                          {profitPct(editorOrderValue.side, editorOrderValue.entry, editorTPValue.price).toFixed(2)}%
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        deleteTP(editorOrderValue.id, editorTPValue.id);
                        setLineEditor(null);
                      }}
                      className="w-full rounded-xl bg-red-500/15 border border-red-500/30 py-3 text-sm font-bold text-red-400 hover:bg-red-500/25"
                    >
                      Delete This TP
                    </button>
                  </>
                )}

                {lineEditor.type === "sl" && editorOrderValue && (
                  <div className="rounded-xl bg-black/70 border border-zinc-800 p-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Risk</span>
                      <span className="text-red-400">
                        {riskPct(editorOrderValue.side, editorOrderValue.entry, editorOrderValue.sl).toFixed(2)}%
                      </span>
                    </div>

                    <button
                      onClick={() => updateOrder(editorOrderValue.id, { sl: editorOrderValue.entry })}
                      className="w-full mt-4 rounded-xl bg-zinc-800 py-2 text-xs hover:bg-zinc-700"
                    >
                      Move SL to Breakeven
                    </button>
                  </div>
                )}

                {lineEditor.type === "alert" && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => updateAlert(lineEditor.alertId, { side: "above", hit: false })}
                      className="rounded-xl bg-zinc-800 py-3 text-sm hover:bg-zinc-700"
                    >
                      Above
                    </button>
                    <button
                      onClick={() => updateAlert(lineEditor.alertId, { side: "below", hit: false })}
                      className="rounded-xl bg-zinc-800 py-3 text-sm hover:bg-zinc-700"
                    >
                      Below
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setLineEditor(null)}
                  className="w-full rounded-xl py-3 font-bold text-black"
                  style={{ backgroundColor: gold }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {journalOpen && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[#151519] border border-[#303038] rounded-2xl w-full max-w-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-2xl font-bold">Wolvrene Journal</h2>
                <button onClick={() => setJournalOpen(false)} className="text-2xl text-gray-400 hover:text-white">
                  ×
                </button>
              </div>

              <textarea
                value={journalNote}
                onChange={(e) => setJournalNote(e.target.value)}
                placeholder="Write market note, trade idea, or signal observation..."
                className="w-full h-28 bg-black border border-zinc-800 rounded-xl p-4 text-sm outline-none focus:border-yellow-700"
              />

              <div className="flex gap-3 mt-3">
                <button onClick={saveJournalNote} className="px-5 py-3 rounded-xl text-black font-bold" style={{ backgroundColor: gold }}>
                  Save Note
                </button>
                <button onClick={clearJournal} className="px-5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700">
                  Clear
                </button>
              </div>

              <div className="mt-5 space-y-3 max-h-72 overflow-auto">
                {journalEntries.length === 0 && <p className="text-sm text-gray-500">No journal entries yet.</p>}

                {journalEntries.map((entry) => (
                  <div key={entry.id} className="bg-black/70 border border-zinc-800 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-2">{entry.time}</p>
                    <p className="text-sm text-gray-200">{entry.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {alertsOpen && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[#151519] border border-[#303038] rounded-2xl w-full max-w-xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-2xl font-bold">Price Alerts</h2>
                <button onClick={() => setAlertsOpen(false)} className="text-2xl text-gray-400 hover:text-white">
                  ×
                </button>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => addAlert(undefined, "above")}
                    className="rounded-xl border border-yellow-700 bg-black p-3 text-sm hover:bg-zinc-900"
                  >
                    New Above
                  </button>
                  <button
                    onClick={() => addAlert(undefined, "below")}
                    className="rounded-xl border border-yellow-700 bg-black p-3 text-sm hover:bg-zinc-900"
                  >
                    New Below
                  </button>
                </div>

                <div className="space-y-2 max-h-80 overflow-auto">
                  {alerts.length === 0 && <p className="text-sm text-gray-500">No alerts.</p>}

                  {alerts.map((alert) => (
                    <div key={alert.id} className="rounded-xl bg-black border border-zinc-800 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={alert.hit ? "text-red-400 text-sm font-bold" : "text-yellow-400 text-sm font-bold"}>
                            {alert.hit ? "HIT" : alert.side.toUpperCase()}
                          </p>
                          <p className="text-sm">{formatPrice(alert.price)}</p>
                        </div>

                        <div className="flex gap-2">
                          <button onClick={() => openLineEditor({ type: "alert", alertId: alert.id })} className="text-xs text-gray-400 hover:text-white">
                            Edit
                          </button>
                          <button onClick={() => deleteAlert(alert.id)} className="text-xs text-red-400">
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={alert.enabled}
                            onChange={(e) => updateAlert(alert.id, { enabled: e.target.checked })}
                          />
                          Enabled
                        </label>

                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={alert.sound}
                            onChange={(e) => updateAlert(alert.id, { sound: e.target.checked })}
                          />
                          Sound
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={beep} className="px-5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700">
                  Test Sound
                </button>
              </div>
            </div>
          </div>
        )}

        {settingsOpen && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[#151519] border border-[#303038] rounded-2xl w-full max-w-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Chart Settings</h2>
                <button onClick={() => setSettingsOpen(false)} className="text-2xl text-gray-400 hover:text-white">
                  ×
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {[
                  ["Bull Candle", "bullColor"],
                  ["Bear Candle", "bearColor"],
                  ["Background", "backgroundColor"],
                  ["Text", "textColor"],
                  ["Grid Color", "gridColor"],
                ].map(([label, key]) => (
                  <label key={key} className="flex items-center justify-between bg-black/70 border border-zinc-800 p-4 rounded-xl">
                    <span className="text-sm text-gray-300">{label}</span>
                    <input
                      type="color"
                      value={settings[key as keyof ChartSettings] as string}
                      onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                    />
                  </label>
                ))}

                <label className="flex items-center justify-between bg-black/70 border border-zinc-800 p-4 rounded-xl">
                  <span className="text-sm text-gray-300">Show Grid</span>
                  <input
                    type="checkbox"
                    checked={settings.showGrid}
                    onChange={(e) => setSettings({ ...settings, showGrid: e.target.checked })}
                    className="w-5 h-5"
                  />
                </label>
              </div>

              <div className="flex justify-between mt-8">
                <button onClick={() => setSettings(defaultSettings)} className="bg-zinc-800 px-5 py-3 rounded-xl hover:bg-zinc-700">
                  Reset Default
                </button>
                <button onClick={() => setSettingsOpen(false)} className="px-6 py-3 rounded-xl font-bold text-black" style={{ backgroundColor: gold }}>
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
