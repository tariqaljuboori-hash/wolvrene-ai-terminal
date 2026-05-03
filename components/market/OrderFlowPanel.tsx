import type { OrderFlowData } from '@/lib/market/types';
export function OrderFlowPanel({flow}:{flow:OrderFlowData}){return <div className='text-xs'>Δ {flow.delta ?? 'Unavailable'} · CVD {flow.cvd ?? 'Unavailable'} · {flow.absorption}</div>;}
