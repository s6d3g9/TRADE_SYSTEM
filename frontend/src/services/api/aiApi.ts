import { http } from '../httpClient'

export type OpenRouterModel = {
  id: string
  name: string
  is_free?: boolean
}

export async function listOpenRouterModels(): Promise<{ models: OpenRouterModel[] }> {
  return http<{ models: OpenRouterModel[] }>('/ai/openrouter/models')
}
