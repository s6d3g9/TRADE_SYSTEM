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
