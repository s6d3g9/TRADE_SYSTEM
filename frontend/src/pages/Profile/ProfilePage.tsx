import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../shared/hooks/useAuth'
import PageHeader from '../../shared/ui/PageHeader'
import CollapsibleSection from '../../shared/ui/CollapsibleSection'
import { formatFixed, toFiniteNumber } from '../../shared/utils/numberFormat'
import ErrorBanner from '../../shared/ui/ErrorBanner'
import { meSettings, updateMeSettings, type MeSettingsOut } from '../../services/api/authApi'
import { listOpenRouterModels, type OpenRouterModel } from '../../services/api/aiApi'

interface UserStats {
  user_id: string
  total_bots: number | string
  active_bots: number | string
  total_sessions: number | string
  total_trades: number | string
  open_positions: number | string
  total_pnl: number | string
  total_pnl_percent: number | string
  win_rate: number | string
  best_bot_id?: string | null
  best_bot_name?: string | null
  best_bot_pnl?: number | string | null
}

export default function ProfilePage() {
  const { user, loading: userLoading } = useAuth()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [aiLoading, setAiLoading] = useState(false)
  const [aiSaving, setAiSaving] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiMessage, setAiMessage] = useState<string | null>(null)
  const [aiSettings, setAiSettings] = useState<MeSettingsOut | null>(null)

  const [providerDraft, setProviderDraft] = useState<MeSettingsOut['ai_provider'] | ''>('')
  const [openRouterModelDraft, setOpenRouterModelDraft] = useState<string>('')

  const [aiTokenDraft, setAiTokenDraft] = useState('')
  const aiTokenDraftRef = useRef('')
  const aiTokenSaveTimerRef = useRef<number | null>(null)

  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>([])
  const [openRouterLoading, setOpenRouterLoading] = useState(false)
  const [openRouterError, setOpenRouterError] = useState<string | null>(null)

  const selectedProvider = aiSettings?.ai_provider ?? null

  const selectedOpenRouterModel = useMemo(() => {
    const id = openRouterModelDraft || aiSettings?.openrouter_model_id || ''
    if (!id) return null
    return openRouterModels.find((m) => m.id === id) || null
  }, [openRouterModels, aiSettings?.openrouter_model_id, openRouterModelDraft])

  useEffect(() => {
    setProviderDraft((aiSettings?.ai_provider ?? '') as any)
    setOpenRouterModelDraft(aiSettings?.openrouter_model_id ?? '')
  }, [aiSettings?.ai_provider, aiSettings?.openrouter_model_id])

  useEffect(() => {
    async function loadStats() {
      if (!user) return

      try {
        const token = localStorage.getItem('access_token')
        const res = await fetch('/api/trading/user/stats', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        const data = await res.json()
        setStats(data)
      } catch (err) {
        console.error('Failed to load stats:', err)
        setError(err instanceof Error ? err.message : 'Failed to load stats')
      } finally {
        setLoading(false)
      }
    }

    if (!userLoading) {
      void loadStats()
    }
  }, [user, userLoading])

  useEffect(() => {
    async function loadAi() {
      if (!user) return
      setAiLoading(true)
      setAiError(null)
      try {
        const s = await meSettings()
        setAiSettings(s)
      } catch (e) {
        setAiError(e instanceof Error ? e.message : 'Failed to load AI settings')
      } finally {
        setAiLoading(false)
      }
    }

    if (!userLoading) {
      void loadAi()
    }
  }, [user, userLoading])

  async function reloadAi() {
    if (!user) return
    setAiLoading(true)
    setAiError(null)
    try {
      const s = await meSettings()
      setAiSettings(s)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Failed to load AI settings')
    } finally {
      setAiLoading(false)
    }
  }

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
    void (async () => {
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
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider])

  async function saveAi(patch: Parameters<typeof updateMeSettings>[0]) {
    setAiSaving(true)
    setAiError(null)
    setAiMessage(null)
    try {
      const next = await updateMeSettings(patch)
      setAiSettings(next)
      setAiMessage('AI settings saved')

      if (Object.prototype.hasOwnProperty.call(patch, 'ai_token')) {
        setAiTokenDraft('')
        aiTokenDraftRef.current = ''
        if (aiTokenSaveTimerRef.current) {
          window.clearTimeout(aiTokenSaveTimerRef.current)
          aiTokenSaveTimerRef.current = null
        }
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Failed to save AI settings')
    } finally {
      setAiSaving(false)
    }
  }

  if (userLoading || loading) {
    return (
      <div style={{ padding: 24 }}>
        <PageHeader title="Profile" description="Loading..." />
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{ padding: 24 }}>
        <PageHeader title="Profile" description="Please sign in" />
        <div style={{ marginTop: 20 }}>
          <a href="/login" style={{
            padding: '10px 20px',
            borderRadius: 8,
            background: 'var(--primary)',
            color: '#fff',
            textDecoration: 'none',
            display: 'inline-block',
          }}>
            Sign In
          </a>
        </div>
      </div>
    )
  }

  const totalPnl = toFiniteNumber(stats?.total_pnl)
  const isProfitable = (totalPnl ?? 0) > 0

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title={user.name || 'User Profile'}
        description={user.email}
      />

      {aiError ? (
        <div style={{ marginTop: 16 }}>
          <ErrorBanner message={aiError} onRetry={() => void reloadAi()} />
        </div>
      ) : null}

      {!aiError && aiMessage ? (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 13,
          }}
        >
          {aiMessage}
        </div>
      ) : null}

      {/* User Info Card */}
      <div style={{
        marginTop: 24,
        padding: 24,
        background: 'var(--surface)',
        borderRadius: 12,
        border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: user.picture_url ? `url(${user.picture_url}) center/cover` : 'var(--primary)',
            color: '#fff',
            fontSize: 32,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {!user.picture_url && user.email[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              {user.name || 'User'}
            </h2>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
              {user.email}
            </div>
            {user.email_verified && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                marginTop: 8,
                padding: '4px 12px',
                borderRadius: 6,
                background: '#dcfce7',
                color: '#16a34a',
                fontSize: 12,
                fontWeight: 600,
              }}>
                ✓ Email Verified
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Settings */}
      <div style={{ marginTop: 24 }}>
        <CollapsibleSection title="AI Settings" icon="🧠" variant="card" defaultExpanded={false}>
          <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>AI provider</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <select
                  value={providerDraft ?? ''}
                  disabled={aiLoading || aiSaving}
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
                  disabled={aiLoading || aiSaving || (providerDraft || null) === (aiSettings?.ai_provider ?? null)}
                  onClick={() => {
                    const nextProvider = (providerDraft || null) as MeSettingsOut['ai_provider']
                    void saveAi({
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
                    cursor: aiLoading || aiSaving ? 'not-allowed' : 'pointer',
                  }}
                  type="button"
                  title="Save provider"
                >
                  Save
                </button>
              </div>
            </label>

            {(providerDraft || selectedProvider) === 'openrouter' && (
              <label style={{ display: 'grid', gap: 6 }}>
                <span>OpenRouter model</span>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <select
                    value={openRouterModelDraft}
                    disabled={aiLoading || aiSaving || openRouterLoading || !!openRouterError}
                    onChange={(e) => {
                      setOpenRouterModelDraft(e.target.value)
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
                      aiLoading ||
                      aiSaving ||
                      !!openRouterError ||
                      (openRouterModelDraft || null) === (aiSettings?.openrouter_model_id ?? null)
                    }
                    onClick={() => {
                      void saveAi({ openrouter_model_id: openRouterModelDraft || null })
                    }}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      cursor: aiLoading || aiSaving ? 'not-allowed' : 'pointer',
                    }}
                    type="button"
                    title="Save model"
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

            <label style={{ display: 'grid', gap: 6 }}>
              <span>AI token</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="password"
                  value={aiTokenDraft}
                  disabled={aiLoading || aiSaving}
                  onChange={(e) => {
                    const v = e.target.value
                    setAiTokenDraft(v)
                    aiTokenDraftRef.current = v

                    if (aiTokenSaveTimerRef.current) window.clearTimeout(aiTokenSaveTimerRef.current)
                    aiTokenSaveTimerRef.current = window.setTimeout(() => {
                      void saveAi({ ai_token: v }).catch(() => {})
                    }, 650)
                  }}
                  onBlur={() => {
                    void saveAi({ ai_token: aiTokenDraft }).catch(() => {})
                  }}
                  placeholder={aiSettings?.has_ai_token ? 'Token saved (not shown)' : 'Paste token'}
                  style={{ flex: 1 }}
                />

                <button
                  disabled={aiLoading || aiSaving || !aiTokenDraft.trim()}
                  onClick={() => {
                    void saveAi({ ai_token: aiTokenDraft }).catch(() => {})
                  }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    cursor: aiLoading || aiSaving ? 'not-allowed' : 'pointer',
                  }}
                  type="button"
                  title="Save token"
                >
                  Save
                </button>
              </div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                Saved on server: {aiSettings?.has_ai_token ? 'Yes' : 'No'}
              </div>
              {aiSettings?.has_ai_token && !aiTokenDraft.trim() ? (
                <div style={{ fontSize: 12, opacity: 0.85 }}>Token is stored for your account and is not shown here.</div>
              ) : null}
              <div style={{ fontSize: 12, opacity: 0.75 }}>Storage note: token is stored server-side and never returned to the UI.</div>
            </label>
          </div>
        </CollapsibleSection>
      </div>

      {/* Statistics */}
      {error ? (
        <div style={{
          marginTop: 24,
          padding: 20,
          background: '#fee2e2',
          borderRadius: 12,
          color: '#dc2626',
        }}>
          Error loading statistics: {error}
        </div>
      ) : stats ? (
        <>
          {/* Overview Stats */}
          <CollapsibleSection
            title="Trading Overview"
            icon="📊"
            variant="card"
            defaultExpanded={true}
          >
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
            }}>
              <StatCard
                label="Total Bots"
                value={stats.total_bots.toString()}
                icon="🤖"
                color="#3b82f6"
              />
              <StatCard
                label="Active Bots"
                value={stats.active_bots.toString()}
                icon="▶️"
                color="#22c55e"
              />
              <StatCard
                label="Total Trades"
                value={stats.total_trades.toString()}
                icon="📊"
                color="#8b5cf6"
              />
              <StatCard
                label="Open Positions"
                value={stats.open_positions.toString()}
                icon="📈"
                color="#f59e0b"
              />
            </div>
          </CollapsibleSection>

          {/* Performance Stats */}
          <CollapsibleSection
            title="Performance Metrics"
            icon="💹"
            variant="card"
            defaultExpanded={true}
          >
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: 16,
            }}>
              <div style={{
                padding: 24,
                background: 'var(--bg)',
                borderRadius: 12,
                border: '2px solid ' + (isProfitable ? '#22c55e' : '#ef4444'),
              }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Total P&L
                </div>
                <div style={{
                  fontSize: 32,
                  fontWeight: 700,
                  color: isProfitable ? '#22c55e' : '#ef4444',
                }}>
                  {isProfitable ? '+' : ''}${formatFixed(stats?.total_pnl, 2, '0.00')}
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {isProfitable ? '+' : ''}{formatFixed(stats?.total_pnl_percent, 2, '0.00')}%
                </div>
              </div>

              <div style={{
                padding: 24,
                background: 'var(--bg)',
                borderRadius: 12,
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Win Rate
                </div>
                <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)' }}>
                  {formatFixed(stats?.win_rate, 1, '0.0')}%
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {(toFiniteNumber(stats?.total_trades) ?? 0) > 0 ? `From ${toFiniteNumber(stats?.total_trades) ?? 0} trades` : 'No trades yet'}
                </div>
              </div>

              <div style={{
                padding: 24,
                background: 'var(--bg)',
                borderRadius: 12,
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Total Sessions
                </div>
                <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)' }}>
                  {stats.total_sessions}
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Bot trading sessions
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Best Bot */}
          {stats.best_bot_id && (
            <CollapsibleSection
              title="Best Performing Bot"
              icon="🏆"
              variant="card"
              defaultExpanded={true}
            >
              <div style={{
                padding: 24,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: 12,
                color: '#fff',
              }}>
                <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 8 }}>
                  Top Performance
                </div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {stats.best_bot_name || 'Unknown'}
                </div>
                <div style={{ fontSize: 18, marginTop: 8 }}>
                  {(toFiniteNumber(stats.best_bot_pnl) ?? 0) > 0 ? '+' : ''}${formatFixed(stats.best_bot_pnl, 2, '0.00')}
                </div>
                <a
                  href={`/strategylab/combinator`}
                  style={{
                    display: 'inline-block',
                    marginTop: 16,
                    padding: '8px 16px',
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.2)',
                    color: '#fff',
                    textDecoration: 'none',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  View All Bots →
                </a>
              </div>
            </CollapsibleSection>
          )}
        </>
      ) : (
        <div style={{
          marginTop: 24,
          padding: 40,
          background: 'var(--surface)',
          borderRadius: 12,
          border: '1px solid var(--border)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <div style={{ fontSize: 16, color: 'var(--text-secondary)' }}>
            No trading statistics yet
          </div>
          <a
            href="/strategylab/combinator"
            style={{
              display: 'inline-block',
              marginTop: 16,
              padding: '10px 20px',
              borderRadius: 8,
              background: 'var(--primary)',
              color: '#fff',
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Create Your First Bot
          </a>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <div style={{
      padding: 20,
      background: 'var(--surface)',
      borderRadius: 12,
      border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          background: color + '20',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
        }}>
          {icon}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
          {label}
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)' }}>
        {value}
      </div>
    </div>
  )
}
