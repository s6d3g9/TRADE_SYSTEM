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

export type ConfigFile = {
  config_id: string
  scope: string
  owner_id: string
  name: string
  content: Record<string, unknown>
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export type AiOverrideRequest = {
  provider?: 'openrouter' | 'openai' | 'local'
  token?: string
  model?: string
}

export async function listStrategyTemplates(params?: { lite?: boolean; limit?: number; offset?: number }): Promise<StrategyTemplate[]> {
  const qp = new URLSearchParams()
  const lite = params?.lite ?? true
  if (lite) qp.set('lite', '1')
  if (typeof params?.limit === 'number') qp.set('limit', String(params.limit))
  if (typeof params?.offset === 'number') qp.set('offset', String(params.offset))
  const query = qp.toString() ? `?${qp.toString()}` : ''
  return http<StrategyTemplate[]>(`/strategylab/strategies${query}`)
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

export async function listConfigs(scope: string, owner_id: string): Promise<ConfigFile[]> {
  const qp = new URLSearchParams({ scope, owner_id }).toString()
  return http<ConfigFile[]>(`/strategylab/configs?${qp}`)
}

export async function createConfig(p: {
  scope: string
  owner_id: string
  name?: string
  content: Record<string, unknown>
  make_active?: boolean
}): Promise<ConfigFile> {
  return http<ConfigFile>('/strategylab/configs', { method: 'POST', body: JSON.stringify(p) })
}

export async function activateConfig(config_id: string): Promise<ConfigFile> {
  return http<ConfigFile>(`/strategylab/configs/${encodeURIComponent(config_id)}/activate`, { method: 'POST' })
}

export async function getConfig(config_id: string): Promise<ConfigFile> {
  return http<ConfigFile>(`/strategylab/configs/${encodeURIComponent(config_id)}`)
}

export async function autotuneAlignment(
  alignment_id: string,
  ai?: AiOverrideRequest,
): Promise<{ config: ConfigFile; source: string }> {
  const init: RequestInit = { method: 'POST' }
  if (ai) init.body = JSON.stringify(ai)
  return http<{ config: ConfigFile; source: string }>(
    `/strategylab/alignments/${encodeURIComponent(alignment_id)}/autotune`,
    init,
  )
}

export async function autotuneAlignmentCombined(
  alignment_id: string,
  ai?: AiOverrideRequest,
): Promise<{ config: ConfigFile; source: string }> {
  const init: RequestInit = { method: 'POST' }
  if (ai) init.body = JSON.stringify(ai)
  return http<{ config: ConfigFile; source: string }>(
    `/strategylab/alignments/${encodeURIComponent(alignment_id)}/autotune/combined`,
    init,
  )
}

export async function autotuneStrategy(
  strategy_id: string,
  ai?: AiOverrideRequest,
): Promise<{ config: ConfigFile; source: string }> {
  const init: RequestInit = { method: 'POST' }
  if (ai) init.body = JSON.stringify(ai)
  return http<{ config: ConfigFile; source: string }>(
    `/strategylab/strategies/${encodeURIComponent(strategy_id)}/autotune`,
    init,
  )
}

export async function autotuneModel(
  model_id: string,
  ai?: AiOverrideRequest,
): Promise<{ config: ConfigFile; source: string }> {
  const init: RequestInit = { method: 'POST' }
  if (ai) init.body = JSON.stringify(ai)
  return http<{ config: ConfigFile; source: string }>(
    `/strategylab/models/${encodeURIComponent(model_id)}/autotune`,
    init,
  )
}

export async function repairAlignmentConfig(
  alignment_id: string,
  ai?: AiOverrideRequest,
): Promise<{ config: ConfigFile; source: string }> {
  const init: RequestInit = { method: 'POST' }
  if (ai) init.body = JSON.stringify(ai)
  return http<{ config: ConfigFile; source: string }>(
    `/strategylab/alignments/${encodeURIComponent(alignment_id)}/autotune/repair`,
    init,
  )
}

export async function generateBotFromAlignment(alignment_id: string): Promise<{ alignment_id: string; config_path: string; bot_id: string; bot_name: string }> {
  return http<{ alignment_id: string; config_path: string; bot_id: string; bot_name: string }>(
    `/strategylab/alignments/${encodeURIComponent(alignment_id)}/generate-bot`,
    { method: 'POST' },
  )
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

export async function getStrategySource(strategy_id: string, repo_path?: string): Promise<{
  strategy_id: string
  strategy_class?: string | null
  repo_url: string
  ref?: string | null
  path: string
  filename: string
  content: string
}> {
  const qp = repo_path ? `?repo_path=${encodeURIComponent(repo_path)}` : ''
  return http(`/strategylab/strategies/${encodeURIComponent(strategy_id)}/source${qp}`)
}

export async function listStrategySources(strategy_id: string): Promise<{
  strategy_id: string
  count: number
  items: Array<{ strategy_class: string; path: string; filename: string }>
}> {
  return http(`/strategylab/strategies/${encodeURIComponent(strategy_id)}/sources`)
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

// =============================================================================
// BACKTEST RESULTS API
// =============================================================================

export type BacktestResult = {
  id: string
  filename: string
  strategy_name: string
  pair: string
  timeframe: string
  total_trades: number
  win_rate: number
  profit_factor: number
  max_drawdown: number
  sharpe_ratio: number
  total_return: number
  avg_trade: number
  period: string
  backtest_start?: string
  backtest_end?: string
  created_at: number
}

export async function listBacktests(params?: {
  limit?: number
  strategy?: string
}): Promise<{
  backtests: BacktestResult[]
  total: number
  path: string
  message?: string
}> {
  const qp = new URLSearchParams()
  if (params?.limit) qp.set('limit', String(params.limit))
  if (params?.strategy) qp.set('strategy', params.strategy)
  const query = qp.toString() ? `?${qp.toString()}` : ''
  return http(`/strategylab/backtests${query}`)
}

export async function getBacktestDetail(backtest_id: string): Promise<{
  id: string
  filename: string
  data: Record<string, unknown>
}> {
  return http(`/strategylab/backtests/${encodeURIComponent(backtest_id)}`)
}
