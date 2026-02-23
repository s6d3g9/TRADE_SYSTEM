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

export type MarketExchangeInfo = {
  exchange: string
  kinds: Array<'spot' | 'perp'>
}

export async function listExchanges(): Promise<MarketExchangeInfo[]> {
  return http<MarketExchangeInfo[]>('/market/exchanges')
}

export async function listPairs(params?: {
  source?: 'map' | 'discover'
  exchange?: string
  kind?: 'spot' | 'perp'
  quote?: string
  search?: string
  limit?: number
  offset?: number
}): Promise<PairInfo[]> {
  const source = params?.source ?? 'map'
  if (source === 'map') return http<PairInfo[]>('/market/pairs')

  const search = new URLSearchParams({
    source: 'discover',
    exchange: params?.exchange ?? 'binance',
    kind: params?.kind ?? 'spot',
    quote: params?.quote ?? 'USDT',
  })
  if (params?.search) search.set('search', params.search)
  if (params?.limit) search.set('limit', String(params.limit))
  if (params?.offset) search.set('offset', String(params.offset))
  return http<PairInfo[]>(`/market/pairs?${search.toString()}`)
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
