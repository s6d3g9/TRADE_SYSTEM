import { http } from '../httpClient'

export type LogLine = { ts: string; level: string; service: string; message: string }

export async function queryLogs(q: { service?: string; contains?: string }): Promise<LogLine[]> {
  // TODO: backend endpoint
  const params = new URLSearchParams()
  if (q.service) params.set('service', q.service)
  if (q.contains) params.set('contains', q.contains)
  return http<LogLine[]>(`/logs?${params.toString()}`)
}
