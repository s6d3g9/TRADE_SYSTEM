import { useEffect, useState } from 'react'

import PageHeader from '../../shared/ui/PageHeader'
import Card from '../../shared/ui/Card'
import Tabs from '../../shared/ui/Tabs'
import ErrorBanner from '../../shared/ui/ErrorBanner'
import EmptyState from '../../shared/ui/EmptyState'
import {
  NeuroModule,
  NeuroProvider,
  createNeuroProvider,
  deleteNeuroProvider,
  listNeuroModules,
  listNeuroProviders,
  updateNeuroProvider,
} from '../../services/api/neuroApi'
import { CanonicalSignalEnvelope, getProviderLastSignals, ingestSignal } from '../../services/api/signalsApi'

type FormState = {
  provider_id: string
  name: string
  module_type: string
  connector: NeuroProvider['connector']
  connector_config_text: string
  scope_text: string
  defaults_text: string
  mapping_text: string
}

const emptyForm: FormState = {
  provider_id: '',
  name: '',
  module_type: '',
  connector: 'redis',
  connector_config_text: '{"url":"redis://redis:6379/0"}',
  scope_text: '',
  defaults_text: '',
  mapping_text: '',
}

const connectorOptions: NeuroProvider['connector'][] = ['internal', 'redis', 'http', 'file']

function safeParse(jsonText: string): Record<string, unknown> | undefined {
  if (!jsonText.trim()) return undefined
  return JSON.parse(jsonText)
}

export default function NeuroModulesPage() {
  const [tab, setTab] = useState<'modules' | 'providers'>('providers')

  const [modules, setModules] = useState<NeuroModule[]>([])
  const [modulesLoading, setModulesLoading] = useState(false)
  const [modulesError, setModulesError] = useState<string | null>(null)

  const [providers, setProviders] = useState<NeuroProvider[]>([])
  const [providersLoading, setProvidersLoading] = useState(false)
  const [providersError, setProvidersError] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)

  const [quickProviderId, setQuickProviderId] = useState('')
  const [quickPair, setQuickPair] = useState('BTC/USDT')
  const [quickDirection, setQuickDirection] = useState<'buy' | 'sell'>('buy')
  const [quickConfidence, setQuickConfidence] = useState(0.7)
  const [quickTtl, setQuickTtl] = useState(300)
  const [quickMessage, setQuickMessage] = useState<string | null>(null)
  const [quickLastSignals, setQuickLastSignals] = useState<Record<string, unknown> | null>(null)
  const [quickBusy, setQuickBusy] = useState(false)

  useEffect(() => {
    void loadModules()
    void loadProviders()
  }, [])

  async function loadModules() {
    setModulesLoading(true)
    setModulesError(null)
    try {
      const data = await listNeuroModules()
      setModules(data)
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
      const data = await listNeuroProviders()
      setProviders(data)
    } catch (e) {
      setProvidersError(e instanceof Error ? e.message : 'Failed to load providers')
    } finally {
      setProvidersLoading(false)
    }
  }

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
    setFormError(null)
  }

  function handleEdit(p: NeuroProvider) {
    setEditingId(p.provider_id)
    setForm({
      provider_id: p.provider_id,
      name: p.name,
      module_type: p.module_type,
      connector: p.connector,
      connector_config_text: JSON.stringify(p.connector_config ?? {}, null, 2),
      scope_text: p.scope ? JSON.stringify(p.scope, null, 2) : '',
      defaults_text: p.defaults ? JSON.stringify(p.defaults, null, 2) : '',
      mapping_text: p.mapping ? JSON.stringify(p.mapping, null, 2) : '',
    })
  }

  async function handleSubmit() {
    setFormSubmitting(true)
    setFormError(null)
    try {
      let connector_config: Record<string, unknown> = {}
      try {
        connector_config = form.connector_config_text ? JSON.parse(form.connector_config_text) : {}
      } catch (err) {
        throw new Error('connector_config: invalid JSON')
      }

      const scope = form.scope_text ? safeParse(form.scope_text) : undefined
      const defaults = form.defaults_text ? safeParse(form.defaults_text) : undefined
      const mapping = form.mapping_text ? safeParse(form.mapping_text) : undefined

      const payload: NeuroProvider = {
        provider_id: form.provider_id.trim(),
        name: form.name.trim(),
        module_type: form.module_type,
        connector: form.connector,
        connector_config,
        scope,
        defaults,
        mapping,
      }

      if (!payload.provider_id) throw new Error('provider_id is required')
      if (!payload.name) throw new Error('name is required')
      if (!payload.module_type) throw new Error('module_type is required')

      if (editingId) {
        await updateNeuroProvider(payload)
      } else {
        await createNeuroProvider(payload)
      }

      await loadProviders()
      resetForm()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setFormSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(`Delete provider ${id}?`)) return
    try {
      await deleteNeuroProvider(id)
      if (editingId === id) resetForm()
      await loadProviders()
    } catch (e) {
      setProvidersError(e instanceof Error ? e.message : 'Delete failed')
    }
  }
  async function sendQuickSignal() {
    if (!quickProviderId) {
      setQuickMessage('Select provider first')
      return
    }

    setQuickBusy(true)
    setQuickMessage(null)
    setQuickLastSignals(null)

    try {
      const envelope: CanonicalSignalEnvelope = {
        provider_id: quickProviderId,
        timestamp: Date.now(),
        ttl_sec: quickTtl,
        signals: {
          [quickPair]: {
            direction: quickDirection,
            confidence: quickConfidence,
          },
        },
      }

      await ingestSignal(envelope)
      await loadProviders()
      const last = await getProviderLastSignals(quickProviderId, [quickPair])
      setQuickLastSignals(last.signals)
      setQuickMessage('Signal ingested')
    } catch (e) {
      setQuickMessage(e instanceof Error ? e.message : 'Failed to send signal')
    } finally {
      setQuickBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PageHeader
        title="Settings · Neuro Modules"
        description="Управление провайдерами сигналов и перечнем доступных модулей"
        actions={
          <Tabs
            items={[
              { id: 'providers', label: 'Providers' },
              { id: 'modules', label: 'Modules Catalog' },
            ]}
            value={tab}
            onChange={(id) => setTab(id as 'providers' | 'modules')}
          />
        }
      />

      {tab === 'modules' && (
        <Card>
          {modulesError && <ErrorBanner message={modulesError} onRetry={loadModules} />}
          {modulesLoading && <div>Loading modules…</div>}
          {!modulesLoading && !modulesError && modules.length === 0 && (
            <EmptyState title="Нет модулей" hint="Каталог модулей пуст" />
          )}
          {!modulesLoading && !modulesError && modules.length > 0 && (
            <div style={{ display: 'grid', gap: 12 }}>
              {modules.map((m) => (
                <div
                  key={m.module_type}
                  style={{ border: '1px solid #eee', borderRadius: 10, padding: 12, background: '#fafafa' }}
                >
                  <div style={{ fontWeight: 700 }}>{m.title}</div>
                  <div style={{ fontSize: 14, opacity: 0.8 }}>{m.description}</div>
                  <div style={{ marginTop: 6, fontSize: 12 }}>
                    Type: {m.module_type} · Version: {m.version} · Status: {m.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'providers' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>Providers</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={loadProviders} disabled={providersLoading}>
                  {providersLoading ? 'Refreshing…' : 'Refresh'}
                </button>
                <button onClick={resetForm} disabled={formSubmitting}>
                  Reset form
                </button>
              </div>
            </div>
            {providersError && <ErrorBanner message={providersError} onRetry={loadProviders} />}
            {providersLoading && <div>Loading providers…</div>}
            {!providersLoading && !providersError && providers.length === 0 && (
              <EmptyState title="Нет провайдеров" hint="Создайте провайдер, указав module_type и connector" />
            )}
            {!providersLoading && !providersError && providers.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: 8 }}>ID</th>
                      <th style={{ textAlign: 'left', padding: 8 }}>Name</th>
                      <th style={{ textAlign: 'left', padding: 8 }}>Module</th>
                      <th style={{ textAlign: 'left', padding: 8 }}>Connector</th>
                      <th style={{ textAlign: 'left', padding: 8 }}>Health</th>
                      <th style={{ textAlign: 'left', padding: 8 }}>Updated</th>
                      <th style={{ textAlign: 'left', padding: 8 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers.map((p) => (
                      <tr key={p.provider_id} style={{ borderTop: '1px solid #eee' }}>
                        <td style={{ padding: 8 }}>{p.provider_id}</td>
                        <td style={{ padding: 8 }}>{p.name}</td>
                        <td style={{ padding: 8 }}>{p.module_type}</td>
                        <td style={{ padding: 8 }}>{p.connector}</td>
                        <td style={{ padding: 8 }}>
                          <span style={{ fontWeight: 600 }}>{p.health_status ?? 'unknown'}</span>
                          {p.last_seen_ts ? <div style={{ fontSize: 12, opacity: 0.7 }}>{formatTs(p.last_seen_ts)}</div> : null}
                        </td>
                        <td style={{ padding: 8 }}>{p.updated_at ? formatTs(p.updated_at) : '—'}</td>
                        <td style={{ padding: 8, display: 'flex', gap: 6 }}>
                          <button onClick={() => handleEdit(p)}>Edit</button>
                          <button onClick={() => handleDelete(p.provider_id)} style={{ color: '#b00' }}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{editingId ? 'Edit provider' : 'Create provider'}</div>
            {formError && <ErrorBanner message={formError} />}
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <span>Provider ID</span>
                <input
                  value={form.provider_id}
                  onChange={(e) => setForm({ ...form, provider_id: e.target.value })}
                  placeholder="brain-01"
                  disabled={!!editingId}
                />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span>Name</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Brain 01" />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span>Module type</span>
                <select
                  value={form.module_type}
                  onChange={(e) => setForm({ ...form, module_type: e.target.value })}
                >
                  <option value="">— select —</option>
                  {modules.map((m) => (
                    <option key={m.module_type} value={m.module_type}>
                      {m.module_type}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span>Connector</span>
                <select
                  value={form.connector}
                  onChange={(e) => setForm({ ...form, connector: e.target.value as FormState['connector'] })}
                >
                  {connectorOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span>Connector config (JSON)</span>
                <textarea
                  value={form.connector_config_text}
                  onChange={(e) => setForm({ ...form, connector_config_text: e.target.value })}
                  rows={5}
                  style={{ fontFamily: 'monospace' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span>Scope (JSON, optional)</span>
                <textarea
                  value={form.scope_text}
                  onChange={(e) => setForm({ ...form, scope_text: e.target.value })}
                  rows={3}
                  style={{ fontFamily: 'monospace' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span>Defaults (JSON, optional)</span>
                <textarea
                  value={form.defaults_text}
                  onChange={(e) => setForm({ ...form, defaults_text: e.target.value })}
                  rows={3}
                  style={{ fontFamily: 'monospace' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span>Mapping (JSON, optional)</span>
                <textarea
                  value={form.mapping_text}
                  onChange={(e) => setForm({ ...form, mapping_text: e.target.value })}
                  rows={3}
                  style={{ fontFamily: 'monospace' }}
                />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleSubmit} disabled={formSubmitting}>
                  {formSubmitting ? 'Saving…' : editingId ? 'Update provider' : 'Create provider'}
                </button>
                {editingId && (
                  <button type="button" onClick={resetForm} disabled={formSubmitting}>
                    Cancel edit
                  </button>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Quick signal ingest</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <span>Provider</span>
                <select value={quickProviderId} onChange={(e) => setQuickProviderId(e.target.value)}>
                  <option value="">— select provider —</option>
                  {providers.map((p) => (
                    <option key={p.provider_id} value={p.provider_id}>
                      {p.provider_id} · {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ display: 'grid', gap: 4, flex: 1 }}>
                  <span>Pair</span>
                  <input value={quickPair} onChange={(e) => setQuickPair(e.target.value)} placeholder="BTC/USDT" />
                </label>
                <label style={{ display: 'grid', gap: 4, width: 160 }}>
                  <span>Direction</span>
                  <select value={quickDirection} onChange={(e) => setQuickDirection(e.target.value as 'buy' | 'sell')}>
                    <option value="buy">buy</option>
                    <option value="sell">sell</option>
                  </select>
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ display: 'grid', gap: 4, flex: 1 }}>
                  <span>Confidence (0-1)</span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={quickConfidence}
                    onChange={(e) => {
                      const next = parseFloat(e.target.value)
                      setQuickConfidence(Number.isNaN(next) ? 0 : next)
                    }}
                  />
                </label>
                <label style={{ display: 'grid', gap: 4, width: 160 }}>
                  <span>TTL (sec)</span>
                  <input
                    type="number"
                    min="60"
                    step="60"
                    value={quickTtl}
                    onChange={(e) => {
                      const next = parseInt(e.target.value, 10)
                      setQuickTtl(Number.isNaN(next) ? 60 : next)
                    }}
                  />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={sendQuickSignal} disabled={quickBusy}>
                  {quickBusy ? 'Sending…' : 'Send demo signal'}
                </button>
                {quickMessage && <span style={{ fontSize: 12, opacity: 0.8 }}>{quickMessage}</span>}
              </div>
              {quickLastSignals && (
                <div style={{ fontSize: 12, background: '#fafafa', border: '1px solid #eee', borderRadius: 8, padding: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Last signals</div>
                  <pre style={{ margin: 0 }}>{JSON.stringify(quickLastSignals, null, 2)}</pre>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function formatTs(ts: string) {
  try {
    const d = new Date(ts)
    return d.toISOString()
  } catch (e) {
    return ts
  }
}
