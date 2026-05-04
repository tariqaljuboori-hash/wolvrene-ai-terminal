/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ExchangeId, MarketInterval } from "../types";
export const normalizeInterval=(i:string):MarketInterval=> (["1m","3m","5m","15m","30m","1H","2H","4H","1D"].includes(i)?i:"15m") as MarketInterval;
export const mapInterval=(ex:ExchangeId,i:MarketInterval)=>({binance:{"1H":"1h","2H":"2h","4H":"4h","1D":"1d"},bybit:{"1H":"60","2H":"120","4H":"240","1D":"D"},bitget:{},okx:{"1H":"1Hutc","2H":"2Hutc","4H":"4Hutc","1D":"1Dutc"}} as any)[ex]?.[i]||i;
