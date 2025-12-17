import { http } from '../httpClient'

export type StrategyTemplate = {
  strategy_id: string
  slug: string
  name: string
  source_type: string
  source_url: string
  source_ref?: string | null
  strategy_class?: string | null
  description?: string | null
  tags: string[]
  meta: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export type FreqAIModelVariant = {
  model_id: string
  slug: string
  name: string
  algorithm: string
  config: Record<string, unknown>
  description?: string | null
  tags: string[]
  created_at?: string
  updated_at?: string
}

export type StrategyAlignment = {
  alignment_id: string
  strategy_id: string
  model_id: string
  profile?: string | null
  scope?: Record<string, unknown> | null
  defaults?: Record<string, unknown> | null
  mapping?: Record<string, unknown> | null
  freqtrade_overrides: Record<string, unknown>
  freqai_overrides: Record<string, unknown>
  status: string
  created_at?: string
  updated_at?: string
}

export async function listStrategyTemplates(): Promise<StrategyTemplate[]> {
  return http<StrategyTemplate[]>('/strategylab/strategies')
}

export async function createStrategyTemplate(p: Omit<StrategyTemplate, 'strategy_id'>): Promise<StrategyTemplate> {
  return http<StrategyTemplate>('/strategylab/strategies', { method: 'POST', body: JSON.stringify(p) })
}

export async function updateStrategyTemplate(p: StrategyTemplate): Promise<StrategyTemplate> {
  return http<StrategyTemplate>(`/strategylab/strategies/${encodeURIComponent(p.strategy_id)}`, {
    method: 'PUT',
    body: JSON.stringify(p),
  })
}

export async function deleteStrategyTemplate(strategy_id: string): Promise<{ deleted: boolean; strategy_id: string }> {
  return http(`/strategylab/strategies/${encodeURIComponent(strategy_id)}`, { method: 'DELETE' })
}

export async function listFreqAIModelVariants(): Promise<FreqAIModelVariant[]> {
  return http<FreqAIModelVariant[]>('/strategylab/models')
}

export async function createFreqAIModelVariant(p: Omit<FreqAIModelVariant, 'model_id'>): Promise<FreqAIModelVariant> {
  return http<FreqAIModelVariant>('/strategylab/models', { method: 'POST', body: JSON.stringify(p) })
}

export async function updateFreqAIModelVariant(p: FreqAIModelVariant): Promise<FreqAIModelVariant> {
  return http<FreqAIModelVariant>(`/strategylab/models/${encodeURIComponent(p.model_id)}`, {
    method: 'PUT',
    body: JSON.stringify(p),
  })
}

export async function deleteFreqAIModelVariant(model_id: string): Promise<{ deleted: boolean; model_id: string }> {
  return http(`/strategylab/models/${encodeURIComponent(model_id)}`, { method: 'DELETE' })
}

export async function listStrategyAlignments(): Promise<StrategyAlignment[]> {
  return http<StrategyAlignment[]>('/strategylab/alignments')
}

export async function createStrategyAlignment(p: Omit<StrategyAlignment, 'alignment_id'>): Promise<StrategyAlignment> {
  return http<StrategyAlignment>('/strategylab/alignments', { method: 'POST', body: JSON.stringify(p) })
}

export async function updateStrategyAlignment(p: StrategyAlignment): Promise<StrategyAlignment> {
  return http<StrategyAlignment>(`/strategylab/alignments/${encodeURIComponent(p.alignment_id)}`, {
    method: 'PUT',
    body: JSON.stringify(p),
  })
}

export async function deleteStrategyAlignment(alignment_id: string): Promise<{ deleted: boolean; alignment_id: string }> {
  return http(`/strategylab/alignments/${encodeURIComponent(alignment_id)}`, { method: 'DELETE' })
}

export async function requestAgentAlignment(alignment_id: string): Promise<{ queued: boolean; task_id: string }> {
  return http(`/strategylab/alignments/${encodeURIComponent(alignment_id)}/request-agent`, { method: 'POST' })
}

export async function importStrategiesFromRepo(p: {
  repo_url: string
  ref?: string
  limit?: number
  tag?: string
}): Promise<{ detected: number; imported: StrategyTemplate[]; skipped: Array<{ slug: string; name: string; reason: string }> }> {
  return http(`/strategylab/strategies/import`, { method: 'POST', body: JSON.stringify(p) })
}

export async function exportAlignment(alignment_id: string): Promise<{
  strategy: StrategyTemplate
  model: FreqAIModelVariant
  alignment: StrategyAlignment
  freqtrade: Record<string, unknown>
  freqai: Record<string, unknown>
}> {
  return http(`/strategylab/alignments/${encodeURIComponent(alignment_id)}/export`)
}

export async function getStrategySource(strategy_id: string): Promise<{
  strategy_id: string
  strategy_class?: string | null
  repo_url: string
  ref?: string | null
  path: string
  filename: string
  content: string
}> {
  return http(`/strategylab/strategies/${encodeURIComponent(strategy_id)}/source`)
}

export async function getAlignmentConfigFile(alignment_id: string): Promise<{
  alignment_id: string
  strategy: StrategyTemplate
  model: FreqAIModelVariant
  filename: string
  config: Record<string, unknown>
}> {
  return http(`/strategylab/alignments/${encodeURIComponent(alignment_id)}/config-file`)
}
