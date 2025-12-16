import { http } from '../httpClient'

export type AgentStatus = {
  id: string
  kind: string
  status: 'online' | 'offline'
  lastHeartbeatTs?: string
}

export async function listAgents(): Promise<AgentStatus[]> {
  // TODO: backend endpoint
  return http<AgentStatus[]>('/agents')
}
