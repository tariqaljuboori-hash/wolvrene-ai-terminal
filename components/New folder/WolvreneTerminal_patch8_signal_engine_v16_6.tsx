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


type AIMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  time: string;
};

type AITab = "chat" | "insights" | "trade" | "context";

type SignalState =
  | "WAITING"
  | "WATCH_LONG"
  | "WATCH_SHORT"
  | "CONFIRMED_LONG"
  | "CONFIRMED_SHORT"
  | "NO_TRADE";

type RiskState = "LOW" | "CONTROLLED" | "ELEVATED" | "HIGH" | "NO_TRADE";

type SignalPlan = {
  state: SignalState;
  display: string;
  direction: "LONG" | "SHORT" | "WAIT";
  confidence: number;
  risk: RiskState;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  reason: string;
  warning: string;
  colorClass: string;
};

function parseMarketNumber(value: string) {
  const parsed = Number(String(value || "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export default function WolvreneTerminal() {
  const [timeframe, setTimeframe] = useState("5m");
  const [settings, setSettings] = useState<ChartSettings>(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [hideUI, setHideUI] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTab, setAiTab] = useState<AITab>("chat");
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([
    {
      id: 1,
      role: "assistant",
      time: "Ready",
      text: "WOLVRENE REAL AI BRIDGE armed. I can read the current dashboard context, open orders, active alerts, session, bias, timeframe, TP/SL, and answer through the /api/ai bridge when your OpenAI key is connected.",
    },
  ]);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiBridgeStatus, setAiBridgeStatus] = useState<"ready" | "connected" | "missing_key" | "error">("ready");

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

  const [orderSide, setOrderSide] = useState<Exclude<Direction, null>>("LONG");
  const [marginMode, setMarginMode] = useState<"isolated" | "cross">("isolated");
  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [draftPrice, setDraftPrice] = useState("");
  const [draftSize, setDraftSize] = useState("0.01");
  const [draftLeverage, setDraftLeverage] = useState("5");

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
  const aiScrollRef = useRef<HTMLDivElement>(null);
  const aiMessagesEndRef = useRef<HTMLDivElement>(null);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || orders[0] || null,
    [orders, selectedOrderId]
  );

  const currentMark = livePrice || lastCandleRef.current?.close || 0;

  const signalEngine = useMemo<SignalPlan>(() => {
    const mark = livePrice || lastCandleRef.current?.close || 0;
    const high24 = parseMarketNumber(marketStats.high);
    const low24 = parseMarketNumber(marketStats.low);
    const change24 = parseMarketNumber(marketStats.change);
    const funding = parseMarketNumber(marketStats.funding);
    const activeOrders = orders.filter((order) => order.status !== "CLOSED").length;
    const activeAlerts = alerts.filter((alert) => alert.enabled && !alert.hit).length;

    if (!mark) {
      return {
        state: "WAITING",
        display: "WAITING",
        direction: "WAIT",
        confidence: 35,
        risk: "ELEVATED",
        entry: null,
        sl: null,
        tp1: null,
        tp2: null,
        tp3: null,
        reason: "Waiting for live Bitget price before generating an execution-grade signal.",
        warning: "No trade until live price and candles are loaded.",
        colorClass: "text-yellow-400",
      };
    }

    let score = 45;
    const reasons: string[] = [];
    const warnings: string[] = [];
    const isNY = session.includes("New York");
    const isLondon = session.includes("London");
    const isAsia = session.includes("Asia") || session.includes("Sydney");

    if (bias === "BULLISH") { score += 15; reasons.push("bullish candle structure"); }
    if (bias === "BEARISH") { score += 15; reasons.push("bearish candle structure"); }
    if (bias === "NEUTRAL") { score -= 12; warnings.push("structure is still neutral"); }

    if (isNY || isLondon) { score += 10; reasons.push(isNY ? "New York execution window" : "London expansion window"); }
    if (isAsia) { score -= 4; warnings.push("Asia/Sydney can build liquidity before expansion"); }

    if (Math.abs(change24) >= 1.2) { score += 8; reasons.push("24H momentum is active"); }
    if (Math.abs(change24) >= 4.5) { score -= 10; warnings.push("24H move is extended; chasing risk is higher"); }

    const range24 = high24 && low24 ? high24 - low24 : 0;
    const positionInRange = range24 ? (mark - low24) / range24 : 0.5;
    if (range24 && (positionInRange > 0.88 || positionInRange < 0.12)) {
      score -= 8;
      warnings.push("price is near 24H extreme");
    }

    if (Math.abs(funding) > 0.035) {
      score -= 5;
      warnings.push("funding is elevated");
    }

    if (activeOrders > 0) {
      score -= 4;
      warnings.push("active simulated position exists; manage exposure first");
    }

    if (activeAlerts > 0) {
      score += 2;
    }

    const confidenceValue = clampScore(score);
    const side: "LONG" | "SHORT" | "WAIT" = bias === "BULLISH" ? "LONG" : bias === "BEARISH" ? "SHORT" : "WAIT";

    let state: SignalState = "WAITING";
    if (side === "WAIT" || confidenceValue < 45) state = confidenceValue < 38 ? "NO_TRADE" : "WAITING";
    if (side === "LONG" && confidenceValue >= 50) state = confidenceValue >= 72 ? "CONFIRMED_LONG" : "WATCH_LONG";
    if (side === "SHORT" && confidenceValue >= 50) state = confidenceValue >= 72 ? "CONFIRMED_SHORT" : "WATCH_SHORT";

    const risk: RiskState =
      state === "NO_TRADE"
        ? "NO_TRADE"
        : confidenceValue >= 75
        ? "LOW"
        : confidenceValue >= 62
        ? "CONTROLLED"
        : confidenceValue >= 48
        ? "ELEVATED"
        : "HIGH";

    const atrProxy = Math.max(mark * 0.0035, range24 ? range24 * 0.08 : mark * 0.004);
    const entry = side === "LONG" ? mark - atrProxy * 0.18 : side === "SHORT" ? mark + atrProxy * 0.18 : null;
    const sl = side === "LONG" ? mark - atrProxy * 1.05 : side === "SHORT" ? mark + atrProxy * 1.05 : null;
    const tp1 = side === "LONG" ? mark + atrProxy * 0.85 : side === "SHORT" ? mark - atrProxy * 0.85 : null;
    const tp2 = side === "LONG" ? mark + atrProxy * 1.55 : side === "SHORT" ? mark - atrProxy * 1.55 : null;
    const tp3 = side === "LONG" ? mark + atrProxy * 2.25 : side === "SHORT" ? mark - atrProxy * 2.25 : null;

    const display = state.replace("_", " ");
    const colorClass =
      state.includes("LONG")
        ? "text-green-400"
        : state.includes("SHORT")
        ? "text-red-400"
        : state === "NO_TRADE"
        ? "text-orange-400"
        : "text-yellow-400";

    return {
      state,
      display,
      direction: side,
      confidence: confidenceValue,
      risk,
      entry,
      sl,
      tp1,
      tp2,
      tp3,
      reason: reasons.length ? reasons.join(" · ") : "No clean confirmation yet.",
      warning: warnings.length ? warnings.join(" · ") : "Wait for confirmation before execution.",
      colorClass,
    };
  }, [livePrice, marketStats, session, bias, orders, alerts, timeframe]);

  const confidence = signalEngine.confidence;
  const executionPrice = Number(draftPrice) || currentMark || 0;
  const executionSize = Number(draftSize) || 0;
  const executionLeverage = Math.max(1, Number(draftLeverage) || 1);
  const estimatedMargin = executionPrice && executionSize ? (executionPrice * executionSize) / executionLeverage : 0;
  const estimatedNotional = executionPrice && executionSize ? executionPrice * executionSize : 0;

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

  useEffect(() => {
    if (livePrice && !draftPrice) setDraftPrice(livePrice.toFixed(2));
  }, [livePrice, draftPrice]);

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
    try {
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
    } catch (error) {
      console.warn("WOLVRENE candle reload failed", error);
    }
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
    if (!side) return;

    const price = basePrice || (orderType === "limit" ? Number(draftPrice) : livePrice) || livePrice || lastCandleRef.current?.close;
    if (!price) return;

    const size = Math.max(0.0001, Number(draftSize) || 0.01);
    const leverage = Math.max(1, Number(draftLeverage) || 1);

    const order = {
      ...createOrderFromPrice(side, price),
      size,
      leverage,
    } as TradeOrder;

    setOrders((prev) => [order, ...prev]);
    setSelectedOrderId(order.id);
    addJournal(`${side} ${orderType.toUpperCase()} order created at ${formatPrice(price)} — ${size} BTC / ${leverage}x / ${marginMode.toUpperCase()}`);
  }

  function updateOrder(orderId: number, patch: Partial<TradeOrder>) {
    setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, ...patch } : order)));
  }

  function orderPnL(order: TradeOrder) {
    const mark = livePrice || order.entry;
    const size = Number(order.size) || 0;
    const diff = order.side === "LONG" ? mark - order.entry : order.entry - mark;
    return diff * size;
  }

  function orderRoi(order: TradeOrder) {
    const size = Number(order.size) || 0;
    const leverage = Math.max(1, Number(order.leverage) || 1);
    const margin = order.entry && size ? (order.entry * size) / leverage : 0;
    return margin ? (orderPnL(order) / margin) * 100 : 0;
  }

  function estimatedLiquidation(order: TradeOrder) {
    const leverage = Math.max(1, Number(order.leverage) || 1);
    const buffer = 0.9 / leverage;
    return order.side === "LONG" ? order.entry * (1 - buffer) : order.entry * (1 + buffer);
  }


  function positionMargin(order: TradeOrder) {
    const size = Number(order.size) || 0;
    const leverage = Math.max(1, Number(order.leverage) || 1);
    return order.entry && size ? (order.entry * size) / leverage : 0;
  }

  function breakevenPrice(order: TradeOrder) {
    return order.entry;
  }

  function closeOrder(orderId: number) {
    setOrders((prev) => prev.filter((order) => order.id !== orderId));
    if (selectedOrderId === orderId) setSelectedOrderId(null);
    addJournal(`Position #${String(orderId).slice(-4)} closed`);
  }

  function closePartial(orderId: number, percent: number) {
    setOrders((prev) =>
      prev.flatMap((order) => {
        if (order.id !== orderId) return [order];
        const currentSize = Number(order.size) || 0;
        const closeSize = currentSize * (percent / 100);
        const nextSize = Math.max(0, currentSize - closeSize);
        addJournal(`Closed ${percent}% of ${order.side} #${String(order.id).slice(-4)}`);
        if (nextSize <= 0.000001 || percent >= 100) return [];
        return [{ ...order, size: Number(nextSize.toFixed(6)) }];
      })
    );
  }

  function reverseOrder(order: TradeOrder) {
    const price = livePrice || order.entry;
    const oppositeSide: Exclude<Direction, null> = order.side === "LONG" ? "SHORT" : "LONG";
    const reversedOrder = {
      ...createOrderFromPrice(oppositeSide, price),
      size: Number(order.size) || 0.01,
      leverage: Number(order.leverage) || 1,
    } as TradeOrder;
    setOrders((prev) => [reversedOrder, ...prev.filter((item) => item.id !== order.id)]);
    setSelectedOrderId(reversedOrder.id);
    addJournal(`Reversed #${String(order.id).slice(-4)} into ${oppositeSide}`);
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

  const aiContext = useMemo(() => {
    const mark = livePrice || lastCandleRef.current?.close || 0;
    const activeOrders = orders.filter((order) => order.status !== "CLOSED");
    const selected = selectedOrder;

    return {
      symbol: "BTCUSDT",
      timeframe,
      mark,
      session,
      sessionCountdown,
      bias,
      wolfMode,
      confidence,
      signalEngine,
      marketStats,
      activeOrders,
      alerts,
      selected,
    };
  }, [livePrice, timeframe, session, sessionCountdown, bias, wolfMode, confidence, marketStats, orders, alerts, selectedOrder]);

  const aiInsights = useMemo(() => {
    const notes: string[] = [];
    const mark = aiContext.mark;
    const selected = aiContext.selected;

    if (!mark) notes.push("Waiting for live Bitget tick before producing execution-grade insight.");
    if (bias === "BULLISH") notes.push("Bias is bullish. Prefer long ideas only after clean confirmation or a controlled pullback.");
    if (bias === "BEARISH") notes.push("Bias is bearish. Avoid chasing longs unless structure flips with strength.");
    if (bias === "NEUTRAL") notes.push("Bias is neutral. Best action is patience until structure becomes cleaner.");
    if (confidence < 50) notes.push("Confidence is below 50%. This is a watch-only environment, not an execution zone.");
    if (confidence >= 60) notes.push("Confidence is improving. Wait for trigger confirmation before entering.");
    if (selected && mark) {
      const pnl = orderPnL(selected);
      const roi = orderRoi(selected);
      notes.push(`Selected ${selected.side} #${String(selected.id).slice(-4)} is ${pnl >= 0 ? "green" : "red"}: ${pnl.toFixed(2)} USDT / ${roi.toFixed(2)}% ROI.`);
      if (selected.tps.some((tp) => tp.hit)) notes.push("One or more TP levels are marked hit. Consider reducing exposure or protecting breakeven.");
    }
    if (alerts.some((alert) => alert.hit)) notes.push("There are hit alerts on the chart. Clean them or review why they triggered.");
    if (orders.length === 0) notes.push("No open simulated positions. AI can focus on market read and setup planning.");

    return notes.slice(0, 6);
  }, [aiContext, bias, confidence, selectedOrder, alerts, orders, livePrice]);

  function buildAIContextPayload() {
    const mark = livePrice || lastCandleRef.current?.close || 0;
    const selected = selectedOrder || null;

    return {
      symbol: "BTCUSDT",
      product: "Bitget USDT-FUTURES",
      timeframe,
      livePrice: mark,
      session,
      sessionCountdown,
      bias,
      wolfMode,
      confidence,
      signalEngine,
      marketStats,
      draftOrder: {
        side: orderSide,
        marginMode,
        orderType,
        price: Number(draftPrice) || mark,
        size: Number(draftSize) || 0,
        leverage: Number(draftLeverage) || 1,
        estimatedNotional,
        estimatedMargin,
      },
      selectedOrder: selected
        ? {
            id: selected.id,
            side: selected.side,
            entry: selected.entry,
            sl: selected.sl,
            size: Number(selected.size) || 0,
            leverage: Number(selected.leverage) || 1,
            pnl: orderPnL(selected),
            roi: orderRoi(selected),
            margin: positionMargin(selected),
            estimatedLiquidation: estimatedLiquidation(selected),
            tps: selected.tps.map((tp) => ({
              id: tp.id,
              label: tp.label,
              price: tp.price,
              closePct: tp.closePct,
              hit: tp.hit,
            })),
          }
        : null,
      orders: orders
        .filter((order) => order.status !== "CLOSED")
        .map((order) => ({
          id: order.id,
          side: order.side,
          entry: order.entry,
          sl: order.sl,
          size: Number(order.size) || 0,
          leverage: Number(order.leverage) || 1,
          pnl: orderPnL(order),
          roi: orderRoi(order),
          tps: order.tps.map((tp) => ({
            label: tp.label,
            price: tp.price,
            closePct: tp.closePct,
            hit: tp.hit,
          })),
        })),
      alerts: alerts.map((alert) => ({
        id: alert.id,
        price: alert.price,
        side: alert.side,
        enabled: alert.enabled,
        hit: alert.hit,
      })),
      localInsights: aiInsights,
      timestamp: new Date().toISOString(),
    };
  }

  function buildAIResponse(question: string) {
    const q = question.toLowerCase();
    const mark = aiContext.mark;
    const selected = aiContext.selected;
    const activeOrders = aiContext.activeOrders.length;
    const activeAlerts = aiContext.alerts.filter((alert) => alert.enabled && !alert.hit).length;

    const header = `WOLVRENE LIVE BRAIN\nBTCUSDT ${timeframe} · ${session} · Bias ${bias} · Confidence ${confidence}% · Orders ${activeOrders} · Alerts ${activeAlerts}`;

    if (!mark) {
      return `${header}\n\nLive price is not confirmed yet. Wait until Bitget tick is live before trusting entries, TP/SL, or risk numbers.`;
    }

    if (q.includes("entry") || q.includes("دخول") || q.includes("long") || q.includes("short")) {
      const direction = bias === "BULLISH" ? "LONG" : bias === "BEARISH" ? "SHORT" : "WAIT";
      return `${header}\n\nExecution read: ${direction}.\nCurrent mark: ${formatPrice(mark)}.\nBest action: ${direction === "WAIT" ? "wait for structure clarity" : "wait for confirmation, then use controlled risk"}.\nRisk note: do not chase the candle. Let price confirm around the entry line or reclaim/reject the level first.`;
    }

    if (q.includes("manage") || q.includes("trade") || q.includes("صفقة") || q.includes("ادير")) {
      if (!selected) return `${header}\n\nNo selected position. Open or select an order first, then I can evaluate PnL, SL distance, TP progress, and risk control.`;
      return `${header}\n\nSelected ${selected.side} #${String(selected.id).slice(-4)}\nEntry: ${formatPrice(selected.entry)}\nMark: ${formatPrice(mark)}\nPnL: ${orderPnL(selected).toFixed(2)} USDT\nROI: ${orderRoi(selected).toFixed(2)}%\nSL: ${formatPrice(selected.sl)}\nTPs: ${selected.tps.length} active\n\nManagement: if TP1 is near or hit, protect the trade. If structure weakens before TP1, reduce exposure instead of hoping.`;
    }

    if (q.includes("risk") || q.includes("خطر") || q.includes("safe") || q.includes("امان")) {
      const riskLabel = confidence >= 65 ? "CONTROLLED" : confidence >= 50 ? "ELEVATED" : "HIGH / WAIT";
      return `${header}\n\nRisk level: ${riskLabel}.\nActive orders: ${activeOrders}. Active alerts: ${activeAlerts}.\nRule: if confidence is below 50%, no forced entry. If volatility expands suddenly, reduce size or wait.`;
    }

    if (q.includes("session") || q.includes("جلسة")) {
      return `${header}\n\nSession read: ${session}. Next phase: ${sessionCountdown}.\nUse the session as timing filter: Asia often builds liquidity, London expands, New York executes or reverses. Do not treat every candle the same across sessions.`;
    }

    return `${header}\n\nAI read: ${aiInsights[0] || "Waiting for cleaner context."}\n\nCurrent mark: ${formatPrice(mark)}.\nActive orders: ${activeOrders}. Alerts: ${activeAlerts}.\nNext action: wait for a clean trigger, then manage risk through Entry / SL / TP lines.`;
  }

  async function sendAIMessage(text?: string) {
    const question = (text || aiInput).trim();
    if (!question || aiThinking) return;

    const now = new Date().toLocaleTimeString();
    const userMessage: AIMessage = { id: Date.now(), role: "user", text: question, time: now };

    setAiMessages((prev) => [...prev, userMessage].slice(-40));
    setAiInput("");
    setAiOpen(true);
    setAiTab("chat");
    setAiThinking(true);

    try {
      const payload = {
        question,
        context: buildAIContextPayload(),
        messages: aiMessages.slice(-10),
      };

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || `AI route failed with ${res.status}`);
      }

      const answer =
        typeof data?.answer === "string" && data.answer.trim()
          ? data.answer.trim()
          : buildAIResponse(question);

      setAiBridgeStatus(data?.mode === "missing_key" ? "missing_key" : "connected");
      setAiMessages((prev) =>
        [
          ...prev,
          {
            id: Date.now() + 1,
            role: "assistant",
            text: answer,
            time: new Date().toLocaleTimeString(),
          },
        ].slice(-40)
      );
    } catch (error) {
      setAiBridgeStatus("error");
      const fallback = `${buildAIResponse(question)}\n\n[Bridge note] Real AI route is not responding yet. Check app/api/ai/route.ts and OPENAI_API_KEY in .env.local.`;
      setAiMessages((prev) =>
        [
          ...prev,
          {
            id: Date.now() + 1,
            role: "assistant",
            text: fallback,
            time: new Date().toLocaleTimeString(),
          },
        ].slice(-40)
      );
    } finally {
      setAiThinking(false);
    }
  }

  function runAIQuickAction(action: "analyze" | "entry" | "risk" | "manage" | "session") {
    const prompts = {
      analyze: "Analyze BTC now using the current dashboard context.",
      entry: "Where is the best entry and what should I wait for?",
      risk: "Is this market safe or dangerous right now?",
      manage: "Manage my selected trade and tell me what to do next.",
      session: "Give me the current session outlook.",
    };

    sendAIMessage(prompts[action]);
  }

  useEffect(() => {
    if (!aiOpen || aiTab !== "chat") return;
    requestAnimationFrame(() => {
      aiMessagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, [aiMessages, aiThinking, aiOpen, aiTab]);

  useEffect(() => {
    if (!aiOpen) return;

    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, [aiOpen]);


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
      width: Math.max(chartRef.current.clientWidth || 0, 320),
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

    requestAnimationFrame(() => {
      if (!chartAliveRef.current || !chartRef.current || !chartApiRef.current) return;
      chartApiRef.current.applyOptions({ width: Math.max(chartRef.current.clientWidth || 0, 320), height: fullscreen ? 720 : 520 });
      chartApiRef.current.timeScale().fitContent();
    });

    const resizeObserver = new ResizeObserver(() => {
      if (!chartAliveRef.current || !chartRef.current || !chartApiRef.current) return;
      requestAnimationFrame(() => {
        if (!chartAliveRef.current || !chartRef.current || !chartApiRef.current) return;
        chartApiRef.current.applyOptions({ width: Math.max(chartRef.current.clientWidth || 0, 320), height: fullscreen ? 720 : 520 });
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
    let fallbackTimer: NodeJS.Timeout | null = null;
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

    const handleLivePrice = (price: number) => {
      if (!Number.isFinite(price) || price <= 0) return;

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

    const fetchTickerFallback = async () => {
      try {
        const res = await fetch(
          "https://api.bitget.com/api/v2/mix/market/ticker?symbol=BTCUSDT&productType=USDT-FUTURES",
          { cache: "no-store" }
        );
        const data = await res.json();
        const rawPrice = data?.data?.[0]?.lastPr || data?.data?.lastPr;
        if (rawPrice) handleLivePrice(Number(rawPrice));
      } catch (error) {
        console.warn("WOLVRENE ticker fallback failed", error);
      }
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

        let msg: any;
        try { msg = JSON.parse(event.data); } catch { return; }
        const lastPriceRaw = msg?.data?.[0]?.lastPr;
        if (!lastPriceRaw) return;

        const price = Number(lastPriceRaw);
        handleLivePrice(price);
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
    fetchTickerFallback();
    reloadCandles();
    fallbackTimer = setInterval(() => {
      fetchTickerFallback();
      if (!lastCandleRef.current) reloadCandles();
    }, 2000);

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
      if (fallbackTimer) clearInterval(fallbackTimer);
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
            <p className="text-gray-500 text-xs tracking-wide">BTC AI Dashboard v16.6 — Patch 8 Signal Engine Core</p>
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
                <div ref={chartRef} className="w-full min-w-0 h-[520px]" />

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

            {orders.length > 0 && (
              <div className={`${card} mt-4 overflow-hidden`}>
                <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-md bg-zinc-800 px-2 py-1 font-bold text-white">Detailed</span>
                    <span className="rounded-md bg-black px-2 py-1 text-gray-400">Lite</span>
                    <span className="rounded-md bg-black px-2 py-1 text-gray-400">Filter: All</span>
                  </div>
                  <button onClick={() => setOrders([])} className="rounded-lg bg-black px-3 py-1.5 text-[11px] text-gray-300 border border-zinc-800 hover:border-red-500 hover:text-red-400">
                    Close all
                  </button>
                </div>

                <div className="max-h-[360px] overflow-auto">
                  {orders.map((order) => {
                    const mark = livePrice || order.entry;
                    const pnl = orderPnL(order);
                    const roi = orderRoi(order);
                    const size = Number(order.size) || 0;
                    const leverage = Math.max(1, Number(order.leverage) || 1);
                    const sideColor = order.side === "LONG" ? "text-green-400" : "text-red-400";
                    const pnlColor = pnl >= 0 ? "text-green-400" : "text-red-400";

                    return (
                      <div
                        key={order.id}
                        onClick={() => setSelectedOrderId(order.id)}
                        className={`border-b border-zinc-900 p-4 transition ${
                          selectedOrderId === order.id ? "bg-yellow-500/[0.035]" : "bg-black/20 hover:bg-white/[0.025]"
                        }`}
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="h-4 w-4 rounded-full bg-orange-500 text-[10px] font-black text-black flex items-center justify-center">₿</span>
                            <span className={`text-sm font-black ${sideColor}`}>
                              BTCUSDT · Isolated · {order.side} · {leverage}x
                            </span>
                            <span className="text-xs text-gray-500">#{String(order.id).slice(-4)}</span>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              closeOrder(order.id);
                            }}
                            className="text-xs text-gray-500 hover:text-red-400"
                          >
                            Close
                          </button>
                        </div>

                        <div className="grid gap-4 text-xs md:grid-cols-4">
                          <div className="space-y-2">
                            <div>
                              <p className="text-gray-500">Position</p>
                              <p className="font-bold">{size.toFixed(4)} BTC</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Unrealized PnL</p>
                              <p className={`font-bold ${pnlColor}`}>{pnl.toFixed(4)} USDT / {roi.toFixed(2)}%</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Est. liquidation price</p>
                              <p className="font-bold text-orange-400">{formatPrice(estimatedLiquidation(order))}</p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div>
                              <p className="text-gray-500">Entry price</p>
                              <p className="font-bold">{formatPrice(order.entry)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Mark price</p>
                              <p className="font-bold">{formatPrice(mark)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Margin</p>
                              <p className="font-bold">{positionMargin(order).toFixed(4)} USDT</p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div>
                              <p className="text-gray-500">Margin Rate</p>
                              <p className="font-bold">{(100 / leverage).toFixed(2)}%</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Breakeven price</p>
                              <p className="font-bold">{formatPrice(breakevenPrice(order))}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">TP / SL</p>
                              <p className="font-bold text-gray-300">{order.tps.length} TP / SL active</p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <label>
                                <span className="text-gray-500">Close price</span>
                                <input
                                  value={formatPrice(mark)}
                                  readOnly
                                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-[#1f1f24] px-2 py-2 text-xs outline-none"
                                />
                              </label>
                              <label>
                                <span className="text-gray-500">Close quantity</span>
                                <input
                                  type="number"
                                  value={size}
                                  onChange={(e) => updateOrder(order.id, { size: Number(e.target.value) })}
                                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-[#1f1f24] px-2 py-2 text-xs outline-none focus:border-yellow-700"
                                />
                              </label>
                            </div>

                            <div className="grid grid-cols-4 gap-2">
                              <button onClick={(e) => { e.stopPropagation(); closePartial(order.id, 100); }} className="rounded-lg bg-white px-2 py-2 text-xs font-bold text-black hover:bg-gray-200">Close</button>
                              <button onClick={(e) => { e.stopPropagation(); closePartial(order.id, 100); }} className="rounded-lg bg-zinc-800 px-2 py-2 text-xs font-bold hover:bg-zinc-700">Flash</button>
                              <button onClick={(e) => { e.stopPropagation(); reverseOrder(order); }} className="rounded-lg bg-zinc-800 px-2 py-2 text-xs font-bold hover:bg-zinc-700">Reverse</button>
                              <button onClick={(e) => { e.stopPropagation(); if (order.tps[0]) openLineEditor({ type: "tp", orderId: order.id, tpId: order.tps[0].id }); else addTP(order.id); }} className="rounded-lg bg-zinc-800 px-2 py-2 text-xs font-bold hover:bg-zinc-700">TP/SL</button>
                            </div>

                            <div className="grid grid-cols-4 gap-1">
                              {[25, 50, 75, 100].map((pct) => (
                                <button
                                  key={pct}
                                  onClick={(e) => { e.stopPropagation(); closePartial(order.id, pct); }}
                                  className="rounded-md border border-zinc-800 bg-black py-1 text-[10px] text-gray-400 hover:border-yellow-700 hover:text-yellow-400"
                                >
                                  {pct}%
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {!hideUI && (
            <aside className="space-y-4 min-w-0">
              <div className={`${card} p-5`}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm text-gray-400 font-semibold">AI Signal Console</h2>
                  <span className="text-[10px] px-2 py-1 rounded-full border border-yellow-600/40 text-yellow-500 bg-yellow-500/10">V16.6</span>
                </div>
                <p className={`text-3xl font-black ${signalEngine.colorClass}`}>{signalEngine.display}</p>
                <p className="text-[11px] text-gray-500 mt-1">Direction: {signalEngine.direction} · Risk: {signalEngine.risk}</p>

                <div className="mt-5">
                  <div className="flex justify-between text-xs text-gray-500 mb-2">
                    <span>Signal Confidence</span>
                    <span>{confidence}%</span>
                  </div>
                  <div className="h-3 rounded-full bg-black border border-zinc-800 overflow-hidden">
                    <div
                      className={`h-full ${signalEngine.state.includes("LONG") ? "bg-gradient-to-r from-green-900 to-green-400" : signalEngine.state.includes("SHORT") ? "bg-gradient-to-r from-red-900 to-red-400" : "bg-gradient-to-r from-yellow-700 to-yellow-400"}`}
                      style={{ width: `${confidence}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-zinc-800 bg-black/55 p-3 text-xs space-y-2">
                  <div className="flex justify-between"><span className="text-gray-500">Entry</span><span>{signalEngine.entry ? formatPrice(signalEngine.entry) : "WAIT"}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">SL</span><span className="text-red-400">{signalEngine.sl ? formatPrice(signalEngine.sl) : "--"}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">TP1</span><span className="text-green-400">{signalEngine.tp1 ? formatPrice(signalEngine.tp1) : "--"}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">TP2</span><span className="text-green-400">{signalEngine.tp2 ? formatPrice(signalEngine.tp2) : "--"}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">TP3</span><span className="text-green-400">{signalEngine.tp3 ? formatPrice(signalEngine.tp3) : "--"}</span></div>
                </div>

                <p className="text-xs text-gray-500 mt-4">Reason: {signalEngine.reason}</p>
                <p className="text-xs text-orange-400/80 mt-2">Warning: {signalEngine.warning}</p>

                <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                  <button onClick={() => { setAiOpen(true); setAiTab("chat"); }} className="rounded-xl border border-yellow-700/50 bg-yellow-500/10 p-3 text-yellow-400 hover:bg-yellow-500/20">
                    Open AI
                  </button>
                  <button onClick={() => runAIQuickAction("analyze")} className="rounded-xl border border-zinc-800 bg-black p-3 hover:border-yellow-700">
                    Analyze Now
                  </button>
                </div>
              </div>

              <div className={`${card} p-5`}> 
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm text-gray-400 font-semibold">Trade Panel</h2>
                  <span className="text-[10px] text-yellow-500">{marginMode.toUpperCase()} / {executionLeverage}x</span>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  <button
                    onClick={() => setMarginMode("isolated")}
                    className={`h-8 rounded-lg text-xs font-bold border ${marginMode === "isolated" ? "bg-zinc-700 border-zinc-500 text-white" : "bg-black border-zinc-800 text-gray-400"}`}
                  >
                    Isolated
                  </button>
                  <button
                    onClick={() => setMarginMode("cross")}
                    className={`h-8 rounded-lg text-xs font-bold border ${marginMode === "cross" ? "bg-zinc-700 border-zinc-500 text-white" : "bg-black border-zinc-800 text-gray-400"}`}
                  >
                    Cross
                  </button>
                  <div className="h-8 rounded-lg bg-black border border-zinc-800 text-xs flex items-center justify-center text-gray-400">
                    Sim
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={() => setOrderType("limit")}
                    className={`h-8 rounded-lg text-xs font-bold border ${orderType === "limit" ? "bg-yellow-600 border-yellow-500 text-black" : "bg-black border-zinc-800 text-gray-400"}`}
                  >
                    Limit
                  </button>
                  <button
                    onClick={() => setOrderType("market")}
                    className={`h-8 rounded-lg text-xs font-bold border ${orderType === "market" ? "bg-yellow-600 border-yellow-500 text-black" : "bg-black border-zinc-800 text-gray-400"}`}
                  >
                    Market
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={() => setOrderSide("LONG")}
                    className={`h-9 rounded-xl border font-bold ${orderSide === "LONG" ? "bg-green-500/20 border-green-500/50 text-green-400" : "bg-black border-zinc-800 text-gray-400"}`}
                  >
                    LONG
                  </button>
                  <button
                    onClick={() => setOrderSide("SHORT")}
                    className={`h-9 rounded-xl border font-bold ${orderSide === "SHORT" ? "bg-red-500/20 border-red-500/50 text-red-400" : "bg-black border-zinc-800 text-gray-400"}`}
                  >
                    SHORT
                  </button>
                </div>

                <div className="space-y-2 mb-3">
                  <label className="block">
                    <span className="text-[11px] text-gray-500">Price USDT</span>
                    <div className="flex gap-2 mt-1">
                      <input
                        type="number"
                        value={draftPrice}
                        onChange={(e) => setDraftPrice(e.target.value)}
                        className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs outline-none focus:border-yellow-700"
                      />
                      <button
                        onClick={() => livePrice && setDraftPrice(livePrice.toFixed(2))}
                        className="px-3 rounded-xl bg-zinc-800 text-[11px] hover:bg-zinc-700"
                      >
                        BBO
                      </button>
                    </div>
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[11px] text-gray-500">Size BTC</span>
                      <input
                        type="number"
                        value={draftSize}
                        onChange={(e) => setDraftSize(e.target.value)}
                        className="w-full mt-1 bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs outline-none focus:border-yellow-700"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] text-gray-500">Leverage</span>
                      <input
                        type="number"
                        min="1"
                        max="125"
                        value={draftLeverage}
                        onChange={(e) => setDraftLeverage(e.target.value)}
                        className="w-full mt-1 bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs outline-none focus:border-yellow-700"
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-xl bg-black/60 border border-zinc-800 p-3 mb-3 text-xs space-y-2">
                  <div className="flex justify-between"><span className="text-gray-500">Notional</span><span>{estimatedNotional.toFixed(2)} USDT</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Required Margin</span><span className="text-yellow-400">{estimatedMargin.toFixed(4)} USDT</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Mode</span><span>{marginMode === "isolated" ? "Isolated" : "Cross"}</span></div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
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
                  <div className="space-y-3 text-sm border-t border-zinc-800 pt-4">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Selected</span>
                      <span className={selectedOrder.side === "LONG" ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                        {selectedOrder.side} #{String(selectedOrder.id).slice(-4)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl bg-black/60 border border-zinc-800 p-3">
                        <p className="text-gray-500">Entry</p>
                        <p className="font-bold">{formatPrice(selectedOrder.entry)}</p>
                      </div>
                      <div className="rounded-xl bg-black/60 border border-zinc-800 p-3">
                        <p className="text-gray-500">Mark</p>
                        <p className="font-bold">{formatPrice(livePrice || selectedOrder.entry)}</p>
                      </div>
                      <div className="rounded-xl bg-black/60 border border-zinc-800 p-3">
                        <p className="text-gray-500">PnL / ROI</p>
                        <p className={orderPnL(selectedOrder) >= 0 ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                          {orderPnL(selectedOrder).toFixed(4)} / {orderRoi(selectedOrder).toFixed(2)}%
                        </p>
                      </div>
                      <div className="rounded-xl bg-black/60 border border-zinc-800 p-3">
                        <p className="text-gray-500">Liq. Est.</p>
                        <p className="text-orange-400 font-bold">{formatPrice(estimatedLiquidation(selectedOrder))}</p>
                      </div>
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

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => addTP(selectedOrder.id)}
                        className="w-full h-9 rounded-xl bg-black border border-zinc-800 text-xs hover:border-yellow-700"
                      >
                        Add TP
                      </button>
                      <button
                        onClick={() => createOrder(selectedOrder.side === "LONG" ? "SHORT" : "LONG", livePrice || selectedOrder.entry)}
                        className="w-full h-9 rounded-xl bg-black border border-zinc-800 text-xs hover:border-yellow-700"
                      >
                        Reverse
                      </button>
                    </div>

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
                  <button onClick={() => { setAiOpen(true); setAiTab("chat"); }} className="rounded-xl border border-yellow-700/50 bg-yellow-500/10 p-3 text-yellow-400 hover:bg-yellow-500/20">
                    AI Command
                  </button>
                  <button onClick={() => setAlertsOpen(true)} className="rounded-xl border border-zinc-800 bg-black p-3 hover:border-yellow-700">
                    Alerts
                  </button>
                </div>
              </div>
            </aside>
          )}
        </div>

        {aiOpen && (
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-hidden overscroll-none"
            onWheel={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onTouchMove={(e) => e.stopPropagation()}
          >
            <div
              className="bg-[#111116] border border-[#302817] rounded-2xl w-full max-w-6xl h-[88vh] max-h-[88vh] overflow-hidden shadow-[0_0_55px_rgba(216,155,0,0.22)]"
              onWheel={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
                <div>
                  <h2 className="text-2xl font-black tracking-wide" style={{ color: gold, textShadow: "0 0 14px rgba(216,155,0,0.45)" }}>
                    WOLVRENE AI COMMAND — REAL BRIDGE v16.5
                  </h2>
                  <p className="text-xs text-gray-500">Real AI bridge · {timeframe} · {session} · {bias} · Orders {orders.length} · Alerts {alerts.length}</p>
                </div>
                <button onClick={() => setAiOpen(false)} className="text-2xl text-gray-400 hover:text-white">×</button>
              </div>

              <div
                className="grid lg:grid-cols-[minmax(0,1fr)_330px] h-[calc(88vh-73px)] overflow-hidden min-h-0"
                onWheel={(e) => e.stopPropagation()}
              >
                <div className="min-w-0 flex flex-col min-h-0 overflow-hidden">
                  <div className="flex gap-2 border-b border-zinc-800 p-3 text-xs overflow-x-auto">
                    {[
                      ["chat", "Chat"],
                      ["insights", "Insights"],
                      ["trade", "Trade Help"],
                      ["context", "Live Context"],
                    ].map(([tab, label]) => (
                      <button
                        key={tab}
                        onClick={() => setAiTab(tab as AITab)}
                        className={`rounded-xl px-4 py-2 border whitespace-nowrap ${
                          aiTab === tab ? "bg-yellow-600 border-yellow-500 text-black font-black" : "bg-black border-zinc-800 text-gray-400 hover:border-yellow-700"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div
                    ref={aiScrollRef}
                    onWheel={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.scrollTop += e.deltaY;
                    }}
                    onTouchMove={(e) => e.stopPropagation()}
                    className="h-full min-h-0 overflow-y-scroll overscroll-contain p-4 scroll-smooth"
                    style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
                  >
                    {aiTab === "chat" && (
                      <div className="space-y-3">
                        {aiMessages.map((message) => (
                          <div key={message.id} className={`rounded-2xl border p-4 ${message.role === "assistant" ? "bg-black/70 border-yellow-700/25" : "bg-zinc-900 border-zinc-800"}`}>
                            <div className="flex justify-between text-[10px] uppercase tracking-wider text-gray-500 mb-2">
                              <span>{message.role === "assistant" ? "Wolvrene AI" : "You"}</span>
                              <span>{message.time}</span>
                            </div>
                            <p className="whitespace-pre-line text-sm leading-6 text-gray-200">{message.text}</p>
                          </div>
                        ))}

                        {aiThinking && (
                          <div className="rounded-2xl border border-yellow-700/40 bg-yellow-500/5 p-4">
                            <div className="flex items-center gap-3">
                              <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
                              <p className="text-sm text-yellow-400 font-bold">WOLVRENE AI is thinking with live dashboard context...</p>
                            </div>
                            <p className="mt-2 text-xs text-gray-500">Sending price, timeframe, session, orders, alerts, TP/SL, bias, confidence, and selected trade to the AI bridge.</p>
                          </div>
                        )}

                        <div ref={aiMessagesEndRef} />
                      </div>
                    )}

                    {aiTab === "insights" && (
                      <div className="space-y-3">
                        {aiInsights.map((note, index) => (
                          <div key={index} className="rounded-2xl border border-zinc-800 bg-black/70 p-4">
                            <p className="text-xs text-yellow-500 mb-2">Insight #{index + 1}</p>
                            <p className="text-sm text-gray-200">{note}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {aiTab === "trade" && (
                      <div className="space-y-3">
                        {selectedOrder ? (
                          <div className="rounded-2xl border border-zinc-800 bg-black/70 p-4 text-sm space-y-2">
                            <div className="flex justify-between"><span className="text-gray-500">Selected</span><span className={selectedOrder.side === "LONG" ? "text-green-400 font-bold" : "text-red-400 font-bold"}>{selectedOrder.side} #{String(selectedOrder.id).slice(-4)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Entry</span><span>{formatPrice(selectedOrder.entry)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Mark</span><span>{formatPrice(livePrice || selectedOrder.entry)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">PnL / ROI</span><span className={orderPnL(selectedOrder) >= 0 ? "text-green-400" : "text-red-400"}>{orderPnL(selectedOrder).toFixed(2)} / {orderRoi(selectedOrder).toFixed(2)}%</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">SL</span><span>{formatPrice(selectedOrder.sl)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">TPs</span><span>{selectedOrder.tps.length}</span></div>
                            <button onClick={() => runAIQuickAction("manage")} className="mt-3 w-full rounded-xl bg-yellow-600 py-3 text-black font-black">Analyze Selected Trade</button>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-zinc-800 bg-black/70 p-4 text-sm text-gray-400">No selected trade. Open or select an order first.</div>
                        )}
                      </div>
                    )}

                    {aiTab === "context" && (
                      <div className="space-y-3">
                        <div className="rounded-2xl border border-yellow-700/25 bg-yellow-500/5 p-4">
                          <p className="text-xs text-yellow-500 mb-3 font-bold">LIVE CONTEXT SNAPSHOT</p>
                          <div className="grid md:grid-cols-2 gap-3 text-sm">
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Symbol</span><span>BTCUSDT</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Timeframe</span><span>{timeframe}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Live Price</span><span>{aiContext.mark ? formatPrice(aiContext.mark) : "Waiting"}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Session</span><span>{session}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Bias</span><span>{bias}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Confidence</span><span>{confidence}%</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Orders</span><span>{orders.length}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Alerts</span><span>{alerts.length}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">Funding</span><span>{marketStats.funding}</span></div>
                            <div className="flex justify-between rounded-xl bg-black/60 border border-zinc-800 p-3"><span className="text-gray-500">24H Change</span><span>{marketStats.change}</span></div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-zinc-800 bg-black/70 p-4 text-sm">
                          <p className="text-xs text-gray-500 mb-2">Selected Trade Context</p>
                          {selectedOrder ? (
                            <div className="space-y-2">
                              <div className="flex justify-between"><span className="text-gray-500">Side</span><span className={selectedOrder.side === "LONG" ? "text-green-400" : "text-red-400"}>{selectedOrder.side}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Entry</span><span>{formatPrice(selectedOrder.entry)}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">SL</span><span>{formatPrice(selectedOrder.sl)}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">TP Count</span><span>{selectedOrder.tps.length}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">PnL / ROI</span><span className={orderPnL(selectedOrder) >= 0 ? "text-green-400" : "text-red-400"}>{orderPnL(selectedOrder).toFixed(2)} / {orderRoi(selectedOrder).toFixed(2)}%</span></div>
                            </div>
                          ) : (
                            <p className="text-gray-400">No selected order. AI will analyze market context only.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-zinc-800 p-3">
                    <div className="flex gap-2">
                      <input
                        value={aiInput}
                        onChange={(e) => setAiInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !aiThinking) sendAIMessage(); }}
                        placeholder="Ask Wolvrene AI about this market, trade, risk, or entry..."
                        disabled={aiThinking}
                        className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm outline-none focus:border-yellow-700 disabled:opacity-60"
                      />
                      <button disabled={aiThinking} onClick={() => sendAIMessage()} className="rounded-xl bg-yellow-600 px-5 py-3 text-sm font-black text-black hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60">{aiThinking ? "Thinking" : "Send"}</button>
                    </div>
                  </div>
                </div>

                <div className="border-l border-zinc-800 bg-black/35 p-4 space-y-3 overflow-y-auto overscroll-contain">
                  <h3 className="text-sm font-bold text-gray-300">Quick Actions</h3>
                  {[
                    ["analyze", "Analyze BTC Now"],
                    ["entry", "Best Entry?"],
                    ["risk", "Risk Check"],
                    ["manage", "Manage Trade"],
                    ["session", "Session Outlook"],
                  ].map(([action, label]) => (
                    <button
                      key={action}
                      onClick={() => runAIQuickAction(action as "analyze" | "entry" | "risk" | "manage" | "session")}
                      className="w-full rounded-xl border border-zinc-800 bg-[#09090b] p-3 text-left text-sm hover:border-yellow-700 hover:text-yellow-400"
                    >
                      {label}
                    </button>
                  ))}

                  <div className="rounded-2xl border border-yellow-700/25 bg-yellow-500/5 p-4">
                    <p className="text-xs text-yellow-500 mb-2">AI Bridge Status: {aiBridgeStatus.toUpperCase()}</p>
                    <p className="text-xs leading-5 text-gray-400">Patch 7 / v16.4: Real AI Bridge. The window now calls /api/ai, sends live dashboard context, shows thinking state, and keeps chat scroll working. Add OPENAI_API_KEY in .env.local for real model replies.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

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
