import { http } from '../httpClient'

export type Watchlist = { id: string; name: string; pairs: string[] }

export async function listWatchlists(): Promise<Watchlist[]> {
  // TODO: backend endpoint
  return http<Watchlist[]>('/watchlists')
}
