import { useEffect, useMemo, useState } from 'react'

import Card from '../../shared/ui/Card'
import EmptyState from '../../shared/ui/EmptyState'
import ErrorBanner from '../../shared/ui/ErrorBanner'
import PageHeader from '../../shared/ui/PageHeader'
import {
  FreqAIModelVariant,
  StrategyAlignment,
  StrategyTemplate,
  createFreqAIModelVariant,
  createStrategyAlignment,
  createStrategyTemplate,
  deleteFreqAIModelVariant,
  deleteStrategyAlignment,
  deleteStrategyTemplate,
  exportAlignment,
  importStrategiesFromRepo,
  listFreqAIModelVariants,
  listStrategyAlignments,
  listStrategyTemplates,
  requestAgentAlignment,
  updateFreqAIModelVariant,
  updateStrategyAlignment,
  updateStrategyTemplate,
} from '../../services/api/strategylabApi'

type StrategyForm = {
  mode: 'create' | 'edit'
  strategy_id: string
  slug: string
  name: string
  source_url: string
  source_ref: string
  strategy_class: string
  description: string
  tags: string
  meta_text: string
}

type ModelForm = {
  mode: 'create' | 'edit'
  model_id: string
  slug: string
  name: string
  algorithm: string
  description: string
  tags: string
  config_text: string
}

type AlignmentForm = {
  mode: 'create' | 'edit'
  alignment_id: string
  strategy_id: string
  model_id: string
  profile: string
  status: string
  scope_text: string
  defaults_text: string
  mapping_text: string
  freqtrade_overrides_text: string
  freqai_overrides_text: string
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

function downloadTextFile(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function toTagsArray(tags: string): string[] {
  return tags
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function resetStrategyForm(): StrategyForm {
  return {
    mode: 'create',
    strategy_id: '',
    slug: '',
    name: '',
    source_url: 'https://github.com/iterativv/NostalgiaForInfinity',
    source_ref: '',
    strategy_class: '',
    description: '',
    tags: 'nfi',
    meta_text: '',
  }
}

function resetModelForm(): ModelForm {
  return {
    mode: 'create',
    model_id: '',
    slug: 'xgboost-default',
    name: 'XGBoost (default)',
    algorithm: 'xgboost',
    description: '',
    tags: 'xgboost',
    config_text: '{\n  "class": "XGBoostRegressor"\n}',
  }
}

function resetAlignmentForm(): AlignmentForm {
  return {
    mode: 'create',
    alignment_id: '',
    strategy_id: '',
    model_id: '',
    profile: 'default',
    status: 'draft',
    scope_text: '',
    defaults_text: '',
    mapping_text: '',
    freqtrade_overrides_text: '',
    freqai_overrides_text: '',
  }
}

export default function CombinatorPage() {
  const [strategies, setStrategies] = useState<StrategyTemplate[]>([])
  const [models, setModels] = useState<FreqAIModelVariant[]>([])
  const [alignments, setAlignments] = useState<StrategyAlignment[]>([])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [strategyConfigBarOpen, setStrategyConfigBarOpen] = useState(false)
  const [modelConfigBarOpen, setModelConfigBarOpen] = useState(false)
  const [configExportBusy, setConfigExportBusy] = useState(false)
  const [freqtradeConfigText, setFreqtradeConfigText] = useState<string>('')
  const [freqaiConfigText, setFreqaiConfigText] = useState<string>('')

  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('')
  const [selectedModelId, setSelectedModelId] = useState<string>('')
  const [selectedAlignmentId, setSelectedAlignmentId] = useState<string>('')

  const [strategyForm, setStrategyForm] = useState<StrategyForm>(() => resetStrategyForm())
  const [modelForm, setModelForm] = useState<ModelForm>(() => resetModelForm())
  const [alignmentForm, setAlignmentForm] = useState<AlignmentForm>(() => resetAlignmentForm())

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const strategyById = useMemo(() => new Map(strategies.map((s) => [s.strategy_id, s])), [strategies])
  const modelById = useMemo(() => new Map(models.map((m) => [m.model_id, m])), [models])

  const filteredAlignments = useMemo(() => {
    if (!selectedStrategyId && !selectedModelId) return alignments
    return alignments.filter((a) => {
      if (selectedStrategyId && a.strategy_id !== selectedStrategyId) return false
      if (selectedModelId && a.model_id !== selectedModelId) return false
      return true
    })
  }, [alignments, selectedModelId, selectedStrategyId])

  const configAlignmentId = useMemo(() => {
    if (selectedAlignmentId) return selectedAlignmentId
    if (filteredAlignments.length >= 1) return filteredAlignments[0].alignment_id
    return ''
  }, [filteredAlignments, selectedAlignmentId])

  async function loadAll() {
    setError(null)
    try {
      const [s, m, a] = await Promise.all([listStrategyTemplates(), listFreqAIModelVariants(), listStrategyAlignments()])
      setStrategies(s)
      setModels(m)
      setAlignments(a)

      // Keep selections coherent if items were deleted
      if (selectedStrategyId && !s.some((x) => x.strategy_id === selectedStrategyId)) {
        setSelectedStrategyId('')
        setStrategyForm(resetStrategyForm())
      }
      if (selectedModelId && !m.some((x) => x.model_id === selectedModelId)) {
        setSelectedModelId('')
        setModelForm(resetModelForm())
      }
      if (selectedAlignmentId && !a.some((x) => x.alignment_id === selectedAlignmentId)) {
        setSelectedAlignmentId('')
        setAlignmentForm((prev) => ({ ...resetAlignmentForm(), strategy_id: prev.strategy_id, model_id: prev.model_id }))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    }
  }

  function applyStrategySelection(strategy_id: string) {
    setSelectedStrategyId(strategy_id)
    if (!strategy_id) {
      setStrategyForm(resetStrategyForm())
      setSelectedAlignmentId('')
      setAlignmentForm((prev) => ({ ...resetAlignmentForm(), strategy_id: '', model_id: prev.model_id }))
      return
    }
    const s = strategyById.get(strategy_id)
    if (!s) return
    setStrategyForm({
      mode: 'edit',
      strategy_id: s.strategy_id,
      slug: s.slug,
      name: s.name,
      source_url: s.source_url,
      source_ref: s.source_ref ?? '',
      strategy_class: s.strategy_class ?? '',
      description: s.description ?? '',
      tags: (s.tags || []).join(', '),
      meta_text: prettyJson(s.meta),
    })
    // Sync alignment builder with current selection when it is in create mode
    setAlignmentForm((prev) => (prev.mode === 'create' ? { ...prev, strategy_id } : prev))
  }

  function applyModelSelection(model_id: string) {
    setSelectedModelId(model_id)
    if (!model_id) {
      setModelForm(resetModelForm())
      setSelectedAlignmentId('')
      setAlignmentForm((prev) => ({ ...resetAlignmentForm(), model_id: '', strategy_id: prev.strategy_id }))
      return
    }
    const m = modelById.get(model_id)
    if (!m) return
    setModelForm({
      mode: 'edit',
      model_id: m.model_id,
      slug: m.slug,
      name: m.name,
      algorithm: m.algorithm,
      description: m.description ?? '',
      tags: (m.tags || []).join(', '),
      config_text: prettyJson(m.config),
    })
    setAlignmentForm((prev) => (prev.mode === 'create' ? { ...prev, model_id } : prev))
  }

  function applyAlignmentSelection(alignment_id: string) {
    setSelectedAlignmentId(alignment_id)
    if (!alignment_id) {
      setAlignmentForm((prev) => ({ ...resetAlignmentForm(), strategy_id: prev.strategy_id, model_id: prev.model_id }))
      return
    }
    const a = alignments.find((x) => x.alignment_id === alignment_id)
    if (!a) return
    setAlignmentForm({
      mode: 'edit',
      alignment_id: a.alignment_id,
      strategy_id: a.strategy_id,
      model_id: a.model_id,
      profile: a.profile ?? 'default',
      status: a.status,
      scope_text: prettyJson(a.scope),
      defaults_text: prettyJson(a.defaults),
      mapping_text: prettyJson(a.mapping),
      freqtrade_overrides_text: prettyJson(a.freqtrade_overrides),
      freqai_overrides_text: prettyJson(a.freqai_overrides),
    })
    setSelectedStrategyId(a.strategy_id)
    setSelectedModelId(a.model_id)
    const s = strategyById.get(a.strategy_id)
    if (s) {
      setStrategyForm({
        mode: 'edit',
        strategy_id: s.strategy_id,
        slug: s.slug,
        name: s.name,
        source_url: s.source_url,
        source_ref: s.source_ref ?? '',
        strategy_class: s.strategy_class ?? '',
        description: s.description ?? '',
        tags: (s.tags || []).join(', '),
        meta_text: prettyJson(s.meta),
      })
    }
    const m = modelById.get(a.model_id)
    if (m) {
      setModelForm({
        mode: 'edit',
        model_id: m.model_id,
        slug: m.slug,
        name: m.name,
        algorithm: m.algorithm,
        description: m.description ?? '',
        tags: (m.tags || []).join(', '),
        config_text: prettyJson(m.config),
      })
    }
  }

  async function saveStrategy() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      let meta: Record<string, unknown> = {}
      if (strategyForm.meta_text.trim()) {
        try {
          meta = JSON.parse(strategyForm.meta_text)
        } catch {
          throw new Error('meta: invalid JSON')
        }
      }

      const payload = {
        slug: strategyForm.slug.trim(),
        name: strategyForm.name.trim(),
        source_type: 'git',
        source_url: strategyForm.source_url.trim(),
        source_ref: strategyForm.source_ref.trim() || null,
        strategy_class: strategyForm.strategy_class.trim() || null,
        description: strategyForm.description.trim() || null,
        tags: toTagsArray(strategyForm.tags),
        meta,
      }

      if (!payload.slug || !payload.name || !payload.source_url) throw new Error('slug, name, source_url are required')

      if (strategyForm.mode === 'create') {
        await createStrategyTemplate(payload)
        setMessage('Strategy created')
      } else {
        const full: StrategyTemplate = {
          strategy_id: strategyForm.strategy_id,
          ...payload,
          meta: payload.meta,
          tags: payload.tags,
        }
        await updateStrategyTemplate(full)
        setMessage('Strategy saved')
      }

      await loadAll()
      // keep selection (if edited), or reset (if created)
      if (strategyForm.mode === 'create') {
        setSelectedStrategyId('')
        setStrategyForm(resetStrategyForm())
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save strategy')
    } finally {
      setBusy(false)
    }
  }

  async function deleteSelectedStrategy() {
    if (!selectedStrategyId) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await deleteStrategyTemplate(selectedStrategyId)
      setMessage('Strategy deleted')
      setSelectedStrategyId('')
      setStrategyForm(resetStrategyForm())
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setBusy(false)
    }
  }

  async function saveModel() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      let config: Record<string, unknown> = {}
      if (modelForm.config_text.trim()) {
        try {
          config = JSON.parse(modelForm.config_text)
        } catch {
          throw new Error('config: invalid JSON')
        }
      }

      const payload = {
        slug: modelForm.slug.trim(),
        name: modelForm.name.trim(),
        algorithm: modelForm.algorithm.trim(),
        config,
        description: modelForm.description.trim() || null,
        tags: toTagsArray(modelForm.tags),
      }

      if (!payload.slug || !payload.name || !payload.algorithm) throw new Error('slug, name, algorithm are required')

      if (modelForm.mode === 'create') {
        await createFreqAIModelVariant(payload)
        setMessage('Model variant created')
      } else {
        const full: FreqAIModelVariant = { model_id: modelForm.model_id, ...payload, tags: payload.tags }
        await updateFreqAIModelVariant(full)
        setMessage('Model variant saved')
      }

      await loadAll()
      if (modelForm.mode === 'create') {
        setSelectedModelId('')
        setModelForm(resetModelForm())
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save model variant')
    } finally {
      setBusy(false)
    }
  }

  async function deleteSelectedModel() {
    if (!selectedModelId) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await deleteFreqAIModelVariant(selectedModelId)
      setMessage('Model variant deleted')
      setSelectedModelId('')
      setModelForm(resetModelForm())
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setBusy(false)
    }
  }

  async function saveAlignment(override?: { strategy_id: string; model_id: string }) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      let scope: Record<string, unknown> | undefined
      let defaults: Record<string, unknown> | undefined
      let mapping: Record<string, unknown> | undefined
      let freqtrade_overrides: Record<string, unknown> = {}
      let freqai_overrides: Record<string, unknown> = {}

      try {
        scope = alignmentForm.scope_text ? safeParse(alignmentForm.scope_text) : undefined
      } catch {
        throw new Error('scope: invalid JSON')
      }
      try {
        defaults = alignmentForm.defaults_text ? safeParse(alignmentForm.defaults_text) : undefined
      } catch {
        throw new Error('defaults: invalid JSON')
      }
      try {
        mapping = alignmentForm.mapping_text ? safeParse(alignmentForm.mapping_text) : undefined
      } catch {
        throw new Error('mapping: invalid JSON')
      }
      try {
        freqtrade_overrides = alignmentForm.freqtrade_overrides_text
          ? safeParse(alignmentForm.freqtrade_overrides_text) || {}
          : {}
      } catch {
        throw new Error('freqtrade_overrides: invalid JSON')
      }
      try {
        freqai_overrides = alignmentForm.freqai_overrides_text ? safeParse(alignmentForm.freqai_overrides_text) || {} : {}
      } catch {
        throw new Error('freqai_overrides: invalid JSON')
      }

      const payload = {
        strategy_id: override?.strategy_id ?? alignmentForm.strategy_id,
        model_id: override?.model_id ?? alignmentForm.model_id,
        profile: alignmentForm.profile.trim() || null,
        status: alignmentForm.status.trim() || 'draft',
        scope: scope ?? null,
        defaults: defaults ?? null,
        mapping: mapping ?? null,
        freqtrade_overrides,
        freqai_overrides,
      }

      if (!payload.strategy_id || !payload.model_id) throw new Error('strategy_id and model_id are required')

      if (alignmentForm.mode === 'create') {
        await createStrategyAlignment(payload)
        setMessage('Alignment created')
        setSelectedAlignmentId('')
        setAlignmentForm({ ...resetAlignmentForm(), strategy_id: payload.strategy_id, model_id: payload.model_id })
      } else {
        const full: StrategyAlignment = {
          alignment_id: alignmentForm.alignment_id,
          ...payload,
          scope: payload.scope,
          defaults: payload.defaults,
          mapping: payload.mapping,
        }
        await updateStrategyAlignment(full)
        setMessage('Alignment saved')
      }

      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save alignment')
    } finally {
      setBusy(false)
    }
  }

  async function deleteSelectedAlignment() {
    if (!selectedAlignmentId) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await deleteStrategyAlignment(selectedAlignmentId)
      setMessage('Alignment deleted')
      setSelectedAlignmentId('')
      setAlignmentForm((prev) => ({ ...resetAlignmentForm(), strategy_id: prev.strategy_id, model_id: prev.model_id }))
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setBusy(false)
    }
  }

  async function askAgentsForSelectedAlignment() {
    if (!selectedAlignmentId) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await requestAgentAlignment(selectedAlignmentId)
      setMessage(`Queued agent task: ${res.task_id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to enqueue task')
    } finally {
      setBusy(false)
    }
  }

  async function importNfiStrategies() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await importStrategiesFromRepo({
        repo_url: 'https://github.com/iterativv/NostalgiaForInfinity',
        limit: 10,
        tag: 'nfi',
      })
      setMessage(`Imported: ${res.imported.length}, skipped: ${res.skipped.length}, detected: ${res.detected}`)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import strategies')
    } finally {
      setBusy(false)
    }
  }

  async function createPresetModelVariant(preset: 'xgboost' | 'lightgbm' | 'catboost') {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const presets = {
        xgboost: {
          slug: 'xgboost-default',
          name: 'XGBoost (default)',
          algorithm: 'xgboost',
          config: { class: 'XGBoostRegressor' },
          description: 'Default xgboost starter config',
          tags: ['xgboost', 'default'],
        },
        lightgbm: {
          slug: 'lightgbm-default',
          name: 'LightGBM (default)',
          algorithm: 'lightgbm',
          config: { class: 'LGBMRegressor' },
          description: 'Default lightgbm starter config',
          tags: ['lightgbm', 'default'],
        },
        catboost: {
          slug: 'catboost-default',
          name: 'CatBoost (default)',
          algorithm: 'catboost',
          config: { class: 'CatBoostRegressor' },
          description: 'Default catboost starter config',
          tags: ['catboost', 'default'],
        },
      } as const

      const p = presets[preset]
      await createFreqAIModelVariant({
        slug: p.slug,
        name: p.name,
        algorithm: p.algorithm,
        config: p.config,
        description: p.description,
        tags: [...p.tags],
      })
      setMessage(`Model variant created: ${p.slug}`)
      await loadAll()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create model'
      // existing http client returns generic "HTTP 409" for conflicts
      if (msg.includes('HTTP 409')) {
        setMessage('Model variant already exists')
        await loadAll()
      } else {
        setError(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  async function loadFreqtradeConfig(alignment_id: string) {
    if (!alignment_id) return
    setConfigExportBusy(true)
    setError(null)
    try {
      const res = await exportAlignment(alignment_id)
      setFreqtradeConfigText(JSON.stringify(res.freqtrade ?? {}, null, 2))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to export freqtrade config file')
    } finally {
      setConfigExportBusy(false)
    }
  }

  async function loadFreqaiConfig(alignment_id: string) {
    if (!alignment_id) return
    setConfigExportBusy(true)
    setError(null)
    try {
      const res = await exportAlignment(alignment_id)
      setFreqaiConfigText(JSON.stringify(res.freqai ?? {}, null, 2))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to export freqai config file')
    } finally {
      setConfigExportBusy(false)
    }
  }

  async function openStrategyConfig() {
    setStrategyConfigBarOpen(true)
    if (!configAlignmentId) return
    if (configAlignmentId !== selectedAlignmentId) {
      applyAlignmentSelection(configAlignmentId)
    }
    await loadFreqtradeConfig(configAlignmentId)
  }

  async function openModelConfig() {
    setModelConfigBarOpen(true)
    if (!configAlignmentId) return
    if (configAlignmentId !== selectedAlignmentId) {
      applyAlignmentSelection(configAlignmentId)
    }
    await loadFreqaiConfig(configAlignmentId)
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PageHeader
        title="Strategy Lab · Combinator"
        description="Рабочий стол: выбери стратегию + её конфиг, модель + её конфиг, затем сохрани сонастройку (alignment) и при необходимости попроси агентов предложить настройки."
      />

      {error ? <ErrorBanner message={error} onRetry={() => void loadAll()} /> : null}


      {message ? (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.9 }}>{message}</div>
            <button
              onClick={() => setMessage(null)}
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)' }}
            >
              Dismiss
            </button>
          </div>
        </Card>
      ) : null}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
            <div style={{ fontWeight: 700 }}>Strategy</div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <button
              disabled={busy}
              onClick={() => void importNfiStrategies()}
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)' }}
            >
              Import NFI strategies
            </button>
          </div>

          {strategies.length === 0 ? (
            <EmptyState title="No strategies" hint="Добавьте стратегию (например NFI)" />
          ) : (
            <label style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
              <span>Pick strategy</span>
              <select value={selectedStrategyId} onChange={(e) => applyStrategySelection(e.target.value)}>
                <option value="">New…</option>
                {strategies.map((s) => (
                  <option key={s.strategy_id} value={s.strategy_id}>
                    {s.slug} · {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
            <div style={{ display: 'grid', gap: 2 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Selected</div>
              <div style={{ fontWeight: 700 }}>
                {selectedStrategyId ? strategyById.get(selectedStrategyId)?.slug ?? selectedStrategyId : '—'}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => void openStrategyConfig()}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  opacity: selectedStrategyId && configAlignmentId ? 0.95 : 0.6,
                  cursor: selectedStrategyId && configAlignmentId ? 'pointer' : 'not-allowed',
                }}
                title={!configAlignmentId ? 'Нужен alignment (выбери или создай)' : undefined}
                disabled={!selectedStrategyId || !configAlignmentId}
              >
                Config
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Slug</span>
              <input value={strategyForm.slug} onChange={(e) => setStrategyForm({ ...strategyForm, slug: e.target.value })} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Name</span>
              <input value={strategyForm.name} onChange={(e) => setStrategyForm({ ...strategyForm, name: e.target.value })} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Git URL</span>
              <input value={strategyForm.source_url} onChange={(e) => setStrategyForm({ ...strategyForm, source_url: e.target.value })} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Git ref (optional)</span>
              <input
                value={strategyForm.source_ref}
                onChange={(e) => setStrategyForm({ ...strategyForm, source_ref: e.target.value })}
                placeholder="main / tag / commit"
              />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Strategy class (optional)</span>
              <input
                value={strategyForm.strategy_class}
                onChange={(e) => setStrategyForm({ ...strategyForm, strategy_class: e.target.value })}
                placeholder="NostalgiaForInfinityX"
              />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Tags</span>
              <input value={strategyForm.tags} onChange={(e) => setStrategyForm({ ...strategyForm, tags: e.target.value })} placeholder="nfi, trend" />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Meta (JSON, optional)</span>
              <textarea
                value={strategyForm.meta_text}
                onChange={(e) => setStrategyForm({ ...strategyForm, meta_text: e.target.value })}
                rows={6}
                style={{ fontFamily: 'monospace' }}
              />
            </label>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                disabled={busy}
                onClick={() => void saveStrategy()}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
              >
                {busy ? 'Saving…' : strategyForm.mode === 'create' ? 'Create' : 'Save'}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setSelectedStrategyId('')
                  setStrategyForm(resetStrategyForm())
                  setSelectedAlignmentId('')
                  setAlignmentForm((prev) => ({ ...resetAlignmentForm(), strategy_id: '', model_id: prev.model_id }))
                }}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
              >
                New
              </button>
              <button
                disabled={busy || !selectedStrategyId}
                onClick={() => void deleteSelectedStrategy()}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
              >
                Delete
              </button>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
            <div style={{ fontWeight: 700 }}>Model</div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <button
              disabled={busy}
              onClick={() => void createPresetModelVariant('xgboost')}
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)' }}
            >
              Create XGBoost default
            </button>
            <button
              disabled={busy}
              onClick={() => void createPresetModelVariant('lightgbm')}
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)' }}
            >
              Create LightGBM default
            </button>
            <button
              disabled={busy}
              onClick={() => void createPresetModelVariant('catboost')}
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)' }}
            >
              Create CatBoost default
            </button>
          </div>

          {models.length === 0 ? (
            <EmptyState title="No model variants" hint="Добавьте вариант модели (например xgboost)" />
          ) : (
            <label style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
              <span>Pick model variant</span>
              <select value={selectedModelId} onChange={(e) => applyModelSelection(e.target.value)}>
                <option value="">New…</option>
                {models.map((m) => (
                  <option key={m.model_id} value={m.model_id}>
                    {m.slug} · {m.algorithm}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
            <div style={{ display: 'grid', gap: 2 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Selected</div>
              <div style={{ fontWeight: 700 }}>
                {selectedModelId ? modelById.get(selectedModelId)?.slug ?? selectedModelId : '—'}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => void openModelConfig()}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  opacity: selectedModelId && configAlignmentId ? 0.95 : 0.6,
                  cursor: selectedModelId && configAlignmentId ? 'pointer' : 'not-allowed',
                }}
                title={!configAlignmentId ? 'Нужен alignment (выбери или создай)' : undefined}
                disabled={!selectedModelId || !configAlignmentId}
              >
                Config
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Slug</span>
              <input value={modelForm.slug} onChange={(e) => setModelForm({ ...modelForm, slug: e.target.value })} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Name</span>
              <input value={modelForm.name} onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Algorithm</span>
              <input value={modelForm.algorithm} onChange={(e) => setModelForm({ ...modelForm, algorithm: e.target.value })} placeholder="xgboost" />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Tags</span>
              <input value={modelForm.tags} onChange={(e) => setModelForm({ ...modelForm, tags: e.target.value })} placeholder="xgboost, fast" />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Config (JSON)</span>
              <textarea
                value={modelForm.config_text}
                onChange={(e) => setModelForm({ ...modelForm, config_text: e.target.value })}
                rows={10}
                style={{ fontFamily: 'monospace' }}
              />
            </label>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                disabled={busy}
                onClick={() => void saveModel()}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
              >
                {busy ? 'Saving…' : modelForm.mode === 'create' ? 'Create' : 'Save'}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setSelectedModelId('')
                  setModelForm(resetModelForm())
                  setSelectedAlignmentId('')
                  setAlignmentForm((prev) => ({ ...resetAlignmentForm(), model_id: '', strategy_id: prev.strategy_id }))
                }}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
              >
                New
              </button>
              <button
                disabled={busy || !selectedModelId}
                onClick={() => void deleteSelectedModel()}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
              >
                Delete
              </button>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Alignment</div>

          {filteredAlignments.length === 0 ? (
            <EmptyState title="No alignments" hint="Выбери стратегию и модель, затем создай сонастройку" />
          ) : (
            <label style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
              <span>Pick alignment</span>
              <select value={selectedAlignmentId} onChange={(e) => applyAlignmentSelection(e.target.value)}>
                <option value="">New…</option>
                {filteredAlignments.map((a) => {
                  const s = strategyById.get(a.strategy_id)
                  const m = modelById.get(a.model_id)
                  const label = `${s?.slug ?? a.strategy_id} + ${m?.slug ?? a.model_id} · ${a.status}`
                  return (
                    <option key={a.alignment_id} value={a.alignment_id}>
                      {label}
                    </option>
                  )
                })}
              </select>
            </label>
          )}

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Selected pair</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                <span style={{ fontFamily: 'monospace' }}>{selectedStrategyId ? strategyById.get(selectedStrategyId)?.slug ?? selectedStrategyId : '— strategy —'}</span>
                <span>+</span>
                <span style={{ fontFamily: 'monospace' }}>{selectedModelId ? modelById.get(selectedModelId)?.slug ?? selectedModelId : '— model —'}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 4, flex: 1, minWidth: 200 }}>
                <span>FreqAI profile</span>
                <input value={alignmentForm.profile} onChange={(e) => setAlignmentForm({ ...alignmentForm, profile: e.target.value })} />
              </label>
              <label style={{ display: 'grid', gap: 4, width: 180 }}>
                <span>Status</span>
                <input value={alignmentForm.status} onChange={(e) => setAlignmentForm({ ...alignmentForm, status: e.target.value })} />
              </label>
            </div>

            <label style={{ display: 'grid', gap: 4 }}>
              <span>Scope (JSON, optional)</span>
              <textarea
                value={alignmentForm.scope_text}
                onChange={(e) => setAlignmentForm({ ...alignmentForm, scope_text: e.target.value })}
                rows={4}
                style={{ fontFamily: 'monospace' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Defaults (JSON, optional)</span>
              <textarea
                value={alignmentForm.defaults_text}
                onChange={(e) => setAlignmentForm({ ...alignmentForm, defaults_text: e.target.value })}
                rows={6}
                style={{ fontFamily: 'monospace' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Mapping (JSON, optional)</span>
              <textarea
                value={alignmentForm.mapping_text}
                onChange={(e) => setAlignmentForm({ ...alignmentForm, mapping_text: e.target.value })}
                rows={8}
                style={{ fontFamily: 'monospace' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Freqtrade overrides (JSON)</span>
              <textarea
                value={alignmentForm.freqtrade_overrides_text}
                onChange={(e) => setAlignmentForm({ ...alignmentForm, freqtrade_overrides_text: e.target.value })}
                rows={6}
                style={{ fontFamily: 'monospace' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>FreqAI overrides (JSON)</span>
              <textarea
                value={alignmentForm.freqai_overrides_text}
                onChange={(e) => setAlignmentForm({ ...alignmentForm, freqai_overrides_text: e.target.value })}
                rows={6}
                style={{ fontFamily: 'monospace' }}
              />
            </label>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                disabled={busy || !selectedStrategyId || !selectedModelId}
                onClick={() => void saveAlignment({ strategy_id: selectedStrategyId, model_id: selectedModelId })}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
              >
                {busy ? 'Saving…' : alignmentForm.mode === 'create' ? 'Create' : 'Save'}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setSelectedAlignmentId('')
                  setAlignmentForm({ ...resetAlignmentForm(), strategy_id: selectedStrategyId, model_id: selectedModelId })
                }}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
              >
                New
              </button>
              <button
                disabled={busy || !selectedAlignmentId}
                onClick={() => void askAgentsForSelectedAlignment()}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
              >
                Ask agents
              </button>
              <button
                disabled={busy || !selectedAlignmentId}
                onClick={() => void deleteSelectedAlignment()}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
              >
                Delete
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* Strategy config file drawer (freqtrade) */}
      <div
        aria-hidden={!strategyConfigBarOpen}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          width: 'min(560px, 92vw)',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          transform: strategyConfigBarOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 180ms ease',
          zIndex: 50,
          padding: 12,
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
          gap: 10,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'grid', gap: 2 }}>
            <div style={{ fontWeight: 800 }}>Strategy config file</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Freqtrade config JSON (по выбранному alignment)</div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              disabled={!configAlignmentId || configExportBusy}
              onClick={() => (configAlignmentId ? void loadFreqtradeConfig(configAlignmentId) : undefined)}
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            >
              {configExportBusy ? 'Loading…' : 'Load'}
            </button>
            <button
              disabled={!freqtradeConfigText.trim()}
              onClick={() => {
                const strategySlug = selectedStrategyId ? strategyById.get(selectedStrategyId)?.slug ?? 'strategy' : 'strategy'
                downloadTextFile(`freqtrade.${strategySlug}.config.json`, freqtradeConfigText, 'application/json')
              }}
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            >
              Download
            </button>
            <button
              onClick={() => setStrategyConfigBarOpen(false)}
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            >
              Close
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            alignment: <span style={{ fontFamily: 'monospace' }}>{configAlignmentId || '—'}</span>
          </div>
          <textarea
            value={freqtradeConfigText}
            readOnly
            placeholder={configAlignmentId ? 'Нажми Load чтобы получить freqtrade config…' : 'Выбери/создай alignment чтобы загрузить freqtrade config…'}
            rows={28}
            style={{ width: '100%', fontFamily: 'monospace' }}
          />
        </div>
      </div>

      {/* Model config file drawer (freqai) */}
      <div
        aria-hidden={!modelConfigBarOpen}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          width: 'min(560px, 92vw)',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          transform: modelConfigBarOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 180ms ease',
          zIndex: 50,
          padding: 12,
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
          gap: 10,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'grid', gap: 2 }}>
            <div style={{ fontWeight: 800 }}>Model config file</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>FreqAI config JSON (по выбранному alignment)</div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              disabled={!configAlignmentId || configExportBusy}
              onClick={() => (configAlignmentId ? void loadFreqaiConfig(configAlignmentId) : undefined)}
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            >
              {configExportBusy ? 'Loading…' : 'Load'}
            </button>
            <button
              disabled={!freqaiConfigText.trim()}
              onClick={() => {
                const modelSlug = selectedModelId ? modelById.get(selectedModelId)?.slug ?? 'model' : 'model'
                downloadTextFile(`freqai.${modelSlug}.config.json`, freqaiConfigText, 'application/json')
              }}
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            >
              Download
            </button>
            <button
              onClick={() => setModelConfigBarOpen(false)}
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            >
              Close
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            alignment: <span style={{ fontFamily: 'monospace' }}>{configAlignmentId || '—'}</span>
          </div>
          <textarea
            value={freqaiConfigText}
            readOnly
            placeholder={configAlignmentId ? 'Нажми Load чтобы получить freqai config…' : 'Выбери/создай alignment чтобы загрузить freqai config…'}
            rows={28}
            style={{ width: '100%', fontFamily: 'monospace' }}
          />
        </div>
      </div>
    </div>
  )
}
