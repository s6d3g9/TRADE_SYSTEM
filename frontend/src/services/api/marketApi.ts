import { http } from '../httpClient'

export type PairInfo = {
  pair: string
  last?: number
  change24hPct?: number
  volume24hQuote?: number
  spread?: number
  exchanges?: string[]
  symbols?: Record<string, string>
  kinds?: Array<'perp' | 'spot'>
}

export async function listPairs(): Promise<PairInfo[]> {
  return http<PairInfo[]>('/market/pairs')
}

export type Candle = {
  ts: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export async function getCandles(params: {
  exchange: string
  pair: string
  timeframe: string
  limit?: number
}): Promise<{ exchange: string; pair: string; timeframe: string; candles: Candle[] }> {
  const search = new URLSearchParams({
    exchange: params.exchange,
    pair: params.pair,
    timeframe: params.timeframe,
  })
  if (params.limit) search.set('limit', String(params.limit))
  return http(`/market/candles?${search.toString()}`)
}

export async function getAggregateCandles(params: {
  exchanges: string[]
  pair: string
  timeframe: string
  limit?: number
}): Promise<{ exchanges: string[]; pair: string; timeframe: string; candles: Candle[] }> {
  const search = new URLSearchParams({
    exchanges: params.exchanges.join(','),
    pair: params.pair,
    timeframe: params.timeframe,
  })
  if (params.limit) search.set('limit', String(params.limit))
  return http(`/market/candles/aggregate?${search.toString()}`)
}
