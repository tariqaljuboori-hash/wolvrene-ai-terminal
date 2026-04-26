export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type AlertSide = "above" | "below";
export type Direction = "LONG" | "SHORT";
export type OrderStatus = "LIMIT" | "ACTIVE" | "CLOSED";

export type ChartSettings = {
  bullColor: string;
  bearColor: string;
  backgroundColor: string;
  textColor: string;
  gridColor: string;
  showGrid: boolean;
};

export type JournalEntry = {
  id: number;
  time: string;
  note: string;
};

export type PriceAlert = {
  id: number;
  enabled: boolean;
  price: number;
  side: AlertSide;
  sound: boolean;
  hit: boolean;
};

export type TakeProfit = {
  id: number;
  label: string;
  price: number;
  closePct: number;
  hit: boolean;
};

export type TradeOrder = {
  id: number;
  side: Direction;
  status: OrderStatus;
  orderType: "LIMIT" | "MARKET";
  entry: number;
  sl: number;
  tps: TakeProfit[];
  size: number;
  leverage: number;
  notionalUsd?: number;
  marginUsd?: number;
  marginMode?: "isolated" | "cross";
  createdAt: string;
};

export type DecisionLifecycleStage =
  | "SPAWN"
  | "VALIDATE"
  | "EXECUTE"
  | "MANAGE"
  | "EXIT"
  | "CANCEL";

export type DragTarget =
  | { type: "alert"; alertId: number }
  | { type: "entry"; orderId: number }
  | { type: "sl"; orderId: number }
  | { type: "tp"; orderId: number; tpId: number }
  | null;

export type LineEditor =
  | { type: "alert"; alertId: number }
  | { type: "entry"; orderId: number }
  | { type: "sl"; orderId: number }
  | { type: "tp"; orderId: number; tpId: number }
  | null;
