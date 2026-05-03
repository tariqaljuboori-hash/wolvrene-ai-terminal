import type { ExchangeId } from "../types";
export const mapSymbol=(ex:ExchangeId,symbol:string)=> ex==="okx"?`${symbol.replace("USDT","-USDT")}-SWAP`:symbol;
export const mapDeribitSymbol=(symbol:string)=> symbol.startsWith("ETH")?"ETH":"BTC";
