import { http } from '../httpClient'

export type CanonicalSignalPair = {
  direction: string
  confidence?: number
  predicted_price_24h?: number
  ai_stop_loss?: number
  position_size?: number
  metadata?: Record<string, unknown>
}

export type CanonicalSignalEnvelope = {
  schema?: string
  provider_id: string
  timestamp: number
  ttl_sec: number
  signals: Record<string, CanonicalSignalPair>
}

export async function ingestSignal(envelope: CanonicalSignalEnvelope): Promise<{ ok: boolean; written: number }> {
  return http('/signals/ingest', { method: 'POST', body: JSON.stringify({ schema: 'th.signal.v1', ...envelope }) })
}

export async function getProviderLastSignals(providerId: string, pairs: string[]): Promise<{
  provider_id: string
  signals: Record<string, unknown>
}> {
  const params = new URLSearchParams({ pairs: pairs.join(',') })
  return http(`/signals/providers/${encodeURIComponent(providerId)}/last?${params.toString()}`)
}
