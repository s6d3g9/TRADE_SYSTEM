import { http } from '../httpClient'

export type Strategy = { name: string; type?: string; updated_at?: string }

export async function listStrategies(): Promise<Strategy[]> {
  // TODO: backend endpoint
  return http<Strategy[]>('/strategies')
}
