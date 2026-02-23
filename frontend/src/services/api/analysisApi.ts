import { http } from '../httpClient'

export type AnalysisRunCreateRequest = {
  kind?: 'compare' | 'diagnose' | 'tune'
  inputs?: Record<string, unknown>
  enqueue?: boolean
}

export type AnalysisRunOut = {
  run_id: string
  user_id: string
  kind: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  inputs: Record<string, unknown>
  outputs: Record<string, unknown>
  evidence: Record<string, unknown>
  error_message?: string | null
  created_at: string
  updated_at: string
  completed_at?: string | null
}

export type AnalysisRunProgress = {
  run_id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  updated_at: string
  completed_at?: string | null
  error_message?: string | null
  redis_status?: string | null
}

export async function createAnalysisRun(payload?: AnalysisRunCreateRequest): Promise<AnalysisRunOut> {
  return await http<AnalysisRunOut>('/analysis/runs', {
    method: 'POST',
    body: JSON.stringify({
      kind: payload?.kind ?? 'compare',
      inputs: payload?.inputs ?? {},
      enqueue: payload?.enqueue ?? true,
    }),
  })
}

export async function getAnalysisRunProgress(runId: string): Promise<AnalysisRunProgress> {
  return await http<AnalysisRunProgress>(`/analysis/runs/${encodeURIComponent(runId)}/progress`)
}
