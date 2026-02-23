import { useEffect, useMemo, useRef, useState } from 'react'

import PageHeader from '../../shared/ui/PageHeader'
import Card from '../../shared/ui/Card'
import ErrorBanner from '../../shared/ui/ErrorBanner'
import { meSettings, updateMeSettings, type MeSettingsOut } from '../../services/api/authApi'
import { listOpenRouterModels, type OpenRouterModel } from '../../services/api/aiApi'

export default function AccountPage() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [settings, setSettings] = useState<MeSettingsOut | null>(null)
  const [providerDraft, setProviderDraft] = useState<MeSettingsOut['ai_provider'] | ''>('')
  const [openRouterModelDraft, setOpenRouterModelDraft] = useState<string>('')
  const [aiTokenDraft, setAiTokenDraft] = useState('')
  const aiTokenSaveTimerRef = useRef<number | null>(null)
  const aiTokenDraftRef = useRef('')

  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>([])
  const [openRouterLoading, setOpenRouterLoading] = useState(false)
  const [openRouterError, setOpenRouterError] = useState<string | null>(null)

  const selectedProvider = settings?.ai_provider ?? null

  const selectedOpenRouterModel = useMemo(() => {
    if (!settings?.openrouter_model_id) return null
    return openRouterModels.find((m) => m.id === settings.openrouter_model_id) || null
  }, [openRouterModels, settings?.openrouter_model_id])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setProviderDraft((settings?.ai_provider ?? '') as any)
    setOpenRouterModelDraft(settings?.openrouter_model_id ?? '')
  }, [settings?.ai_provider, settings?.openrouter_model_id])

  useEffect(() => {
    return () => {
      if (aiTokenSaveTimerRef.current) {
        window.clearTimeout(aiTokenSaveTimerRef.current)
        aiTokenSaveTimerRef.current = null
        const draft = aiTokenDraftRef.current
        if (draft.trim()) {
          void updateMeSettings({ ai_token: draft }).catch(() => {})
        }
      }
    }
  }, [])

  useEffect(() => {
    if (selectedProvider !== 'openrouter') return
    if (openRouterModels.length > 0) return
    void loadOpenRouterModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const s = await meSettings()
      setSettings(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load account settings')
    } finally {
      setLoading(false)
    }
  }

  async function loadOpenRouterModels() {
    setOpenRouterLoading(true)
    setOpenRouterError(null)
    try {
      const res = await listOpenRouterModels()
      setOpenRouterModels(res.models || [])
    } catch (e) {
      setOpenRouterError(e instanceof Error ? e.message : 'Failed to load OpenRouter models')
    } finally {
      setOpenRouterLoading(false)
    }
  }

  async function save(patch: Parameters<typeof updateMeSettings>[0]) {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const next = await updateMeSettings(patch)
      setSettings(next)
      setMessage('Saved')

      if (Object.prototype.hasOwnProperty.call(patch, 'ai_token')) {
        setAiTokenDraft('')
        aiTokenDraftRef.current = ''
        if (aiTokenSaveTimerRef.current) {
          window.clearTimeout(aiTokenSaveTimerRef.current)
          aiTokenSaveTimerRef.current = null
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PageHeader title="Settings · Account" description="Account-level settings (AI provider/token/model)" />

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {!error && message ? (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 13,
          }}
        >
          {message}
        </div>
      ) : null}

      <Card>
        <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontWeight: 700 }}>AI settings</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Used by StrategyLab chat/autotune when token/model is not provided.</div>
          </div>

          <label style={{ display: 'grid', gap: 4 }}>
            <span>AI provider</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <select
                value={providerDraft ?? ''}
                disabled={loading || saving}
                onChange={(e) => {
                  const v = (e.target.value || null) as MeSettingsOut['ai_provider']
                  setProviderDraft((v ?? '') as any)
                  if (v !== 'openrouter') {
                    setOpenRouterModelDraft('')
                  }
                }}
                style={{ flex: 1 }}
              >
              <option value="" disabled>
                Select provider
              </option>
              <option value="openrouter">OpenRouter</option>
              <option value="openai">OpenAI</option>
              <option value="local">Local</option>
              </select>

              <button
                disabled={loading || saving || (providerDraft || null) === (settings?.ai_provider ?? null)}
                onClick={() => {
                  const nextProvider = (providerDraft || null) as MeSettingsOut['ai_provider']
                  void save({
                    ai_provider: nextProvider,
                    ...(nextProvider !== 'openrouter' ? { openrouter_model_id: null } : {}),
                  })
                }}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  cursor: loading || saving ? 'not-allowed' : 'pointer',
                }}
                title="Save provider"
                type="button"
              >
                Save
              </button>
            </div>
          </label>

          {(providerDraft || selectedProvider) === 'openrouter' && (
            <label style={{ display: 'grid', gap: 4 }}>
              <span>OpenRouter model</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <select
                  value={openRouterModelDraft}
                  disabled={loading || saving || openRouterLoading || !!openRouterError}
                  onChange={(e) => {
                    const v = e.target.value
                    setOpenRouterModelDraft(v)
                  }}
                  style={{ flex: 1 }}
                >
                  <option value="" disabled>
                    {openRouterLoading ? 'Loading models…' : 'Select model'}
                  </option>
                  {openRouterModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {(m.is_free ? 'FREE • ' : '') + m.name}
                    </option>
                  ))}
                </select>

                <button
                  disabled={
                    loading ||
                    saving ||
                    !!openRouterError ||
                    (openRouterModelDraft || null) === (settings?.openrouter_model_id ?? null)
                  }
                  onClick={() => {
                    void save({ openrouter_model_id: openRouterModelDraft || null })
                  }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    cursor: loading || saving ? 'not-allowed' : 'pointer',
                  }}
                  title="Save model"
                  type="button"
                >
                  Save
                </button>
              </div>
              {selectedOpenRouterModel?.is_free ? (
                <div style={{ fontSize: 12, opacity: 0.85 }}>Selected: FREE model</div>
              ) : null}
              {openRouterError ? <div style={{ fontSize: 12, opacity: 0.85 }}>{openRouterError}</div> : null}
            </label>
          )}

          <label style={{ display: 'grid', gap: 4 }}>
            <span>AI token</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="password"
                value={aiTokenDraft}
                disabled={loading || saving}
                onChange={(e) => {
                  const v = e.target.value
                  setAiTokenDraft(v)
                  aiTokenDraftRef.current = v

                  if (aiTokenSaveTimerRef.current) window.clearTimeout(aiTokenSaveTimerRef.current)
                  aiTokenSaveTimerRef.current = window.setTimeout(() => {
                    void save({ ai_token: v }).catch(() => {})
                  }, 650)
                }}
                onBlur={() => {
                  void save({ ai_token: aiTokenDraft }).catch(() => {})
                }}
                placeholder={settings?.has_ai_token ? 'Token saved (not shown)' : 'Paste token'}
                style={{ flex: 1 }}
              />

              <button
                disabled={loading || saving || !aiTokenDraft.trim()}
                onClick={() => {
                  void save({ ai_token: aiTokenDraft }).catch(() => {})
                }}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  cursor: loading || saving ? 'not-allowed' : 'pointer',
                }}
                title="Save token"
                type="button"
              >
                Save
              </button>
            </div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              Saved on server: {settings?.has_ai_token ? 'Yes' : 'No'}
            </div>
            {settings?.has_ai_token && !aiTokenDraft.trim() ? (
              <div style={{ fontSize: 12, opacity: 0.85 }}>Token is stored for your account and is not shown here.</div>
            ) : null}
          </label>

          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Storage note: token is stored server-side for your account and is never returned to the UI.
          </div>
        </div>
      </Card>
    </div>
  )
}
