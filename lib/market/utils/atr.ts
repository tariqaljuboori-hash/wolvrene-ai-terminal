import type { Candle } from "../types";
export const averageRange=(candles:Candle[])=>candles.length?candles.reduce((a,c)=>a+(c.high-c.low),0)/candles.length:null;
export const simpleATR=(candles:Candle[],period=14)=>averageRange(candles.slice(-period));
