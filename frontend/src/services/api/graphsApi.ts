import { http } from '../httpClient'

export type NodeGraphOut = {
  graph_id: string
  user_id: string
  name: string
  description?: string | null
  scope: string
  owner_id?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type NodeGraphVersionOut = {
  version_id: string
  graph_id: string
  version: number
  definition: any
  created_at: string
}

export type NodeGraphRunOut = {
  run_id: string
  graph_id: string
  version_id: string
  user_id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  inputs: any
  outputs: any
  error_message?: string | null
  idempotency_key?: string | null
  created_at: string
  updated_at: string
  completed_at?: string | null
}

export type NodeGraphRunProgressOut = {
  run_id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  updated_at: string
  completed_at?: string | null
  error_message?: string | null
  redis_status?: string | null
}

export type NodeGraphRunNodeOut = {
  run_node_id: string
  run_id: string
  node_id: string
  kind: string
  status: string
  inputs: any
  outputs: any
  error_message?: string | null
  created_at: string
  started_at?: string | null
  updated_at: string
  completed_at?: string | null
}

export type NodeGraphRunNodeTimingOut = {
  node_id: string
  kind: string
  status: string
  duration_ms?: number | null
}

export type NodeGraphRunExecutionStatsOut = {
  total_nodes: number
  status_counts: Record<string, number>
  run_duration_ms?: number | null
}

export type NodeGraphRunExecutionOut = {
  run: NodeGraphRunOut
  nodes: NodeGraphRunNodeOut[]
  stats?: NodeGraphRunExecutionStatsOut | null
  timings: NodeGraphRunNodeTimingOut[]
}

export type NodeKindCapabilitiesOut = {
  side_effects: boolean
  idempotent: boolean
  long_running: boolean
}

export type NodeKindMetaOut = {
  kind: string
  label: string
  category: string
  description?: string | null
  hidden?: boolean
  inputs: string[]
  outputs: string[]
  capabilities: NodeKindCapabilitiesOut
}

export type NodeKindMetaListOut = {
  items: NodeKindMetaOut[]
  total: number
}

export type NodeGraphRunNodeListOut = {
  items: NodeGraphRunNodeOut[]
  total: number
}

export async function createGraph(payload: {
  name: string
  description?: string
  scope?: 'user' | 'bot' | 'strategy' | 'model' | 'alignment'
  owner_id?: string | null
  is_active?: boolean
}): Promise<NodeGraphOut> {
  return await http<NodeGraphOut>('/graphs', { method: 'POST', body: JSON.stringify(payload) })
}

export async function createGraphVersion(graphId: string, definition: any): Promise<NodeGraphVersionOut> {
  return await http<NodeGraphVersionOut>(`/graphs/${encodeURIComponent(graphId)}/versions`, {
    method: 'POST',
    body: JSON.stringify({ definition }),
  })
}

export async function createGraphRun(graphId: string, payload: { version_id?: string; inputs?: any; enqueue?: boolean }): Promise<NodeGraphRunOut> {
  return await http<NodeGraphRunOut>(`/graphs/${encodeURIComponent(graphId)}/runs`, {
    method: 'POST',
    body: JSON.stringify({
      version_id: payload.version_id ?? null,
      inputs: payload.inputs ?? {},
      enqueue: payload.enqueue ?? true,
    }),
  })
}

export async function getGraphRunProgress(runId: string): Promise<NodeGraphRunProgressOut> {
  return await http<NodeGraphRunProgressOut>(`/graphs/runs/${encodeURIComponent(runId)}/progress`)
}

export async function listGraphRunNodes(runId: string): Promise<NodeGraphRunNodeListOut> {
  return await http<NodeGraphRunNodeListOut>(`/graphs/runs/${encodeURIComponent(runId)}/nodes`)
}

export async function getGraphRunExecution(runId: string): Promise<NodeGraphRunExecutionOut> {
  return await http<NodeGraphRunExecutionOut>(`/graphs/runs/${encodeURIComponent(runId)}/execution`)
}

export async function listNodeKindsMeta(): Promise<NodeKindMetaListOut> {
  return await http<NodeKindMetaListOut>('/graphs/kinds')
}

export async function runAlignmentBacktestTemplate(payload: {
  alignment_id: string
  timerange?: string
  name?: string
  description?: string
  enqueue?: boolean
  idempotency_key?: string
}): Promise<NodeGraphRunOut> {
  return await http<NodeGraphRunOut>('/graphs/templates/alignment-backtest', {
    method: 'POST',
    body: JSON.stringify({
      alignment_id: payload.alignment_id,
      timerange: payload.timerange ?? null,
      name: payload.name ?? null,
      description: payload.description ?? null,
      enqueue: payload.enqueue ?? true,
      idempotency_key: payload.idempotency_key ?? null,
    }),
  })
}
