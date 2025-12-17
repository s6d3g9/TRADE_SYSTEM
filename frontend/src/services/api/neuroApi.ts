import { http } from '../httpClient'

export type NeuroModule = {
  module_type: string
  title: string
  description: string
  version: string
  vendor?: string
  capabilities: Record<string, unknown>
  provider_config_schema: Record<string, unknown>
  signal_schema_version: string
  status: 'active' | 'deprecated' | 'disabled'
}

export type NeuroProvider = {
  provider_id: string
  name: string
  module_type: string
  connector: 'internal' | 'redis' | 'http' | 'file'
  connector_config: Record<string, unknown>
  scope?: Record<string, unknown>
  defaults?: Record<string, unknown>
  mapping?: Record<string, unknown>
  health_status?: string
  last_seen_ts?: string | null
  errors_5m?: number
  latency_ms_avg?: number | null
  stale_rate_5m?: number
  created_at?: string
  updated_at?: string
}

export async function listNeuroModules(): Promise<NeuroModule[]> {
  return http<NeuroModule[]>('/neuro/modules')
}

export async function listNeuroProviders(): Promise<NeuroProvider[]> {
  return http<NeuroProvider[]>('/neuro/providers')
}

export async function createNeuroProvider(p: NeuroProvider): Promise<NeuroProvider> {
  return http<NeuroProvider>('/neuro/providers', { method: 'POST', body: JSON.stringify(p) })
}

export async function getNeuroProvider(id: string): Promise<NeuroProvider> {
  return http<NeuroProvider>(`/neuro/providers/${encodeURIComponent(id)}`)
}

export async function updateNeuroProvider(p: NeuroProvider): Promise<NeuroProvider> {
  return http<NeuroProvider>(`/neuro/providers/${encodeURIComponent(p.provider_id)}`, {
    method: 'PUT',
    body: JSON.stringify(p),
  })
}

export async function deleteNeuroProvider(id: string): Promise<{ deleted: boolean; provider_id: string }> {
  return http(`/neuro/providers/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function getNeuroProviderHealth(id: string): Promise<{
  provider_id: string
  status: string
  last_seen_ts: string | null
  errors_5m: number
  latency_ms_avg: number | null
  stale_rate_5m: number
}> {
  return http(`/neuro/providers/${encodeURIComponent(id)}/health`)
}
