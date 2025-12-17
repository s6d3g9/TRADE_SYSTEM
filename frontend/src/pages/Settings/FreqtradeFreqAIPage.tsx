import { useEffect, useMemo, useState } from 'react'

import Card from '../../shared/ui/Card'
import EmptyState from '../../shared/ui/EmptyState'
import ErrorBanner from '../../shared/ui/ErrorBanner'
import PageHeader from '../../shared/ui/PageHeader'
import Tabs from '../../shared/ui/Tabs'
import {
  NeuroModule,
  NeuroProvider,
  createNeuroProvider,
  deleteNeuroProvider,
  listNeuroModules,
  listNeuroProviders,
  updateNeuroProvider,
} from '../../services/api/neuroApi'

type Mode = 'edit' | 'create'

type FormState = {
  provider_id: string
  name: string
  profile: string
  scope_text: string
  defaults_text: string
  mapping_text: string
}

const emptyForm: FormState = {
  provider_id: '',
  name: '',
  profile: '',
  scope_text: '',
  defaults_text: '',
  mapping_text: '',
}

function safeParse(jsonText: string): Record<string, unknown> | undefined {
  if (!jsonText.trim()) return undefined
  return JSON.parse(jsonText)
}

function prettyJson(value: unknown): string {
  if (value == null) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ''
  }
}

export default function FreqtradeFreqAIPage() {
  const [tab, setTab] = useState<'provider' | 'alignment'>('provider')

  const [modules, setModules] = useState<NeuroModule[]>([])
  const [modulesLoading, setModulesLoading] = useState(false)
  const [modulesError, setModulesError] = useState<string | null>(null)

  const [providers, setProviders] = useState<NeuroProvider[]>([])
  const [providersLoading, setProvidersLoading] = useState(false)
  const [providersError, setProvidersError] = useState<string | null>(null)

  const [mode, setMode] = useState<Mode>('edit')
  const [selectedProviderId, setSelectedProviderId] = useState<string>('')

  const [form, setForm] = useState<FormState>(emptyForm)
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formMessage, setFormMessage] = useState<string | null>(null)

  const freqAiModule = useMemo(() => modules.find((m) => m.module_type === 'freqai'), [modules])
  const freqAiProviders = useMemo(() => providers.filter((p) => p.module_type === 'freqai'), [providers])

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Auto-pick first provider when available
    if (mode !== 'edit') return
    if (selectedProviderId) return
    if (freqAiProviders.length === 0) return

    const first = freqAiProviders[0]
    setSelectedProviderId(first.provider_id)
    hydrateFormFromProvider(first)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freqAiProviders.length, mode])

  async function loadAll() {
    void loadModules()
    void loadProviders()
  }

  async function loadModules() {
    setModulesLoading(true)
    setModulesError(null)
    try {
      const res = await listNeuroModules()
      setModules(res)
    } catch (e) {
      setModulesError(e instanceof Error ? e.message : 'Failed to load modules')
    } finally {
      setModulesLoading(false)
    }
  }

  async function loadProviders() {
    setProvidersLoading(true)
    setProvidersError(null)
    try {
      const res = await listNeuroProviders()
      setProviders(res)
    } catch (e) {
      setProvidersError(e instanceof Error ? e.message : 'Failed to load providers')
    } finally {
      setProvidersLoading(false)
    }
  }

  function hydrateFormFromProvider(p: NeuroProvider) {
    const profile = typeof p.connector_config?.profile === 'string' ? (p.connector_config.profile as string) : ''

    setForm({
      provider_id: p.provider_id,
      name: p.name,
      profile,
      scope_text: prettyJson(p.scope),
      defaults_text: prettyJson(p.defaults),
      mapping_text: prettyJson(p.mapping),
    })
  }

  function resetToCreateMode() {
    setMode('create')
    setSelectedProviderId('')
    setForm(emptyForm)
    setFormError(null)
    setFormMessage(null)
    setTab('provider')
  }

  function resetToEditMode(p?: NeuroProvider) {
    setMode('edit')
    setFormError(null)
    setFormMessage(null)
    if (p) {
      setSelectedProviderId(p.provider_id)
      hydrateFormFromProvider(p)
      return
    }

    const first = freqAiProviders[0]
    if (first) {
      setSelectedProviderId(first.provider_id)
      hydrateFormFromProvider(first)
    } else {
      setSelectedProviderId('')
      setForm(emptyForm)
    }
  }

  const canSave = useMemo(() => {
    if (formBusy) return false
    if (!form.name.trim()) return false
    if (mode === 'create' && !form.provider_id.trim()) return false
    if (!form.profile.trim()) return false
    return true
  }, [formBusy, form.name, form.profile, form.provider_id, mode])

  async function save() {
    setFormBusy(true)
    setFormError(null)
    setFormMessage(null)

    try {
      let scope: Record<string, unknown> | undefined
      let defaults: Record<string, unknown> | undefined
      let mapping: Record<string, unknown> | undefined

      try {
        scope = form.scope_text ? safeParse(form.scope_text) : undefined
      } catch {
        throw new Error('scope: invalid JSON')
      }

      try {
        defaults = form.defaults_text ? safeParse(form.defaults_text) : undefined
      } catch {
        throw new Error('defaults: invalid JSON')
      }

      try {
        mapping = form.mapping_text ? safeParse(form.mapping_text) : undefined
      } catch {
        throw new Error('mapping: invalid JSON')
      }

      const payload: NeuroProvider = {
        provider_id: form.provider_id.trim(),
        name: form.name.trim(),
        module_type: 'freqai',
        connector: 'internal',
        connector_config: { profile: form.profile.trim() },
        scope,
        defaults,
        mapping,
      }

      if (mode === 'create') {
        const created = await createNeuroProvider(payload)
        setFormMessage('Provider created')
        await loadProviders()
        resetToEditMode(created)
      } else {
        const updated = await updateNeuroProvider(payload)
        setFormMessage('Saved')
        await loadProviders()
        resetToEditMode(updated)
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setFormBusy(false)
    }
  }

  async function removeSelected() {
    if (!selectedProviderId) return
    setFormBusy(true)
    setFormError(null)
    setFormMessage(null)
    try {
      await deleteNeuroProvider(selectedProviderId)
      setFormMessage('Deleted')
      await loadProviders()
      resetToEditMode()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setFormBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PageHeader
        title="Settings · Freqtrade/FreqAI"
        description="Сонастройка интеграции: профиль FreqAI + scope/defaults/mapping. Хранится как Neuro Provider (module_type=freqai)."
      />

      {(modulesError || providersError || formError) && (
        <ErrorBanner
          message={modulesError || providersError || formError || 'Unknown error'}
          onRetry={() => void loadAll()}
        />
      )}

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontWeight: 700 }}>Provider selection</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Connector фиксирован как <span style={{ fontFamily: 'monospace' }}>internal</span>.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => resetToCreateMode()}
              disabled={formBusy}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
            >
              New provider
            </button>
            <button
              onClick={() => resetToEditMode()}
              disabled={formBusy}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
            >
              Edit existing
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          {providersLoading && <div>Loading providers…</div>}

          {!providersLoading && mode === 'edit' && freqAiProviders.length === 0 && (
            <EmptyState title="No FreqAI providers" hint="Создайте провайдера для module_type=freqai" />
          )}

          {!providersLoading && mode === 'edit' && freqAiProviders.length > 0 && (
            <label style={{ display: 'grid', gap: 4, maxWidth: 520 }}>
              <span>FreqAI provider</span>
              <select
                value={selectedProviderId}
                onChange={(e) => {
                  const id = e.target.value
                  setSelectedProviderId(id)
                  const p = freqAiProviders.find((x) => x.provider_id === id)
                  if (p) hydrateFormFromProvider(p)
                }}
              >
                {freqAiProviders.map((p) => (
                  <option key={p.provider_id} value={p.provider_id}>
                    {p.provider_id} · {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {formMessage ? <div style={{ fontSize: 12, opacity: 0.85 }}>{formMessage}</div> : null}
            {modulesLoading ? <div style={{ fontSize: 12, opacity: 0.7 }}>Loading module schema…</div> : null}
          </div>

          {freqAiModule ? (
            <div
              style={{
                fontSize: 12,
                opacity: 0.85,
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 10,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Module info</div>
              <div>
                <span style={{ fontFamily: 'monospace' }}>module_type</span>: {freqAiModule.module_type} · v{freqAiModule.version}
              </div>
              <div>
                <span style={{ fontFamily: 'monospace' }}>provider_config_schema</span>: requires{' '}
                <span style={{ fontFamily: 'monospace' }}>connector_config.profile</span>
              </div>
            </div>
          ) : null}

          <Tabs
            items={[
              { id: 'provider', label: 'Provider' },
              { id: 'alignment', label: 'Scope / Defaults / Mapping' },
            ]}
            value={tab}
            onChange={(id) => setTab(id as typeof tab)}
          />

          {tab === 'provider' ? (
            <div style={{ display: 'grid', gap: 10, maxWidth: 720 }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <span>provider_id</span>
                <input
                  value={form.provider_id}
                  disabled={mode !== 'create' || formBusy}
                  onChange={(e) => setForm({ ...form, provider_id: e.target.value })}
                  placeholder="freqai-local"
                />
              </label>

              <label style={{ display: 'grid', gap: 4 }}>
                <span>Name</span>
                <input
                  value={form.name}
                  disabled={formBusy}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="FreqAI (local)"
                />
              </label>

              <label style={{ display: 'grid', gap: 4 }}>
                <span>FreqAI profile</span>
                <input
                  value={form.profile}
                  disabled={formBusy}
                  onChange={(e) => setForm({ ...form, profile: e.target.value })}
                  placeholder="default"
                />
              </label>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => void save()}
                  disabled={!canSave}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
                >
                  {formBusy ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
                </button>

                {mode === 'edit' ? (
                  <button
                    onClick={() => void removeSelected()}
                    disabled={formBusy || !selectedProviderId}
                    style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                Это JSON-поля для “сонастройки”. Начнём с простого: мы храним их в{' '}
                <span style={{ fontFamily: 'monospace' }}>scope/defaults/mapping</span> у провайдера.
              </div>

              <label style={{ display: 'grid', gap: 4 }}>
                <span>Scope (JSON, optional)</span>
                <textarea
                  value={form.scope_text}
                  disabled={formBusy}
                  onChange={(e) => setForm({ ...form, scope_text: e.target.value })}
                  rows={4}
                  style={{ fontFamily: 'monospace' }}
                />
              </label>

              <label style={{ display: 'grid', gap: 4 }}>
                <span>Defaults (JSON, optional)</span>
                <textarea
                  value={form.defaults_text}
                  disabled={formBusy}
                  onChange={(e) => setForm({ ...form, defaults_text: e.target.value })}
                  rows={6}
                  style={{ fontFamily: 'monospace' }}
                />
              </label>

              <label style={{ display: 'grid', gap: 4 }}>
                <span>Mapping (JSON, optional)</span>
                <textarea
                  value={form.mapping_text}
                  disabled={formBusy}
                  onChange={(e) => setForm({ ...form, mapping_text: e.target.value })}
                  rows={10}
                  style={{ fontFamily: 'monospace' }}
                />
              </label>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => void save()}
                  disabled={!canSave}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
                >
                  {formBusy ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
                </button>
                {formMessage ? <span style={{ fontSize: 12, opacity: 0.85 }}>{formMessage}</span> : null}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
