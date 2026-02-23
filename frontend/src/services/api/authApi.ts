import { http } from '../httpClient'

export type TokenOut = {
  access_token: string
  token_type: 'bearer'
}

export async function emailLoginStart(email: string): Promise<{ ok: boolean }> {
  return http<{ ok: boolean }>('/auth/email/start', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function emailLoginVerify(token: string): Promise<TokenOut> {
  return http<TokenOut>('/auth/email/verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}

export async function googleLoginUrl(next?: string): Promise<{ auth_url: string }> {
  const qs = next ? `?next=${encodeURIComponent(next)}` : ''
  return http<{ auth_url: string }>(`/auth/google/login${qs}`)
}

export async function me(): Promise<{ user: { user_id: string; email: string; email_verified: boolean; name?: string | null } }> {
  return http<{ user: { user_id: string; email: string; email_verified: boolean; name?: string | null } }>('/auth/me')
}

export type MeSettingsOut = {
  ai_provider: 'openrouter' | 'openai' | 'local' | null
  openrouter_model_id: string | null
  has_ai_token: boolean
}

export type MeSettingsUpdate = {
  ai_provider?: MeSettingsOut['ai_provider']
  openrouter_model_id?: string | null
  ai_token?: string | null
}

export async function meSettings(): Promise<MeSettingsOut> {
  return http<MeSettingsOut>('/auth/me/settings')
}

export async function updateMeSettings(patch: MeSettingsUpdate): Promise<MeSettingsOut> {
  return http<MeSettingsOut>('/auth/me/settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export async function seedGenerate(): Promise<{ mnemonic: string }> {
  return http<{ mnemonic: string }>('/auth/seed/generate', {
    method: 'POST',
  })
}

export async function passwordRegister(email: string, password: string): Promise<{ access_token: string; token_type: 'bearer'; recovery_mnemonic: string }> {
  return http<{ access_token: string; token_type: 'bearer'; recovery_mnemonic: string }>('/auth/password/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function passwordLogin(email: string, password: string): Promise<TokenOut> {
  return http<TokenOut>('/auth/password/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function passwordReset(email: string, recovery_mnemonic: string, new_password: string): Promise<TokenOut> {
  return http<TokenOut>('/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({ email, recovery_mnemonic, new_password }),
  })
}
