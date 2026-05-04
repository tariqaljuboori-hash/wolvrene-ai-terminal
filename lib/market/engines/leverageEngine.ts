import type { FundingData, LiquidationMap, LongShortData, OpenInterestData } from "../types";
export const classifyFunding=(r:number|null):FundingData['bias']=>r==null?'UNKNOWN':r>0.0003?'CROWDED_LONGS':r<-0.0003?'CROWDED_SHORTS':'NEUTRAL';
export const classifyOpenInterest=(c:number|null,p:number|null):OpenInterestData['bias']=>c==null||p==null||p===0?'UNKNOWN':((c-p)/Math.abs(p))*100>1.5?'POSITIONS_ENTERING':((c-p)/Math.abs(p))*100<-1.5?'POSITIONS_CLOSING':'NEUTRAL';
export const classifyLongShort=(_r:number|null,l:number|null,s:number|null):LongShortData['bias']=>l==null||s==null?'UNKNOWN':l>60?'LONGS_CROWDED':s>60?'SHORTS_CROWDED':'NEUTRAL';
export const classifyLiquidationPressure=(m:LiquidationMap,p:number|null)=>{ void m; void p; return 'UNKNOWN' as const; };
