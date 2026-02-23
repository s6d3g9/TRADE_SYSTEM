import { useEffect, useMemo, useState } from 'react'

import Card from '../../shared/ui/Card'
import EmptyState from '../../shared/ui/EmptyState'
import ErrorBanner from '../../shared/ui/ErrorBanner'
import PageHeader from '../../shared/ui/PageHeader'
import {
  ConfigFile,
  FreqAIModelVariant,
  StrategyAlignment,
  StrategyTemplate,
  generateBotFromAlignment,
  importStrategiesFromRepo,
  listConfigs,
  createConfig,
  activateConfig,
  listFreqAIModelVariants,
  listStrategyAlignments,
  listStrategyTemplates,
  createStrategyAlignment,
  createStrategyTemplate,
  createFreqAIModelVariant,
} from '../../services/api/strategylabApi'
import { listStoreItems, purchaseStoreItem } from '../../services/api/storeApi'

interface Bot {
  bot_id: string
  name: string
  config_path: string
  created_at: string
  alignment_id?: string
  status?: string
  exchange?: string
  mode?: string

  current_session?: {
    session_id: string
    started_at: string
    stopped_at: string | null
    status: string
  } | null

  stats?: {
    total_runtime_seconds: number
    total_trades: number
  }

  session_stats?: {
    runtime_seconds: number
    total_trades: number
    open_positions: number
  }
}

interface Backtest {
  id: string
  filename: string
  strategy_name: string
  pair: string
  timeframe: string
  total_trades: number
  win_rate: number
  profit_factor: number
  max_drawdown: number
  sharpe_ratio: number
  total_return: number
  avg_trade: number
  period: string
  backtest_start: string
  backtest_end: string
  created_at: number
}

export default function CombinatorPageSimple() {
  const [strategies, setStrategies] = useState<StrategyTemplate[]>([])
  const [models, setModels] = useState<FreqAIModelVariant[]>([])
  const [alignments, setAlignments] = useState<StrategyAlignment[]>([])
  const [bots, setBots] = useState<Bot[]>([])
  const [backtests, setBacktests] = useState<Backtest[]>([])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('')
  const [selectedModelId, setSelectedModelId] = useState<string>('')
  const [selectedAlignmentId, setSelectedAlignmentId] = useState<string>('')
  const [alignmentScore, setAlignmentScore] = useState<any>(null)
  const [alignmentLoading, setAlignmentLoading] = useState(false)

  const [generateBusy, setGenerateBusy] = useState(false)
  const [botsExpanded, setBotsExpanded] = useState(true)
  const [backtestsExpanded, setBacktestsExpanded] = useState(true)
  const [showTimerModal, setShowTimerModal] = useState<string | null>(null)
  
  // Strategy and Model popup menus
  const [showStrategyMenu, setShowStrategyMenu] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [hoveredStrategyGroup, setHoveredStrategyGroup] = useState<string | null>(null)
  const [hoveredModelGroup, setHoveredModelGroup] = useState<string | null>(null)
  
  // Variation editor
  const [showEditor, setShowEditor] = useState(false)
  const [editorType, setEditorType] = useState<'strategy' | 'model'>('strategy')
  const [editorName, setEditorName] = useState('')
  const [editorCode, setEditorCode] = useState('')
  const [baseItem, setBaseItem] = useState<StrategyTemplate | FreqAIModelVariant | null>(null)
  
  // Store modal
  const [showStore, setShowStore] = useState(false)
  const [storeType, setStoreType] = useState<'strategy' | 'model'>('strategy')
  const [storeItems, setStoreItems] = useState<any[]>([])
  const [storeLoading, setStoreLoading] = useState(false)
  
  // Sliding drawer for configs
  const [configDrawerOpen, setConfigDrawerOpen] = useState(false)
  const [configItems, setConfigItems] = useState<ConfigFile[]>([])
  const [configOwnerScope, setConfigOwnerScope] = useState<'strategy' | 'model' | 'alignment'>('alignment')
  const [configOwnerId, setConfigOwnerId] = useState<string>('')
  const [configContentText, setConfigContentText] = useState<string>('')
  const [configFilename, setConfigFilename] = useState<string>('config.json')

  useEffect(() => {
    void loadAll()
  }, [])

  // Reuse the existing modal hook as a minimal "sync" action.
  useEffect(() => {
    if (!showTimerModal) return
    void syncBotTrades(showTimerModal)
    setShowTimerModal(null)
  }, [showTimerModal])

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-menu-container]')) {
        setShowStrategyMenu(false)
        setShowModelMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const strategyById = useMemo(() => new Map(strategies.map((s) => [s.strategy_id, s])), [strategies])
  const modelById = useMemo(() => new Map(models.map((m) => [m.model_id, m])), [models])

  function formatDuration(totalSeconds?: number | null) {
    if (totalSeconds === null || totalSeconds === undefined) return '-'
    const seconds = Math.max(0, Math.floor(totalSeconds))
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  function formatDateTime(iso?: string | null) {
    if (!iso) return '-'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleString()
  }

  // Group strategies by base name (everything before version/variant suffix)
  const strategyGroups = useMemo(() => {
    const groups = new Map<string, StrategyTemplate[]>()
    strategies.forEach(s => {
      // If variation, use base_slug from meta
      let baseName: string
      if (s.meta && typeof s.meta === 'object' && 'base_slug' in s.meta && typeof s.meta.base_slug === 'string' && s.meta.base_slug) {
        baseName = s.meta.base_slug
      } else {
        // Remove version suffixes: X, X2-X9, Next, NextGen, v1-v9
        // Keep the base name intact (e.g., NostalgiaForInfinityX becomes NostalgiaForInfinity)
        baseName = s.slug.replace(/(x\d*)$/i, '').replace(/(next|nextgen)$/i, '').replace(/(v\d+)$/i, '').replace(/(-\d{13})+$/g, '') || s.slug
      }
      if (!groups.has(baseName)) {
        groups.set(baseName, [])
      }
      groups.get(baseName)!.push(s)
    })
    return groups
  }, [strategies])

  // Group models by algorithm
  const modelGroups = useMemo(() => {
    const groups = new Map<string, FreqAIModelVariant[]>()
    models.forEach(m => {
      // If variation, use base_slug from config, otherwise use slug as-is
      let groupKey: string
      if (m.config && typeof m.config === 'object' && 'base_slug' in m.config && typeof m.config.base_slug === 'string' && m.config.base_slug) {
        groupKey = m.config.base_slug
      } else {
        // Only remove timestamp suffixes, keep everything else
        groupKey = m.slug.replace(/(-\d{13})+$/g, '') || m.slug
      }
      if (!groups.has(groupKey)) {
        groups.set(groupKey, [])
      }
      groups.get(groupKey)!.push(m)
    })
    return groups
  }, [models])

  const filteredAlignments = useMemo(() => {
    if (!selectedStrategyId && !selectedModelId) return alignments
    return alignments.filter((a) => {
      if (selectedStrategyId && a.strategy_id !== selectedStrategyId) return false
      if (selectedModelId && a.model_id !== selectedModelId) return false
      return true
    })
  }, [alignments, selectedModelId, selectedStrategyId])

  async function loadAll() {
    setError(null)
    try {
      const [s, m, a, botsRes, backtestsRes] = await Promise.all([
        listStrategyTemplates(),
        listFreqAIModelVariants(),
        listStrategyAlignments(),
        fetch('/api/trading/bots'),
        fetch('/api/strategylab/backtests?limit=50'),
      ])
      setStrategies(s)
      setModels(m)
      setAlignments(a)
      
      if (botsRes.ok) {
        const botsData = await botsRes.json()

        const botsEnriched = await Promise.all(
          botsData.map(async (bot: Bot) => {
            try {
              const statusRes = await fetch(`/api/trading/bots/${bot.bot_id}/container-status`)
              if (!statusRes.ok) return bot
              const statusData = await statusRes.json()

              const statsRes = await fetch(`/api/trading/bots/${bot.bot_id}/stats`)
              let merged: Bot = { ...bot, status: statusData.status }

              if (statsRes.ok) {
                const statsData = await statsRes.json()
                merged = {
                  ...merged,
                  stats: {
                    total_runtime_seconds: statsData.total_runtime_seconds,
                    total_trades: statsData.total_trades,
                  },
                }
              }

              const sessionId = merged.current_session?.session_id
              if (sessionId) {
                const sessStatsRes = await fetch(`/api/trading/sessions/${encodeURIComponent(sessionId)}/stats`)
                if (sessStatsRes.ok) {
                  const sessStats = await sessStatsRes.json()
                  merged = {
                    ...merged,
                    session_stats: {
                      runtime_seconds: sessStats.runtime_seconds,
                      total_trades: sessStats.total_trades,
                      open_positions: sessStats.open_positions,
                    },
                  }
                }
              }

              return merged
            } catch {
              return bot
            }
          })
        )

        setBots(botsEnriched)
      }
      
      if (backtestsRes.ok) {
        const backtestsData = await backtestsRes.json()
        setBacktests(backtestsData.backtests || [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    }
  }

  function selectStrategy(strategy_id: string) {
    setSelectedStrategyId(strategy_id)
  }

  function selectModel(model_id: string) {
    setSelectedModelId(model_id)
  }

  async function selectAlignment(alignment_id: string) {
    setSelectedAlignmentId(alignment_id)
    
    // При выборе alignment автоматически выбираем стратегию и модель
    const alignment = alignments.find(a => a.alignment_id === alignment_id)
    if (alignment) {
      setSelectedStrategyId(alignment.strategy_id)
      setSelectedModelId(alignment.model_id)
      
      // Загружаем score для этого alignment
      setAlignmentLoading(true)
      try {
        const scoreRes = await fetch(`/api/alignment/analyze/${alignment_id}`)
        if (scoreRes.ok) {
          const scoreData = await scoreRes.json()
          setAlignmentScore(scoreData)
        }
      } catch (e) {
        console.error('Failed to load alignment score:', e)
      } finally {
        setAlignmentLoading(false)
      }
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
      setMessage(`Imported: ${res.imported.length}, skipped: ${res.skipped.length}`)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import strategies')
    } finally {
      setBusy(false)
    }
  }

  async function handleGenerateBot() {
    if (!selectedAlignmentId) return
    setGenerateBusy(true)
    setError(null)
    setMessage(null)
    try {
      const bot = await generateBotFromAlignment(selectedAlignmentId)
      setMessage(`Bot generated: ${bot.bot_id}`)
      // Reload bots list
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generate bot failed')
    } finally {
      setGenerateBusy(false)
    }
  }

  async function syncBotTrades(bot_id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/trading/bots/${encodeURIComponent(bot_id)}/sync-freqtrade-trades`, { method: 'POST' })
      if (!res.ok) throw new Error(`Sync failed: HTTP ${res.status}`)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setBusy(false)
    }
  }

  function openStrategyEditor(strategy: StrategyTemplate) {
    setEditorType('strategy')
    setBaseItem(strategy)
    setEditorName(`${strategy.name} - Variation`)
    // Use the actual code from meta.code if available, otherwise use template
    const metaCode = strategy.meta && typeof strategy.meta === 'object' && 'code' in strategy.meta && typeof strategy.meta.code === 'string' ? strategy.meta.code : null
    const actualCode = metaCode || 
      `# ${strategy.name}\n# Strategy Class: ${strategy.strategy_class}\n\nfrom freqtrade.strategy import IStrategy\nfrom pandas import DataFrame\n\nclass ${strategy.strategy_class || 'Strategy'}(IStrategy):\n    minimal_roi = {"0": 0.10, "30": 0.05, "60": 0.02, "120": 0.01}\n    stoploss = -0.10\n    timeframe = '5m'\n    \n    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:\n        return dataframe\n    \n    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:\n        return dataframe\n    \n    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:\n        return dataframe\n`
    setEditorCode(actualCode)
    setShowEditor(true)
    setShowStrategyMenu(false)
  }

  function openModelEditor(model: FreqAIModelVariant) {
    setEditorType('model')
    setBaseItem(model)
    setEditorName(`${model.name} - Variation`)
    setEditorCode(`# ${model.name}\n# Algorithm: ${model.algorithm}\n\nfreqai_config = ${JSON.stringify(model.config, null, 2)}\n`)
    setShowEditor(true)
    setShowModelMenu(false)
  }

  async function saveVariation() {
    if (!baseItem || !editorName.trim()) return
    setBusy(true)
    setError(null)
    try {
      if (editorType === 'strategy') {
        const base = baseItem as StrategyTemplate
        // Get the root base_slug (if this is already a variation, use its base_slug, otherwise use its slug)
        const rootBaseSlug = (base.meta && typeof base.meta === 'object' && 'base_slug' in base.meta && typeof base.meta.base_slug === 'string')
          ? base.meta.base_slug
          : base.slug
        
        await createStrategyTemplate({
          slug: `${base.slug}-${Date.now()}`,
          name: editorName,
          source_type: base.source_type,
          source_url: base.source_url,
          source_ref: base.source_ref,
          strategy_class: base.strategy_class,
          description: `Variation of ${base.name}`,
          tags: [...base.tags.filter(t => t !== 'variation'), 'variation'],
          meta: { ...base.meta, base_id: base.strategy_id, base_slug: rootBaseSlug, code: editorCode },
        })
        setMessage(`✅ Strategy variation created: ${editorName}`)
      } else {
        const base = baseItem as FreqAIModelVariant
        // Get the root base_slug (if this is already a variation, use its base_slug, otherwise use its slug)
        const rootBaseSlug = (base.config && typeof base.config === 'object' && 'base_slug' in base.config && typeof base.config.base_slug === 'string')
          ? base.config.base_slug
          : base.slug
        
        await createFreqAIModelVariant({
          slug: `${base.slug}-${Date.now()}`,
          name: editorName,
          algorithm: base.algorithm,
          config: { ...base.config, base_slug: rootBaseSlug, code: editorCode },
          description: `Variation of ${base.name}`,
          tags: [...base.tags.filter(t => t !== 'variation'), 'variation'],
        })
        setMessage(`✅ Model variation created: ${editorName}`)
      }
      setShowEditor(false)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  async function openStore(type: 'strategy' | 'model') {
    setStoreType(type)
    setShowStore(true)
    setStoreLoading(true)
    try {
      const items = await listStoreItems(type)
      setStoreItems(items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load store')
    } finally {
      setStoreLoading(false)
    }
  }

  async function purchaseItem(item_id: string) {
    setBusy(true)
    setError(null)
    try {
      await purchaseStoreItem(item_id)
      setMessage('✅ Item purchased successfully!')
      await openStore(storeType)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Purchase failed')
    } finally {
      setBusy(false)
    }
  }



  async function handleGenerateAndBacktest() {
    if (!selectedAlignmentId) return
    setGenerateBusy(true)
    setError(null)
    setMessage(null)
    try {
      // Generate bot and run backtest in one call
      const response = await fetch(`/api/strategylab/alignments/${selectedAlignmentId}/backtest`, {
        method: 'POST'
      })
      if (!response.ok) {
        throw new Error(`Backtest failed: ${response.statusText}`)
      }
      const result = await response.json()
      setMessage(`Backtest completed! Win Rate: ${result.backtest?.win_rate?.toFixed(1)}%, Return: ${result.backtest?.total_return?.toFixed(2)}%`)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backtest failed')
    } finally {
      setGenerateBusy(false)
    }
  }

  async function handleDeployBot(bot_id: string) {
    try {
      const response = await fetch(`/api/trading/bots/${bot_id}/deploy`, {
        method: 'POST',
      })
      if (!response.ok) {
        throw new Error(`Deploy failed: ${response.statusText}`)
      }
      const result = await response.json()
      setMessage(`Bot deployed: ${result.container_name}`)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deploy failed')
    }
  }

  async function handleStopBot(bot_id: string) {
    try {
      const response = await fetch(`/api/trading/bots/${bot_id}/stop`, {
        method: 'POST'
      })
      if (!response.ok) {
        throw new Error(`Stop failed: ${response.statusText}`)
      }
      const result = await response.json()
      setMessage(`Bot stopped: ${result.bot_id}`)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stop failed')
    }
  }

  async function handleRunBacktest(bot_id: string) {
    setGenerateBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/strategylab/bots/${bot_id}/backtest`, {
        method: 'POST'
      })
      if (!response.ok) {
        throw new Error(`Backtest failed: ${response.statusText}`)
      }
      const result = await response.json()
      setMessage(`Backtest completed! Win Rate: ${result.backtest?.win_rate?.toFixed(1)}%, Return: ${result.backtest?.total_return?.toFixed(2)}%`)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backtest failed')
    } finally {
      setGenerateBusy(false)
    }
  }

  async function openConfigsDrawer(scope: 'strategy' | 'model' | 'alignment', owner_id: string) {
    setConfigOwnerScope(scope)
    setConfigOwnerId(owner_id)
    setConfigItems([])
    setConfigContentText('')
    setConfigFilename('config.json')
    setConfigDrawerOpen(true)
    await loadConfigs(scope, owner_id)
  }

  async function loadConfigs(scope: 'strategy' | 'model' | 'alignment', owner_id: string) {
    try {
      const configs = await listConfigs(scope, owner_id)
      setConfigItems(configs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load configs')
    }
  }

  async function activateConfigAndRefresh(config_id: string) {
    try {
      await activateConfig(config_id)
      await loadConfigs(configOwnerScope, configOwnerId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to activate config')
    }
  }

  async function saveNewConfigVersion(name: string, contentText: string, makeActive: boolean) {
    try {
      const parsed = contentText.trim() ? JSON.parse(contentText) : {}
      const cfg = await createConfig({
        scope: configOwnerScope,
        owner_id: configOwnerId,
        name: name || 'config.json',
        content: parsed,
        make_active: makeActive,
      })
      setConfigFilename(cfg.name)
      setConfigContentText(JSON.stringify(cfg.content ?? {}, null, 2))
      await loadConfigs(configOwnerScope, configOwnerId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save config')
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 1400, margin: '0 auto', padding: 20 }}>
      <PageHeader
        title="Strategy Lab · Bot Generator"
        description="Выбери стратегию и модель, затем сгенерируй бота"
      />

      {error && <ErrorBanner message={error} onRetry={() => void loadAll()} />}
      {message && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 13, color: '#4ade80' }}>✅ {message}</div>
            <button
              onClick={() => setMessage(null)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>
        </Card>
      )}

      {/* Saved Alignments - Quick Selection */}
      {alignments.length > 0 && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>🔗 Сохранённые Alignments</h3>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                Выберите готовую комбинацию стратегии + модели
              </div>
            </div>
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
            gap: 12 
          }}>
            {alignments.map(a => {
              const strategy = strategyById.get(a.strategy_id)
              const model = modelById.get(a.model_id)
              const isSelected = selectedAlignmentId === a.alignment_id
              
              return (
                <div
                  key={a.alignment_id}
                  onClick={() => void selectAlignment(a.alignment_id)}
                  style={{
                    padding: 16,
                    borderRadius: 10,
                    border: `2px solid ${isSelected ? '#667eea' : 'var(--border)'}`,
                    background: isSelected ? 'rgba(102,126,234,0.1)' : 'var(--surface)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {a.profile || 'Default'}
                    </div>
                    <span style={{
                      fontSize: 10,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: a.status === 'active' ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)',
                      color: a.status === 'active' ? '#4ade80' : '#fbbf24',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                    }}>
                      {a.status}
                    </span>
                  </div>
                  
                  <div style={{ fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--muted)' }}>Strategy:</span>{' '}
                    <span style={{ fontWeight: 600 }}>{strategy?.name || a.strategy_id.substring(0, 12)}</span>
                  </div>
                  
                  <div style={{ fontSize: 12 }}>
                    <span style={{ color: 'var(--muted)' }}>Model:</span>{' '}
                    <span style={{ fontWeight: 600 }}>{model?.name || a.model_id.substring(0, 12)}</span>
                  </div>
                  
                  {isSelected && (
                    <div style={{ 
                      marginTop: 12, 
                      display: 'flex', 
                      gap: 8,
                      borderTop: '1px solid var(--border)',
                      paddingTop: 12,
                    }}>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          await handleGenerateBot()
                        }}
                        disabled={generateBusy}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: 'none',
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: generateBusy ? 'not-allowed' : 'pointer',
                          opacity: generateBusy ? 0.5 : 1,
                        }}
                      >
                        {generateBusy ? '⏳...' : '🚀 Создать бота'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          openConfigsDrawer('alignment', a.alignment_id)
                        }}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--surface)',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        ⚙️
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Bot Generator - Main Controls */}
      <Card>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            🤖 Создать нового бота
          </h2>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Выберите стратегию и AI модель для создания торгового бота
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 16, alignItems: 'end' }}>
          {/* Strategy Selector - Popup Menu */}
          <div style={{ position: 'relative' }} data-menu-container>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Стратегия
            </label>
            <button
              onClick={() => setShowStrategyMenu(!showStrategyMenu)}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                fontSize: 14,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{selectedStrategyId ? (strategyById.get(selectedStrategyId)?.name || selectedStrategyId) : 'Выберите стратегию...'}</span>
              <span style={{ fontSize: 12 }}>▼</span>
            </button>
            
            {showStrategyMenu && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: 4,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                maxHeight: 400,
                overflowY: 'auto',
                overflowX: 'visible',
                zIndex: 1000,
              }}>
                {Array.from(strategyGroups.entries()).map(([groupName, groupStrategies]) => (
                  <div
                    key={groupName}
                    style={{ position: 'relative' }}
                    data-group-container={groupName}
                  >
                    <div 
                      onClick={() => {
                        if (groupStrategies.length === 1) {
                          setSelectedStrategyId(groupStrategies[0].strategy_id)
                          setShowStrategyMenu(false)
                        }
                      }}
                      onMouseEnter={() => groupStrategies.length > 1 && setHoveredStrategyGroup(groupName)}
                      onMouseLeave={() => setHoveredStrategyGroup(null)}
                      data-group-row={groupName}
                      style={{
                        padding: '12px 16px',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: hoveredStrategyGroup === groupName ? 'rgba(102,126,234,0.1)' : 'transparent',
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 500 }}>
                          {groupStrategies.length > 1 
                            ? (() => {
                                // Берем имя первой стратегии и убираем суффиксы версий
                                const baseName = groupStrategies[0]?.name || groupName;
                                return baseName.replace(/(X\d*|Next|NextGen|v\d+)$/i, '').trim() || baseName;
                              })()
                            : groupStrategies[0]?.name || groupName
                          }
                        </span>
                        {groupStrategies.length > 1 && (
                          <span style={{ 
                            fontSize: 10, 
                            padding: '2px 6px', 
                            borderRadius: 4, 
                            background: 'rgba(102,126,234,0.2)',
                            color: '#667eea',
                            fontWeight: 700
                          }}>
                            {groupStrategies.length}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowStrategyMenu(false)
                            openStore('strategy')
                          }}
                          style={{
                            padding: '2px 6px',
                            borderRadius: 4,
                            border: '1px solid var(--border)',
                            background: 'rgba(74,222,128,0.15)',
                            color: '#4ade80',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                          title="Browse store"
                        >
                          🛒
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openStrategyEditor(groupStrategies[0])
                          }}
                          style={{
                            padding: '2px 6px',
                            borderRadius: 4,
                            border: '1px solid var(--border)',
                            background: 'rgba(102,126,234,0.15)',
                            color: '#667eea',
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                          title="Create variation"
                        >
                          +
                        </button>
                        {groupStrategies.length > 1 && (
                          <span style={{ fontSize: 10, color: 'var(--muted)' }}>►</span>
                        )}
                      </div>
                    </div>
                    
                    {hoveredStrategyGroup === groupName && groupStrategies.length > 1 && (
                      <div 
                        onMouseEnter={() => setHoveredStrategyGroup(groupName)}
                        onMouseLeave={() => setHoveredStrategyGroup(null)}
                        style={{
                          position: 'fixed',
                          minWidth: 250,
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                          maxHeight: 400,
                          overflowY: 'auto',
                          zIndex: 1001,
                        }}
                        ref={(el) => {
                          if (el) {
                            const rowEl = document.querySelector(`[data-group-row="${groupName}"]`)
                            if (rowEl) {
                              const rowRect = rowEl.getBoundingClientRect()
                              el.style.left = `${rowRect.right + 4}px`
                              el.style.top = `${rowRect.top}px`
                            }
                          }
                        }}
                      >
                        {groupStrategies.map(strategy => (
                          <div
                            key={strategy.strategy_id}
                            style={{
                              padding: '10px 16px',
                              borderBottom: '1px solid var(--border)',
                              background: selectedStrategyId === strategy.strategy_id ? 'rgba(102,126,234,0.2)' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(102,126,234,0.15)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = selectedStrategyId === strategy.strategy_id ? 'rgba(102,126,234,0.2)' : 'transparent'
                            }}
                          >
                            <div 
                              onClick={() => {
                                setSelectedStrategyId(strategy.strategy_id)
                                setShowStrategyMenu(false)
                                setHoveredStrategyGroup(null)
                              }}
                              style={{ flex: 1, cursor: 'pointer' }}
                            >
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{strategy.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{strategy.slug}</div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                openStrategyEditor(strategy)
                              }}
                              style={{
                                padding: '6px 12px',
                                background: 'rgba(102,126,234,0.2)',
                                border: '1px solid rgba(102,126,234,0.3)',
                                borderRadius: 6,
                                color: 'var(--accent)',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                whiteSpace: 'nowrap',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(102,126,234,0.3)'
                                e.currentTarget.style.borderColor = 'rgba(102,126,234,0.5)'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(102,126,234,0.2)'
                                e.currentTarget.style.borderColor = 'rgba(102,126,234,0.3)'
                              }}
                            >
                              ✏️ Изменить
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Model Selector - Popup Menu */}
          <div style={{ position: 'relative' }} data-menu-container>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              AI Модель
            </label>
            <button
              onClick={() => setShowModelMenu(!showModelMenu)}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                fontSize: 14,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{selectedModelId ? (modelById.get(selectedModelId)?.name || selectedModelId) : 'Выберите модель...'}</span>
              <span style={{ fontSize: 12 }}>▼</span>
            </button>
            
            {showModelMenu && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: 4,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                maxHeight: 400,
                overflowY: 'auto',
                overflowX: 'visible',
                zIndex: 1000,
              }}>
                {Array.from(modelGroups.entries()).map(([groupName, groupModels]) => (
                  <div
                    key={groupName}
                    style={{ position: 'relative' }}
                    onMouseEnter={() => groupModels.length > 1 && setHoveredModelGroup(groupName)}
                    onMouseLeave={() => setHoveredModelGroup(null)}
                  >
                    <div
                      onClick={() => {
                        if (groupModels.length === 1) {
                          setSelectedModelId(groupModels[0].model_id)
                          setShowModelMenu(false)
                        }
                      }}
                      style={{
                        padding: '12px 16px',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: hoveredModelGroup === groupName ? 'rgba(102,126,234,0.1)' : 'transparent',
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 500 }}>{groupModels[0]?.name || groupName}</span>
                        {groupModels.length > 1 && (
                          <span style={{ 
                            fontSize: 10, 
                            padding: '2px 6px', 
                            borderRadius: 4, 
                            background: 'rgba(102,126,234,0.2)',
                            color: '#667eea',
                            fontWeight: 700
                          }}>
                            {groupModels.length}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowModelMenu(false)
                            openStore('model')
                          }}
                          style={{
                            padding: '2px 6px',
                            borderRadius: 4,
                            border: '1px solid var(--border)',
                            background: 'rgba(74,222,128,0.15)',
                            color: '#4ade80',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                          title="Browse store"
                        >
                          🛒
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openModelEditor(groupModels[0])
                          }}
                          style={{
                            padding: '2px 6px',
                            borderRadius: 4,
                            border: '1px solid var(--border)',
                            background: 'rgba(102,126,234,0.15)',
                            color: '#667eea',
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                          title="Create variation"
                        >
                          +
                        </button>
                        {groupModels.length > 1 && (
                          <span style={{ fontSize: 10, color: 'var(--muted)' }}>►</span>
                        )}
                      </div>
                    </div>
                    
                    {hoveredModelGroup === groupName && groupModels.length > 1 && (
                      <div 
                        style={{
                          position: 'fixed',
                          minWidth: 300,
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                          maxHeight: 400,
                          overflowY: 'auto',
                          zIndex: 1001,
                        }}
                        ref={(el) => {
                          if (el) {
                            const parentRect = el.parentElement?.getBoundingClientRect()
                            if (parentRect) {
                              el.style.left = `${parentRect.right + 4}px`
                              el.style.top = `${parentRect.top}px`
                            }
                          }
                        }}
                      >
                        {groupModels.map(model => (
                          <div
                            key={model.model_id}
                            onClick={() => {
                              setSelectedModelId(model.model_id)
                              setShowModelMenu(false)
                              setHoveredModelGroup(null)
                            }}
                            style={{
                              padding: '10px 16px',
                              cursor: 'pointer',
                              borderBottom: '1px solid var(--border)',
                              background: selectedModelId === model.model_id ? 'rgba(102,126,234,0.2)' : 'transparent',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(102,126,234,0.15)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = selectedModelId === model.model_id ? 'rgba(102,126,234,0.2)' : 'transparent'
                            }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{model.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{model.slug}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Alignment Analyzer */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Alignment Score
            </label>
            <div style={{
              padding: '12px 16px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              minHeight: 80,
              justifyContent: 'center',
            }}>
              {!selectedStrategyId || !selectedModelId ? (
                <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                  Выберите стратегию и модель
                </div>
              ) : alignmentLoading ? (
                <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                  Анализ...
                </div>
              ) : alignmentScore ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ 
                      fontSize: 32, 
                      fontWeight: 900,
                      color: alignmentScore.compatibility?.score >= 75 ? '#10b981' : alignmentScore.compatibility?.score >= 50 ? '#f59e0b' : '#ef4444'
                    }}>
                      {alignmentScore.compatibility?.score?.toFixed(0)}
                    </span>
                    <span style={{ 
                      fontSize: 20, 
                      fontWeight: 700,
                      padding: '4px 12px',
                      borderRadius: 6,
                      background: alignmentScore.compatibility?.grade === 'A' ? '#10b98120' : alignmentScore.compatibility?.grade === 'B' ? '#3b82f620' : alignmentScore.compatibility?.grade === 'C' ? '#f59e0b20' : '#ef444420',
                      color: alignmentScore.compatibility?.grade === 'A' ? '#10b981' : alignmentScore.compatibility?.grade === 'B' ? '#3b82f6' : alignmentScore.compatibility?.grade === 'C' ? '#f59e0b' : '#ef4444'
                    }}>
                      {alignmentScore.compatibility?.grade}
                    </span>
                  </div>
                  {alignmentScore.compatibility?.issues?.length > 0 && (
                    <div style={{ fontSize: 10, color: '#ef4444', maxHeight: 40, overflow: 'auto' }}>
                      {alignmentScore.compatibility.issues.slice(0, 2).map((issue: string, i: number) => (
                        <div key={i}>⚠ {issue}</div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      if (!selectedAlignmentId) return
                      try {
                        setAlignmentLoading(true)
                        const result = await fetch(`/api/alignment/optimize/${selectedAlignmentId}`, { method: 'POST' })
                        const data = await result.json()
                        setMessage(`Оптимизация: ${data.improvement >= 0 ? '+' : ''}${data.improvement}pts`)
                        // Reload alignment score
                        const scoreRes = await fetch(`/api/alignment/analyze/${selectedAlignmentId}`)
                        setAlignmentScore(await scoreRes.json())
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Optimization failed')
                      } finally {
                        setAlignmentLoading(false)
                      }
                    }}
                    style={{
                      padding: '4px 8px',
                      fontSize: 10,
                      fontWeight: 700,
                      borderRadius: 4,
                      border: '1px solid #3b82f6',
                      background: '#3b82f620',
                      color: '#3b82f6',
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                    }}
                  >
                    ⚡ Auto-Optimize
                  </button>
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                  Создайте alignment
                </div>
              )}
            </div>
          </div>

          {/* Generate Button */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={async () => {
                if (!selectedStrategyId || !selectedModelId) {
                  setError('Выберите стратегию и модель')
                  return
                }
                setGenerateBusy(true)
                setError(null)
                try {
                  // Create alignment first
                  const alignment = await createStrategyAlignment({
                    strategy_id: selectedStrategyId,
                    model_id: selectedModelId,
                    profile: 'default',
                    scope: {},
                    defaults: {},
                    mapping: {},
                    freqtrade_overrides: {},
                    freqai_overrides: {},
                    status: 'active'
                  })
                  setSelectedAlignmentId(alignment.alignment_id)
                  
                  // Analyze alignment compatibility
                  setAlignmentLoading(true)
                  try {
                    const scoreRes = await fetch(`/api/alignment/analyze/${alignment.alignment_id}`)
                    const scoreData = await scoreRes.json()
                    setAlignmentScore(scoreData)
                  } catch (e) {
                    console.error('Failed to analyze alignment:', e)
                  } finally {
                    setAlignmentLoading(false)
                  }
                  
                  // Generate bot
                  const bot = await generateBotFromAlignment(alignment.alignment_id)
                  setMessage(`Бот создан: ${bot.bot_id}`)
                  await loadAll()
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Не удалось создать бота')
                } finally {
                  setGenerateBusy(false)
                }
              }}
              disabled={!selectedStrategyId || !selectedModelId || generateBusy}
              style={{
                padding: '12px 24px',
                borderRadius: 8,
                border: 'none',
                background: !selectedStrategyId || !selectedModelId || generateBusy ? '#6b7280' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: !selectedStrategyId || !selectedModelId || generateBusy ? 'not-allowed' : 'pointer',
                opacity: !selectedStrategyId || !selectedModelId || generateBusy ? 0.5 : 1,
                whiteSpace: 'nowrap',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                boxShadow: '0 4px 12px rgba(102,126,234,0.3)',
              }}
            >
              {generateBusy ? '⏳ Создаю...' : '🚀 Создать бота'}
            </button>
          </div>
        </div>
      </Card>

      {/* Generated Bots - Simple Cards */}
      {bots.length > 0 && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>🤖 Мои боты ({bots.length})</h3>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Управление торговыми ботами</div>
            </div>
            <button
              onClick={() => void loadAll()}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              🔄 Обновить
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {bots.map((bot) => {
              const alignment = alignments.find(a => a.alignment_id === bot.alignment_id)
              const strategy = alignment ? strategyById.get(alignment.strategy_id) : null
              const model = alignment ? modelById.get(alignment.model_id) : null
              const isRunning = bot.status === 'running'
              
              return (
                <div
                  key={bot.bot_id}
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                  }}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{bot.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                        {bot.bot_id}
                      </div>
                    </div>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      background: isRunning ? 'rgba(74,222,128,0.2)' : bot.status === 'stopped' ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.2)',
                      color: isRunning ? '#4ade80' : bot.status === 'stopped' ? '#ef4444' : '#fbbf24',
                    }}>
                      {isRunning ? '● Running' : bot.status || 'Created'}
                    </span>
                  </div>

                  {/* Details */}
                  <div style={{ fontSize: 12, marginBottom: 12, display: 'grid', gap: 6 }}>
                    {strategy && (
                      <div>
                        <span style={{ color: 'var(--muted)' }}>Strategy:</span>{' '}
                        <span style={{ fontWeight: 600 }}>{strategy.name}</span>
                      </div>
                    )}
                    {model && (
                      <div>
                        <span style={{ color: 'var(--muted)' }}>Model:</span>{' '}
                        <span style={{ fontWeight: 600 }}>{model.name}</span>
                      </div>
                    )}
                    <div>
                      <span style={{ color: 'var(--muted)' }}>Exchange:</span>{' '}
                      <span style={{ fontWeight: 600 }}>{bot.exchange}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)' }}>Mode:</span>{' '}
                      <span style={{ 
                        fontWeight: 600,
                        color: bot.mode === 'live' ? '#ef4444' : bot.mode === 'dry_run' ? '#3b82f6' : '#fbbf24'
                      }}>
                        {bot.mode}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)' }}>Created:</span>{' '}
                      <span style={{ fontWeight: 600 }}>{new Date(bot.created_at).toLocaleDateString()}</span>
                    </div>

                    <div>
                      <span style={{ color: 'var(--muted)' }}>Uptime (total):</span>{' '}
                      <span style={{ fontWeight: 600 }}>{formatDuration(bot.stats?.total_runtime_seconds)}</span>
                    </div>

                    <div>
                      <span style={{ color: 'var(--muted)' }}>Trades (total):</span>{' '}
                      <span style={{ fontWeight: 600 }}>{bot.stats?.total_trades ?? '-'}</span>
                    </div>

                    <div>
                      <span style={{ color: 'var(--muted)' }}>Last session:</span>{' '}
                      <span style={{ fontWeight: 600 }}>
                        {bot.current_session?.started_at
                          ? `${formatDateTime(bot.current_session.started_at)}${bot.current_session.stopped_at ? ` → ${formatDateTime(bot.current_session.stopped_at)}` : ' (running)'} · ${formatDuration(bot.session_stats?.runtime_seconds)}`
                          : '-'
                        }
                      </span>
                    </div>

                    <div>
                      <span style={{ color: 'var(--muted)' }}>Trades in session:</span>{' '}
                      <span style={{ fontWeight: 600 }}>{bot.session_stats?.total_trades ?? '-'}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <button
                      onClick={() => void (isRunning ? handleStopBot(bot.bot_id) : handleDeployBot(bot.bot_id))}
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: 'none',
                        background: isRunning 
                          ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' 
                          : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                    >
                      {isRunning ? '■ Остановить' : '▶ Запустить'}
                    </button>
                    
                    <button
                      onClick={() => void handleRunBacktest(bot.bot_id)}
                      disabled={generateBusy}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: generateBusy ? 'not-allowed' : 'pointer',
                        opacity: generateBusy ? 0.5 : 1,
                      }}
                      title="Запустить backtest"
                    >
                      📊
                    </button>
                    
                    <button
                      onClick={() => setShowTimerModal(bot.bot_id)}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                      title="Синхронизировать сделки"
                    >
                      ⟳
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}


      {/* Backtests - Horizontal Rows */}
      {backtests.length > 0 && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>📊 Backtests ({backtests.length})</h3>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Historical strategy performance</div>
            </div>
            <button
              onClick={() => setBacktestsExpanded(!backtestsExpanded)}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {backtestsExpanded ? '▼ Hide Details' : '▶ Show Details'}
            </button>
          </div>

          {/* Table Header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '180px 100px 80px 90px 90px 90px 90px 100px 1fr auto',
              gap: 12,
              padding: '8px 12px',
              background: 'var(--border)',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: 8,
            }}
          >
            <div>Strategy / Pair</div>
            <div>Timeframe</div>
            <div>Trades</div>
            <div>Win Rate</div>
            <div>Return</div>
            <div>Sharpe</div>
            <div>Max DD</div>
            <div>Profit Factor</div>
            <div>Period</div>
            <div>Actions</div>
          </div>

          {/* Backtest Rows */}
          <div
            style={{
              display: 'grid',
              gap: 8,
              maxHeight: '600px',
              overflowY: 'auto',
              overflowX: 'hidden',
            }}
          >
            {backtests.map((bt) => {
              const isPositive = bt.total_return > 0
              const isGoodWinRate = bt.win_rate > 50
              const isGoodSharpe = bt.sharpe_ratio > 1
              
              return (
                <div key={bt.id}>
                  {/* Main Row */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '180px 100px 80px 90px 90px 90px 90px 100px 1fr auto',
                      gap: 12,
                      padding: '12px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      alignItems: 'center',
                      fontSize: 12,
                    }}
                  >
                    {/* Strategy / Pair */}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{bt.strategy_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                        {bt.pair}
                      </div>
                    </div>

                    {/* Timeframe */}
                    <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{bt.timeframe}</div>

                    {/* Trades */}
                    <div style={{ textAlign: 'center', fontWeight: 700 }}>{bt.total_trades}</div>

                    {/* Win Rate */}
                    <div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: isGoodWinRate ? '#4ade80' : '#fbbf24',
                        }}
                      >
                        {bt.win_rate.toFixed(1)}%
                      </div>
                    </div>

                    {/* Return */}
                    <div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: isPositive ? '#4ade80' : '#ef4444',
                        }}
                      >
                        {isPositive ? '+' : ''}{bt.total_return.toFixed(2)}%
                      </div>
                    </div>

                    {/* Sharpe */}
                    <div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: isGoodSharpe ? '#4ade80' : '#fbbf24',
                        }}
                      >
                        {bt.sharpe_ratio.toFixed(2)}
                      </div>
                    </div>

                    {/* Max DD */}
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>
                        -{bt.max_drawdown.toFixed(2)}%
                      </div>
                    </div>

                    {/* Profit Factor */}
                    <div style={{ fontWeight: 700 }}>{bt.profit_factor.toFixed(2)}</div>

                    {/* Period */}
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>
                      {bt.backtest_start?.substring(0, 10)} - {bt.backtest_end?.substring(0, 10)}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        style={{
                          padding: '6px 10px',
                          borderRadius: 4,
                          border: '1px solid var(--border)',
                          background: 'var(--surface)',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                        title="View Details"
                      >
                        📈
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {backtestsExpanded && (
                    <div
                      style={{
                        marginTop: 4,
                        padding: 12,
                        background: 'var(--border)',
                        borderRadius: 8,
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 16,
                        fontSize: 11,
                      }}
                    >
                      {/* Left: Key Metrics */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 8,
                          padding: 10,
                          background: 'var(--surface)',
                          borderRadius: 6,
                        }}
                      >
                        <div>
                          <div style={{ color: 'var(--muted)', fontSize: 10, marginBottom: 2 }}>Avg Trade</div>
                          <div
                            style={{
                              fontWeight: 700,
                              color: bt.avg_trade > 0 ? '#4ade80' : '#ef4444',
                            }}
                          >
                            {bt.avg_trade > 0 ? '+' : ''}{bt.avg_trade.toFixed(2)}%
                          </div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--muted)', fontSize: 10, marginBottom: 2 }}>Filename</div>
                          <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 9, wordBreak: 'break-all' }}>
                            {bt.filename}
                          </div>
                        </div>
                      </div>

                      {/* Right: Period Details */}
                      <div
                        style={{
                          padding: 10,
                          background: 'var(--surface)',
                          borderRadius: 6,
                        }}
                      >
                        <div style={{ color: 'var(--muted)', fontSize: 10, marginBottom: 4 }}>Test Period</div>
                        <div style={{ fontFamily: 'monospace', fontSize: 10 }}>{bt.period}</div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Backtests - Horizontal Rows */}
      {backtests.length > 0 && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>📊 Backtests ({backtests.length})</h3>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Historical strategy performance</div>
            </div>
            <button
              onClick={() => setBacktestsExpanded(!backtestsExpanded)}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {backtestsExpanded ? '▼ Hide Details' : '▶ Show Details'}
            </button>
          </div>

          {/* Table Header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '180px 100px 80px 90px 90px 90px 90px 100px 1fr auto',
              gap: 12,
              padding: '8px 12px',
              background: 'var(--border)',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: 8,
            }}
          >
            <div>Strategy / Pair</div>
            <div>Timeframe</div>
            <div>Trades</div>
            <div>Win Rate</div>
            <div>Return</div>
            <div>Sharpe</div>
            <div>Max DD</div>
            <div>Profit Factor</div>
            <div>Period</div>
            <div>Actions</div>
          </div>

          {/* Backtest Rows */}
          <div
            style={{
              display: 'grid',
              gap: 8,
              maxHeight: '600px',
              overflowY: 'auto',
              overflowX: 'hidden',
            }}
          >
            {backtests.map((bt) => {
              const isPositive = bt.total_return > 0
              const isGoodWinRate = bt.win_rate > 50
              const isGoodSharpe = bt.sharpe_ratio > 1
              
              return (
                <div key={bt.id}>
                  {/* Main Row */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '180px 100px 80px 90px 90px 90px 90px 100px 1fr auto',
                      gap: 12,
                      padding: '12px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      alignItems: 'center',
                      fontSize: 12,
                    }}
                  >
                    {/* Strategy / Pair */}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{bt.strategy_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                        {bt.pair}
                      </div>
                    </div>

                    {/* Timeframe */}
                    <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{bt.timeframe}</div>

                    {/* Trades */}
                    <div style={{ textAlign: 'center', fontWeight: 700 }}>{bt.total_trades}</div>

                    {/* Win Rate */}
                    <div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: isGoodWinRate ? '#4ade80' : '#fbbf24',
                        }}
                      >
                        {bt.win_rate.toFixed(1)}%
                      </div>
                    </div>

                    {/* Return */}
                    <div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: isPositive ? '#4ade80' : '#ef4444',
                        }}
                      >
                        {isPositive ? '+' : ''}{bt.total_return.toFixed(2)}%
                      </div>
                    </div>

                    {/* Sharpe */}
                    <div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: isGoodSharpe ? '#4ade80' : '#fbbf24',
                        }}
                      >
                        {bt.sharpe_ratio.toFixed(2)}
                      </div>
                    </div>

                    {/* Max DD */}
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>
                        -{bt.max_drawdown.toFixed(2)}%
                      </div>
                    </div>

                    {/* Profit Factor */}
                    <div style={{ fontWeight: 700 }}>{bt.profit_factor.toFixed(2)}</div>

                    {/* Period */}
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>
                      {bt.backtest_start?.substring(0, 10)} - {bt.backtest_end?.substring(0, 10)}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        style={{
                          padding: '6px 10px',
                          borderRadius: 4,
                          border: '1px solid var(--border)',
                          background: 'var(--surface)',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                        title="View Details"
                      >
                        📈
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {backtestsExpanded && (
                    <div
                      style={{
                        marginTop: 4,
                        padding: 12,
                        background: 'var(--border)',
                        borderRadius: 8,
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 16,
                        fontSize: 11,
                      }}
                    >
                      {/* Left: Key Metrics */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 8,
                          padding: 10,
                          background: 'var(--surface)',
                          borderRadius: 6,
                        }}
                      >
                        <div>
                          <div style={{ color: 'var(--muted)', fontSize: 10, marginBottom: 2 }}>Avg Trade</div>
                          <div
                            style={{
                              fontWeight: 700,
                              color: bt.avg_trade > 0 ? '#4ade80' : '#ef4444',
                            }}
                          >
                            {bt.avg_trade > 0 ? '+' : ''}{bt.avg_trade.toFixed(2)}%
                          </div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--muted)', fontSize: 10, marginBottom: 2 }}>Filename</div>
                          <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 9, wordBreak: 'break-all' }}>
                            {bt.filename}
                          </div>
                        </div>
                      </div>

                      {/* Right: Period Details */}
                      <div
                        style={{
                          padding: 10,
                          background: 'var(--surface)',
                          borderRadius: 6,
                        }}
                      >
                        <div style={{ color: 'var(--muted)', fontSize: 10, marginBottom: 4 }}>Test Period</div>
                        <div style={{ fontFamily: 'monospace', fontSize: 10 }}>{bt.period}</div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}



      {/* Config Drawer - Sliding panel for editing configs */}
      <div
        aria-hidden={!configDrawerOpen}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          width: 'min(620px, 96vw)',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          transform: configDrawerOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 180ms ease',
          zIndex: 60,
          padding: 12,
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
          gap: 10,
          boxSizing: 'border-box',
          boxShadow: '-4px 0 12px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'grid', gap: 2 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>📝 Configs Editor</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              scope: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{configOwnerScope}</span> · owner:{' '}
              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{configOwnerId.substring(0, 16) || '—'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => (configOwnerId ? void loadConfigs(configOwnerScope, configOwnerId) : undefined)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                cursor: 'pointer',
                fontSize: 12,
              }}
              disabled={!configOwnerId}
            >
              🔄 Refresh
            </button>
            <button
              onClick={() => setConfigDrawerOpen(false)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              ✕ Close
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10, gridTemplateRows: '1fr auto' }}>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '260px 1fr', alignItems: 'start' }}>
            <div
              style={{
                display: 'grid',
                gap: 8,
                maxHeight: '70vh',
                overflow: 'auto',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 8,
              }}
            >
              {configItems.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.7, padding: 12, textAlign: 'center' }}>
                  No saved configs.
                  <br />
                  Save a new version below.
                </div>
              ) : (
                configItems.map((cfg) => {
                  const active = cfg.is_active
                  return (
                    <div
                      key={cfg.config_id}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: 8,
                        background: active ? 'var(--selected)' : 'var(--surface)',
                        display: 'grid',
                        gap: 4,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: 12 }}>{cfg.name}</div>
                        {active && (
                          <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 600 }}>✓ ACTIVE</span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, opacity: 0.8 }}>
                        {new Date(cfg.updated_at ?? cfg.created_at ?? '').toLocaleString()}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                        <button
                          onClick={() => {
                            setConfigContentText(JSON.stringify(cfg.content ?? {}, null, 2))
                            setConfigFilename(cfg.name || 'config.json')
                          }}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          Load
                        </button>
                        <button
                          onClick={() => void activateConfigAndRefresh(cfg.config_id)}
                          disabled={active}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            fontSize: 11,
                            opacity: active ? 0.5 : 1,
                            cursor: active ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {active ? 'Active' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>File name</span>
                <input
                  value={configFilename}
                  onChange={(e) => setConfigFilename(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Content (JSON)</span>
                <textarea
                  value={configContentText}
                  onChange={(e) => setConfigContentText(e.target.value)}
                  rows={20}
                  style={{
                    width: '100%',
                    fontFamily: 'monospace',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    fontSize: 11,
                  }}
                />
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => void saveNewConfigVersion(configFilename, configContentText, false)}
                  disabled={!configOwnerId}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: configOwnerId ? 'pointer' : 'not-allowed',
                  }}
                >
                  💾 Save version
                </button>
                <button
                  onClick={() => void saveNewConfigVersion(configFilename, configContentText, true)}
                  disabled={!configOwnerId}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--primary)',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: configOwnerId ? 'pointer' : 'not-allowed',
                  }}
                >
                  ✓ Save + Activate
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Timer Scheduler Modal */}
      {false && showTimerModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => setShowTimerModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 480,
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>⏰ Schedule Timer</h3>
              <button
                onClick={() => setShowTimerModal(null)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gap: 16 }}>
              {/* Bot Name */}
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                Bot: <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                  {bots.find(b => b.bot_id === showTimerModal)?.name}
                </span>
              </div>

              {/* Scheduled Start */}
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Schedule Start</label>
                <input
                  type="datetime-local"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    fontSize: 13,
                    fontFamily: 'monospace',
                  }}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Bot will automatically start at this time
                </div>
              </div>

              {/* Scheduled Stop */}
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Schedule Stop</label>
                <input
                  type="datetime-local"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    fontSize: 13,
                    fontFamily: 'monospace',
                  }}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Bot will automatically stop at this time
                </div>
              </div>

              {/* Repeat Options */}
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Repeat</label>
                <select
                  style={{
                    padding: '10px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    fontSize: 13,
                  }}
                >
                  <option value="once">Once</option>
                  <option value="daily">Daily</option>
                  <option value="weekdays">Weekdays only</option>
                  <option value="weekends">Weekends only</option>
                  <option value="custom">Custom schedule</option>
                </select>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button
                  onClick={() => {
                    setMessage('Timer scheduled successfully')
                    setShowTimerModal(null)
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--primary)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Save Schedule
                </button>
                <button
                  onClick={() => setShowTimerModal(null)}
                  style={{
                    padding: '12px 20px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>

              {/* Active Schedules */}
              <div style={{ 
                marginTop: 12, 
                padding: 12, 
                background: 'var(--border)', 
                borderRadius: 6,
                fontSize: 11
              }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>📋 Active Schedules</div>
                <div style={{ color: 'var(--muted)' }}>No active schedules for this bot</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Variation Editor Modal */}
      {showEditor && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: 20,
          }}
          onClick={() => setShowEditor(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              width: '95vw',
              height: '95vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  value={editorName}
                  onChange={(e) => setEditorName(e.target.value)}
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text)',
                    width: '100%',
                    padding: '4px 0',
                  }}
                  placeholder="Variation name..."
                />
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  {editorType === 'strategy' ? '📝 Python Strategy File' : '⚙️ Model Configuration'}
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: 8, marginLeft: 20 }}>
                <button
                  onClick={saveVariation}
                  disabled={busy || !editorName.trim()}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 6,
                    border: 'none',
                    background: busy || !editorName.trim() ? '#6b7280' : '#4ade80',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: busy || !editorName.trim() ? 'not-allowed' : 'pointer',
                    opacity: busy || !editorName.trim() ? 0.5 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  💾 Сохранить
                </button>
                <button
                  onClick={() => setEditorCode(editorCode)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  🔄 Сбросить
                </button>
                <button
                  onClick={() => setShowEditor(false)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ✕ Закрыть
                </button>
              </div>
            </div>

            {/* Code Editor */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <textarea
                value={editorCode}
                onChange={(e) => setEditorCode(e.target.value)}
                style={{
                  width: '100%',
                  height: '100%',
                  padding: 20,
                  fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                  fontSize: 13,
                  lineHeight: 1.6,
                  background: '#1e1e1e',
                  color: '#d4d4d4',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                }}
                spellCheck={false}
              />
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 24px',
              borderTop: '1px solid var(--border)',
              fontSize: 11,
              color: 'var(--muted)',
              display: 'flex',
              justifyContent: 'space-between',
            }}>
              <div>
                {editorType === 'strategy' ? 'Python Strategy' : 'Model Config'} · {baseItem ? (editorType === 'strategy' ? (baseItem as StrategyTemplate).slug : (baseItem as FreqAIModelVariant).slug) : ''}
              </div>
              <div>
                {editorCode.split('\n').length} lines · {editorCode.length} chars
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Store Modal */}
      {showStore && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: 20,
          }}
          onClick={() => setShowStore(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              width: '100%',
              maxWidth: 900,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
                  🛒 {storeType === 'strategy' ? 'Strategy' : 'Model'} Store
                </h2>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                  Browse and purchase {storeType === 'strategy' ? 'strategies' : 'models'} from the community
                </div>
              </div>
              
              <button
                onClick={() => setShowStore(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ✕ Close
              </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
              {storeLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
                  <div style={{ fontSize: 14, color: 'var(--muted)' }}>Loading...</div>
                </div>
              ) : storeItems.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
                  <div style={{ fontSize: 14, color: 'var(--muted)' }}>No items available</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 16 }}>
                  {storeItems.map(item => (
                    <div
                      key={item.item_id}
                      style={{
                        padding: 16,
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: item.purchased ? 'rgba(74,222,128,0.05)' : 'var(--surface)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{item.name}</h3>
                            {item.purchased && (
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: 4,
                                background: 'rgba(74,222,128,0.2)',
                                color: '#4ade80',
                                fontSize: 11,
                                fontWeight: 700,
                              }}>
                                ✓ PURCHASED
                              </span>
                            )}
                          </div>
                          
                          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
                            {item.description || 'No description'}
                          </div>
                          
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                            {item.tags.map((tag: string) => (
                              <span
                                key={tag}
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  background: 'var(--border)',
                                  fontSize: 11,
                                  color: 'var(--muted)',
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {item.purchaser_count} {item.purchaser_count === 1 ? 'purchase' : 'purchases'}
                          </div>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'end', gap: 8 }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: item.price_cents === 0 ? '#4ade80' : 'var(--text)' }}>
                            {item.price_cents === 0 ? 'FREE' : `$${(item.price_cents / 100).toFixed(2)}`}
                          </div>
                          
                          {!item.purchased && (
                            <button
                              onClick={() => purchaseItem(item.item_id)}
                              disabled={busy}
                              style={{
                                padding: '8px 16px',
                                borderRadius: 6,
                                border: 'none',
                                background: busy ? '#6b7280' : item.price_cents === 0 ? '#4ade80' : '#667eea',
                                color: '#fff',
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: busy ? 'not-allowed' : 'pointer',
                                opacity: busy ? 0.5 : 1,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {item.price_cents === 0 ? '📥 Get' : '💳 Purchase'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 24px',
              borderTop: '1px solid var(--border)',
              fontSize: 11,
              color: 'var(--muted)',
              display: 'flex',
              justifyContent: 'space-between',
            }}>
              <div>
                {storeItems.length} {storeItems.length === 1 ? 'item' : 'items'} available
              </div>
              <div>
                {storeItems.filter(i => i.purchased).length} purchased
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
