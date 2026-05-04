export const toNumber=(v:unknown):number|null=>{const n=Number(v);return Number.isFinite(n)?n:null};
export const pctChange=(a:number|null,b:number|null)=>a==null||b==null||b===0?null:((a-b)/Math.abs(b))*100;
export const clampNumber=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
export const distancePct=(price:number|null,level:number|null)=>price==null||level==null||price===0?null:Math.abs((level-price)/price)*100;
