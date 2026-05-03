import type { LiquidityLevel } from '@/lib/market/types';
export function LiquidityMapPanel({levels}:{levels:LiquidityLevel[]}){return <div className='text-xs space-y-1'>{levels.slice(0,8).map(l=><div key={l.id}>{l.type}: {l.price.toFixed(2)} ({l.side})</div>)}</div>;}
