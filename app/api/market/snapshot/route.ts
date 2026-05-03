/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';import { getMarketSnapshot } from '@/lib/market/marketSnapshot';
export async function GET(req:NextRequest){const q=req.nextUrl.searchParams;const data=await getMarketSnapshot({exchange:(q.get('exchange') as any)||'bitget',symbol:q.get('symbol')||'BTCUSDT',interval:q.get('interval')||'15m',limit:Number(q.get('limit')||300),includeProfessionalProviders:q.get('providers')==='true'});return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}})}
