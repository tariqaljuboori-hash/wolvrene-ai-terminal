export const nowMs=()=>Date.now(); export const isStale=(ts:number,maxAgeMs=45000)=>Date.now()-ts>maxAgeMs;
