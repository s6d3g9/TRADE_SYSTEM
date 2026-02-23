import { http } from '../httpClient'

export type StoreItem = {
  item_id: string
  item_type: 'strategy' | 'model'
  slug: string
  name: string
  description?: string | null
  tags: string[]
  meta: Record<string, unknown>
  price_cents: number
  currency: string
  is_active: boolean
  purchaser_count: number
  purchased: boolean
}

export type StoreItemDetail = StoreItem & {
  purchasers: Array<{ user_id: string; email?: string | null; name?: string | null; purchased_at: string }>
  latest_backtests: Array<Record<string, unknown>>
}

export async function listStoreItems(item_type?: 'strategy' | 'model'): Promise<StoreItem[]> {
  const qs = item_type ? `?item_type=${encodeURIComponent(item_type)}` : ''
  return http<StoreItem[]>(`/store/items${qs}`)
}

export async function getStoreItem(item_id: string): Promise<StoreItemDetail> {
  return http<StoreItemDetail>(`/store/items/${encodeURIComponent(item_id)}`)
}

export async function purchaseStoreItem(item_id: string): Promise<{ ok: boolean; item_id: string; purchased_at: string }> {
  return http<{ ok: boolean; item_id: string; purchased_at: string }>(`/store/items/${encodeURIComponent(item_id)}/purchase`, {
    method: 'POST',
  })
}
