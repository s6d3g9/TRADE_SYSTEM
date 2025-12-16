import { http } from '../httpClient'

export type Bot = { id: string; name: string; status: string }

export async function listBots(): Promise<Bot[]> {
  // TODO: backend endpoint
  return http<Bot[]>('/bots')
}

export async function getBotProvider(botId: string): Promise<{ bot_id: string; provider_id: string | null }> {
  return http(`/bots/${encodeURIComponent(botId)}/provider`)
}
