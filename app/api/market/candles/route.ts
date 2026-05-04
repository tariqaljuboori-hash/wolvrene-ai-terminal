/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';import { getMarketSnapshot } from '@/lib/market/marketSnapshot';
export async function GET(req:NextRequest){const q=req.nextUrl.searchParams;const snap=await getMarketSnapshot({exchange:(q.get('exchange') as any)||'bitget',symbol:q.get('symbol')||'BTCUSDT',interval:q.get('interval')||'15m',limit:Number(q.get('limit')||300)});return NextResponse.json({candles:snap.candles},{headers:{'Cache-Control':'no-store'}})}
