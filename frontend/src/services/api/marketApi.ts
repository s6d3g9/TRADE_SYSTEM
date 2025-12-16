import { http } from '../httpClient'

export type PairInfo = {
  pair: string
  last?: number
  change24hPct?: number
  volume24hQuote?: number
  spread?: number
}

export async function listPairs(): Promise<PairInfo[]> {
  // TODO: backend endpoint: GET /market/pairs
  return http<PairInfo[]>('/market/pairs')
}
