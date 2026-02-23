import { UniversalEditor } from './UniversalEditorPage'
/**
 * Combinator V2 - Bot Generator with collapsible columns
 * 
 * Layout:
 * - Top: Collapsible columns (Strategies, Models, Alignments)
 * - Bottom: Bots list with full stats and expandable trades
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import CollapsibleSection from '../../shared/ui/CollapsibleSection'
import ModuleBadge from '../../shared/ui/ModuleBadge'
import { getNodeKindCatalog } from '../../services/nodeKindCatalog'
import {
  getGraphRunExecution,
  runAlignmentBacktestTemplate,
  type NodeGraphRunExecutionOut,
  type NodeKindMetaOut,
} from '../../services/api/graphsApi'
import { listBotBacktests, type TradingBacktest } from '../../services/api/tradingBacktestsApi'
import {
  type ConfigFile,
  type FreqAIModelVariant as Model,
  type StrategyAlignment as Alignment,
  type StrategyTemplate as Strategy,
} from '../../services/api/strategylabApi'
import {
  BORDER_RADIUS,
  BORDER_WIDTH,
  SPACING,
  PADDING,
  GAP,
  TRANSITION,
  FONT_SIZE,
  FONT_WEIGHT,
  MODULE_COLORS,
  STATUS_COLORS,
} from '../../shared/styles/designSystem'
import { formatFixed, toFiniteNumber } from '../../shared/utils/numberFormat'

// ============================================================================
// TYPES
// ============================================================================

type ContainerStatus = {
  bot_id?: string
  container_name?: string
  status: 'running' | 'stopped' | 'unknown' | string
  running?: boolean
  message?: string | null
  updated_at?: string | null
}

type Bot = {
  bot_id: string
  name: string
  config_path: string
  created_at: string
  alignment_id?: string | null
  status?: string | null
  exchange?: string | null
  mode?: string | null
}

type Trade = {
  trade_id: string
  pair?: string
  side: string
  status: 'open' | 'closed' | string

  entry_price: number
  exit_price?: number | null
  amount: number

  opened_at: string
  closed_at?: string | null
  open_date?: string
  close_date?: string | null
  profit?: number | null
}

type BotSession = {
  session_id: string
  started_at: string
  stopped_at: string | null
  status: string
}

type SessionStats = {
  total_pnl: number
  balance_change_percent: number
  total_trades: number
  win_rate: number
  open_positions: number
}

type BotBacktest = TradingBacktest

type DbPromptPreset = { preset_id: string; title: string; template: string }

type DbChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: number
}

const DB_PROMPT_PRESETS: DbPromptPreset[] = [
  {
    preset_id: 'fix_json',
    title: 'Fix JSON config',
    template:
      'Исправь JSON-конфиг: валидность, типы, обязательные поля.\n' +
      'Не меняй смысл настроек без необходимости.\n' +
      'Верни только итоговый JSON без комментариев.',
  },
  {
    preset_id: 'optimize_risk',
    title: 'Optimize risk / sizing',
    template:
      'Предложи безопасные настройки риска: стоп, тейк, max_open_trades, stake_amount.\n' +
      'Учитывай частоту сделок и просадку.\n' +
      'Верни итоговый JSON.',
  },
  {
    preset_id: 'freqai_sanity',
    title: 'FreqAI sanity pass',
    template:
      'Проверь блок FreqAI: признаки, обучение, параметры модели.\n' +
      'Убери конфликтующие/нерелевантные поля, сохрани смысл.\n' +
      'Верни итоговый JSON.',
  },
]

function humanScopeLabel(scope: 'strategy' | 'model' | 'alignment') {
  if (scope === 'strategy') return 'strategy'
  if (scope === 'model') return 'model'
  return 'alignment'
}

function buildConfigChatDraft(params: {
  scope: 'strategy' | 'model' | 'alignment'
  filename: string
  source: string
}) {
  const scopeLabel = humanScopeLabel(params.scope)
  const file = (params.filename || 'config.json').trim() || 'config.json'
  const source = (params.source || '').trim() || 'current'
  return (
    `Контекст: ${scopeLabel}\n` +
    `Файл: ${file}\n` +
    `Источник: ${source}\n\n` +
    'Задача: проанализируй текущий конфиг и предложи улучшения.\n' +
    'Если предлагаешь изменения — перечисли их списком и дай итоговый JSON без комментариев.'
  )
}

function buildConfigChatContext(params: {
  scope: 'strategy' | 'model' | 'alignment'
  ownerId: string
  filename: string
  source: string
  configText: string
}) {
  const scopeLabel = humanScopeLabel(params.scope)
  const file = (params.filename || 'config.json').trim() || 'config.json'
  const ownerId = (params.ownerId || '').trim() || '(unknown)'
  const source = (params.source || '').trim() || 'current'

  const raw = (params.configText || '').trim()
  // Avoid sending extremely large payloads.
  const maxChars = 16000
  const cfg = raw.length > maxChars ? `${raw.slice(0, maxChars)}\n\n[TRUNCATED]` : raw

  return (
    `SCOPE: ${scopeLabel}\n` +
    `OWNER_ID: ${ownerId}\n` +
    `FILE: ${file}\n` +
    `SOURCE: ${source}\n\n` +
    'CURRENT_CONFIG_JSON:\n' +
    (cfg || '{}')
  )
}

function buildStrategyChatContext(params: {
  strategyId: string
  filename: string
  code: string
}) {
  const id = (params.strategyId || '').trim() || '(unknown)'
  const file = (params.filename || '').trim() || 'strategy.py'
  const raw = (params.code || '').trim()
  const maxChars = 16000
  const code = raw.length > maxChars ? `${raw.slice(0, maxChars)}\n\n[TRUNCATED]` : raw
  return (
    `SCOPE: strategy\n` +
    `STRATEGY_ID: ${id}\n` +
    `FILE: ${file}\n\n` +
    'CURRENT_STRATEGY_PY:\n' +
    (code || '')
  )
}

// ============================================================================
// API
// ============================================================================

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const token = window.localStorage.getItem('access_token')
  const res = await fetch(`/api${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    let message = text

    // Backend wraps errors as: { error: string, message: any, details: any }
    try {
      const parsed = JSON.parse(text) as any

      const msg = parsed?.message
      if (typeof msg === 'string') {
        message = msg
      } else if (msg && typeof msg === 'object') {
        if (typeof msg.message === 'string') {
          message = msg.message
        } else if (typeof msg.error === 'string') {
          message = msg.error
        } else {
          message = text
        }
      } else if (typeof parsed?.detail === 'string') {
        message = parsed.detail
      }
    } catch {
      // ignore JSON parse errors
    }

    throw new Error(message || `HTTP ${res.status}`)
  }
  return res.json()
}

// ============================================================================
// COMPONENTS
// ============================================================================

// Selectable Item
function SelectableItem({
  label,
  sublabel,
  selected,
  onClick,
  badge,
}: {
  label: string
  sublabel?: string
  selected: boolean
  onClick: () => void
  badge?: string
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      style={{
        padding: PADDING.item,
        cursor: 'pointer',
        background: selected ? 'var(--bg)' : hovered ? 'var(--bg)' : 'transparent',
        borderLeft: selected ? `${BORDER_WIDTH.accent} solid var(--primary)` : `${BORDER_WIDTH.accent} solid transparent`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        transition: `all ${TRANSITION.fast}`,
        userSelect: 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ 
          fontSize: FONT_SIZE.base, 
          fontWeight: selected ? FONT_WEIGHT.semibold : FONT_WEIGHT.normal,
          color: selected ? 'var(--primary)' : 'var(--text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {label}
        </div>
        {sublabel && (
          <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            {sublabel}
          </div>
        )}
      </div>
      {badge && (
        <span style={{
          padding: '2px 6px',
          borderRadius: BORDER_RADIUS.sm,
          fontSize: 9,
          background: STATUS_COLORS.warning.bg,
          color: STATUS_COLORS.warning.text,
          flexShrink: 0,
          marginLeft: 8,
        }}>
          {badge}
        </span>
      )}
    </div>
  )
}

// Bot Row with expandable trades
function BotRow({
  bot,
  containerStatus,
  strategy,
  model,
  alignment,
  onDeploy,
  onStop,
  meSettings,
  saveMeSettings,
  busy,
  onMessage,
}: {
  bot: Bot
  containerStatus?: ContainerStatus
  strategy?: Strategy
  model?: Model
  alignment?: Alignment
  onDeploy: () => void
  onStop: () => void
  meSettings: { ai_provider: string | null; openrouter_model_id: string | null; has_ai_token: boolean } | null
  saveMeSettings: (patch: { ai_provider?: string | null; openrouter_model_id?: string | null; ai_token?: string | null }) => Promise<void>
  busy: boolean
  onMessage?: (message: string) => void
}) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const [trades, setTrades] = useState<Trade[]>([])
  const [sessions, setSessions] = useState<BotSession[]>([])
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [backtests, setBacktests] = useState<BotBacktest[]>([])
  const [backtestsLoading, setBacktestsLoading] = useState(false)
  const [backtestsError, setBacktestsError] = useState<string | null>(null)
  const [runBacktestBusy, setRunBacktestBusy] = useState(false)
  const [runBacktestMessage, setRunBacktestMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedExchange, setSelectedExchange] = useState(() => bot.exchange || '')
  const [exchangeToken, setExchangeToken] = useState('')
  const [selectedAiProvider, setSelectedAiProvider] = useState<'openai' | 'anthropic' | 'openrouter' | 'local' | ''>('')
  const [aiProviderToken, setAiProviderToken] = useState('')
  const aiTokenSaveTimerRef = useRef<number | null>(null)
  const [openRouterModels, setOpenRouterModels] = useState<Array<{ id: string; name: string; is_free?: boolean }>>([])
  const [openRouterModelId, setOpenRouterModelId] = useState('')
  const [openRouterLoading, setOpenRouterLoading] = useState(false)
  const [openRouterError, setOpenRouterError] = useState<string | null>(null)

  const [configEditorLoading, setConfigEditorLoading] = useState(false)
  const [configEditorError, setConfigEditorError] = useState<string | null>(null)
  const [configEditorText, setConfigEditorText] = useState('')
  const [configEditorSource, setConfigEditorSource] = useState<'stored' | 'generated' | ''>('')
  const [configEditorOwnerScope, setConfigEditorOwnerScope] = useState<'strategy' | 'model' | 'alignment'>('alignment')
  const [configEditorOwnerId, setConfigEditorOwnerId] = useState('')
  const [configEditorFilename, setConfigEditorFilename] = useState('config.json')
  const [configEditorSaveBusy, setConfigEditorSaveBusy] = useState(false)
  const [configEditorSaveMessage, setConfigEditorSaveMessage] = useState<string | null>(null)

  const [configEditorLastSavedId, setConfigEditorLastSavedId] = useState<string | null>(null)
  const [configGenerateBusy, setConfigGenerateBusy] = useState(false)
  const [configApplyBusy, setConfigApplyBusy] = useState(false)

  const [configChatDraft, setConfigChatDraft] = useState('')

  const [workflowRunId, setWorkflowRunId] = useState<string | null>(null)
  const [workflowExec, setWorkflowExec] = useState<NodeGraphRunExecutionOut | null>(null)
  const [workflowExecLoading, setWorkflowExecLoading] = useState(false)
  const [workflowExecError, setWorkflowExecError] = useState<string | null>(null)

  const [kindMetaByKind, setKindMetaByKind] = useState<Map<string, NodeKindMetaOut>>(new Map())

  const [strategySourcesLoading, setStrategySourcesLoading] = useState(false)
  const [strategySourcesError, setStrategySourcesError] = useState<string | null>(null)
  const [strategySources, setStrategySources] = useState<Array<{ strategy_class: string; path: string; filename: string }>>([])
  const [strategySourcePath, setStrategySourcePath] = useState<string>('')

  const [strategyEditorLoading, setStrategyEditorLoading] = useState(false)
  const [strategyEditorError, setStrategyEditorError] = useState<string | null>(null)
  const [strategyEditorFilename, setStrategyEditorFilename] = useState<string>('')
  const [strategyEditorText, setStrategyEditorText] = useState<string>('')
  const [strategyVariationName, setStrategyVariationName] = useState<string>('')
  const [strategySaveBusy, setStrategySaveBusy] = useState(false)
  const [strategySaveMessage, setStrategySaveMessage] = useState<string | null>(null)

  // DB configs editor (strategy/model/alignment)
  const [dbConfigDrawerOpen, setDbConfigDrawerOpen] = useState(false)
  const [dbConfigOwnerScope, setDbConfigOwnerScope] = useState<'strategy' | 'model' | 'alignment'>('alignment')
  const [dbConfigOwnerId, setDbConfigOwnerId] = useState('')
  const [dbStrategyView, setDbStrategyView] = useState<'files' | 'configs'>('files')
  const [dbConfigItems, setDbConfigItems] = useState<ConfigFile[]>([])
  const [dbConfigContentText, setDbConfigContentText] = useState('')
  const [dbConfigFilename, setDbConfigFilename] = useState('config.json')
  const [dbConfigError, setDbConfigError] = useState<string | null>(null)
  const [dbConfigLoading, setDbConfigLoading] = useState(false)

  const [dbOwnerStrategies, setDbOwnerStrategies] = useState<Strategy[]>([])
  const [dbOwnerModels, setDbOwnerModels] = useState<Model[]>([])
  const [dbOwnerLoading, setDbOwnerLoading] = useState(false)
  const [dbOwnerError, setDbOwnerError] = useState<string | null>(null)

  const [dbSelectedPromptPresetId, setDbSelectedPromptPresetId] = useState<string>(DB_PROMPT_PRESETS[0]?.preset_id || '')

  const [dbPromptDraft, setDbPromptDraft] = useState('')
  const [dbGenerateBusy, setDbGenerateBusy] = useState(false)
  const [dbSaveBusy, setDbSaveBusy] = useState(false)
  const [dbLastSavedConfigId, setDbLastSavedConfigId] = useState<string | null>(null)
  const [dbApplyBusy, setDbApplyBusy] = useState(false)

  const DB_CUSTOM_PROMPTS_KEY = 'trade.dbCustomPrompts.v1'

  const [dbCustomPrompts, setDbCustomPrompts] = useState<DbPromptPreset[]>(() => {
    try {
      if (typeof window === 'undefined') return []
      const raw = window.localStorage.getItem(DB_CUSTOM_PROMPTS_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as any
      if (!Array.isArray(parsed)) return []
      return parsed
        .filter((p) => p && typeof p === 'object')
        .map((p) => ({
          preset_id: String(p.preset_id || ''),
          title: String(p.title || ''),
          template: String(p.template || ''),
        }))
        .filter((p) => p.preset_id && p.title)
    } catch {
      return []
    }
  })
  const [dbNewPromptTitle, setDbNewPromptTitle] = useState('')
  const [dbNewPromptTemplate, setDbNewPromptTemplate] = useState('')

  const [dbChatMessages, setDbChatMessages] = useState<DbChatMessage[]>([])
  const [dbChatDraft, setDbChatDraft] = useState('')
  const [dbChatBusy, setDbChatBusy] = useState(false)
  const [dbChatError, setDbChatError] = useState<string | null>(null)

  const alignmentIdForConfig = alignment?.alignment_id || bot.alignment_id || ''

  const selectedOpenRouterModel = useMemo(() => {
    if (!openRouterModelId) return null
    return openRouterModels.find(m => m.id === openRouterModelId) || null
  }, [openRouterModelId, openRouterModels])

  const selectedStrategyId = alignment?.strategy_id || ''
  const selectedModelId = alignment?.model_id || ''
  
  const isRunning = containerStatus?.running || bot.status === 'running'

  useEffect(() => {
    // Best-effort default to the current alignment context so Save works immediately.
    if (!configEditorOwnerId && alignmentIdForConfig) {
      setConfigEditorOwnerScope('alignment')
      setConfigEditorOwnerId(alignmentIdForConfig)
    }
  }, [alignmentIdForConfig, configEditorOwnerId])

  useEffect(() => {
    let cancelled = false
    void getNodeKindCatalog()
      .then((m) => {
        if (cancelled) return
        setKindMetaByKind(m)
      })
      .catch(() => {
        // non-fatal; fallback to raw kind strings
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // local convenience persistence
    const savedProvider = window.localStorage.getItem('ai_provider')
    const savedModel = window.localStorage.getItem('openrouter_model_id')
    const savedToken = window.localStorage.getItem('ai_provider_token')

    if (!selectedAiProvider) {
      const v = savedProvider || meSettings?.ai_provider || ''
      if (v) setSelectedAiProvider(v as any)
    }

    if (!openRouterModelId) {
      const v = savedModel || meSettings?.openrouter_model_id || ''
      if (v) setOpenRouterModelId(v)
    }

    if (!aiProviderToken && savedToken) {
      setAiProviderToken(savedToken)
    }
    // We intentionally do NOT pull token from server (server never returns it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meSettings])

  useEffect(() => {
    setSelectedExchange(bot.exchange || '')
  }, [bot.exchange])

  useEffect(() => {
    return () => {
      if (aiTokenSaveTimerRef.current) {
        window.clearTimeout(aiTokenSaveTimerRef.current)
        aiTokenSaveTimerRef.current = null
      }
    }
  }, [])

  const loadAlignmentConfigForEditor = useCallback(async () => {
    if (!alignmentIdForConfig) {
      setConfigEditorError('No alignment_id on this bot')
      return
    }

    setConfigEditorLoading(true)
    setConfigEditorError(null)
    setConfigEditorSaveMessage(null)

    try {
      const data = await api<{
        filename: string
        config: Record<string, unknown>
        source: 'stored' | 'generated'
      }>(`/strategylab/alignments/${encodeURIComponent(alignmentIdForConfig)}/config-file`)

      const text = JSON.stringify(data.config || {}, null, 2)
      setConfigEditorText(text)
      setConfigEditorSource(data.source || '')
      setConfigEditorOwnerScope('alignment')
      setConfigEditorOwnerId(alignmentIdForConfig)
      setConfigEditorFilename((data.filename || 'config.json').trim() || 'config.json')
      setConfigChatDraft(
        buildConfigChatDraft({
          scope: 'alignment',
          filename: (data.filename || 'config.json').trim() || 'config.json',
          source: data.source || 'stored',
        }),
      )
    } catch (err) {
      setConfigEditorError(err instanceof Error ? err.message : 'Failed to load config')
    } finally {
      setConfigEditorLoading(false)
    }
  }, [alignmentIdForConfig])

  const parseStrategyClassFromCode = useCallback((code: string): string | null => {
    if (!code) return null
    // Try to find a class inheriting from IStrategy
    const m = code.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*:/m)
    if (!m) return null
    const className = m[1]
    const bases = m[2] || ''
    if (!bases.includes('IStrategy')) return null
    return className
  }, [])

  const loadStrategySources = useCallback(async (overrideId?: string) => {
    const targetId = overrideId || selectedStrategyId
    if (!targetId) {
      setStrategySourcesError('No strategy selected')
      return
    }

    setStrategySourcesLoading(true)
    setStrategySourcesError(null)
    try {
      const res = await api<{ items: Array<{ strategy_class: string; path: string; filename: string }> }>(
        `/strategylab/strategies/${encodeURIComponent(targetId)}/sources`
      )
      setStrategySources(res.items || [])
      if (!strategySourcePath && res.items && res.items.length > 0) {
        setStrategySourcePath(res.items[0].path)
      }
    } catch (err) {
      setStrategySourcesError(err instanceof Error ? err.message : 'Failed to list strategy sources')
    } finally {
      setStrategySourcesLoading(false)
    }
  }, [selectedStrategyId, strategySourcePath])

  const loadStrategySource = useCallback(async (explicitPath?: string, overrideId?: string) => {
    const targetId = overrideId || selectedStrategyId
    if (!targetId) {
      setStrategyEditorError('No strategy selected')
      return
    }

    setStrategyEditorLoading(true)
    setStrategyEditorError(null)
    setStrategySaveMessage(null)

    try {
      const qp = explicitPath || strategySourcePath
      const url = qp
        ? `/strategylab/strategies/${encodeURIComponent(targetId)}/source?repo_path=${encodeURIComponent(qp)}`
        : `/strategylab/strategies/${encodeURIComponent(targetId)}/source`

      const res = await api<{ filename: string; path: string; content: string }>(url)
      setStrategyEditorFilename(res.filename || '')
      setStrategyEditorText(res.content || '')
      if (res.path) setStrategySourcePath(res.path)

      if (!strategyVariationName.trim()) {
        const baseName = strategy?.name || 'Strategy'
        setStrategyVariationName(`${baseName} - Variation`)
      }
    } catch (err) {
      setStrategyEditorError(err instanceof Error ? err.message : 'Failed to load strategy source')
    } finally {
      setStrategyEditorLoading(false)
    }
  }, [selectedStrategyId, strategySourcePath, strategyVariationName, strategy?.name])

  const saveStrategyVariation = useCallback(async () => {
    if (!selectedStrategyId) {
      setStrategyEditorError('No strategy selected')
      return
    }
    const code = strategyEditorText
    if (!code.trim()) {
      setStrategyEditorError('Strategy code is empty')
      return
    }
    const name = strategyVariationName.trim()
    if (!name) {
      setStrategyEditorError('Variation name is empty')
      return
    }

    setStrategySaveBusy(true)
    setStrategyEditorError(null)
    setStrategySaveMessage(null)

    try {
      const detectedClass = parseStrategyClassFromCode(code)
      const baseSlug = (strategy?.meta && typeof strategy.meta === 'object' && typeof (strategy.meta as any).base_slug === 'string')
        ? String((strategy.meta as any).base_slug)
        : (strategy?.slug || '')

      // We save the edited strategy as a new "store" strategy so it can be deployed as a real file.
      const payload = {
        slug: `${(strategy?.slug || 'strategy')}-${Date.now()}`,
        name,
        source_type: 'store',
        source_url: 'local://strategylab',
        source_ref: null,
        strategy_class: detectedClass || strategy?.strategy_class || strategy?.slug || 'Strategy',
        description: `Variation of ${strategy?.name || strategy?.slug || selectedStrategyId}`,
        tags: Array.from(new Set([...(strategy?.tags || []).filter(t => t !== 'variation'), 'variation'])),
        meta: {
          ...(strategy?.meta || {}),
          base_id: selectedStrategyId,
          base_slug: baseSlug,
          repo_path: strategySourcePath || null,
          filename: strategyEditorFilename || null,
          code,
        },
      }

      await api('/strategylab/strategies', { method: 'POST', body: JSON.stringify(payload) })
      setStrategySaveMessage('✅ Strategy variation saved')
    } catch (err) {
      setStrategyEditorError(err instanceof Error ? err.message : 'Failed to save strategy variation')
    } finally {
      setStrategySaveBusy(false)
    }
  }, [parseStrategyClassFromCode, selectedStrategyId, strategy?.meta, strategy?.name, strategy?.slug, strategy?.strategy_class, strategy?.tags, strategyEditorFilename, strategyEditorText, strategySourcePath, strategyVariationName])

  const applyConfigToEditor = useCallback((
    cfg: Record<string, unknown>,
    source: 'generated' | 'stored' | '' = 'generated',
    meta?: { scope?: 'strategy' | 'model' | 'alignment'; owner_id?: string; filename?: string },
  ) => {
    const text = JSON.stringify(cfg || {}, null, 2)
    setConfigEditorText(text)
    setConfigEditorSource(source)
    setConfigEditorSaveMessage(null)
    setConfigEditorLastSavedId(null)
    if (meta?.scope) setConfigEditorOwnerScope(meta.scope)
    if (meta?.owner_id) setConfigEditorOwnerId(meta.owner_id)
    if (meta?.filename) setConfigEditorFilename(meta.filename)
    setConfigChatDraft(
      buildConfigChatDraft({
        scope: meta?.scope || 'alignment',
        filename: meta?.filename || 'config.json',
        source: source || 'generated',
      }),
    )
  }, [])

  const saveConfigEditorToDb = useCallback(async () => {
    const scope = configEditorOwnerScope
    const ownerId = (configEditorOwnerId || '').trim()
    if (!ownerId) {
      setConfigEditorError('No owner selected for save')
      return
    }

    setConfigEditorError(null)
    setConfigEditorSaveMessage(null)
    setConfigEditorSaveBusy(true)
    try {
      const parsed = configEditorText.trim() ? (JSON.parse(configEditorText) as Record<string, unknown>) : {}
      const saved = await api<ConfigFile>('/strategylab/configs', {
        method: 'POST',
        body: JSON.stringify({
          scope,
          owner_id: ownerId,
          name: (configEditorFilename || 'config.json').trim() || 'config.json',
          content: parsed,
          make_active: false,
        }),
      })
      setConfigEditorLastSavedId(saved?.config_id || null)
      setConfigEditorSaveMessage(saved?.config_id ? `✅ Saved (id: ${saved.config_id})` : '✅ Saved')
    } catch (err) {
      setConfigEditorError(err instanceof Error ? err.message : 'Failed to save config')
    } finally {
      setConfigEditorSaveBusy(false)
    }
  }, [configEditorFilename, configEditorOwnerId, configEditorOwnerScope, configEditorText])

  const applySavedConfig = useCallback(async () => {
    const id = configEditorLastSavedId
    if (!id) {
      setConfigEditorError('Nothing to apply yet. Save a version first.')
      return
    }

    setConfigEditorError(null)
    setConfigEditorSaveMessage(null)
    setConfigApplyBusy(true)
    try {
      await api(`/strategylab/configs/${encodeURIComponent(id)}/activate`, { method: 'POST' })
      setConfigEditorSaveMessage(`✅ Applied (activated id: ${id})`)
    } catch (err) {
      setConfigEditorError(err instanceof Error ? err.message : 'Failed to apply config')
    } finally {
      setConfigApplyBusy(false)
    }
  }, [configEditorLastSavedId])

  const tryParseJsonFromAi = useCallback((raw: string): Record<string, unknown> | null => {
    const text = (raw || '').trim()
    if (!text) return null

    const candidates: string[] = []
    candidates.push(text)

    const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (fence && fence[1]) candidates.push(fence[1].trim())

    const first = text.indexOf('{')
    const last = text.lastIndexOf('}')
    if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1).trim())

    for (const c of candidates) {
      try {
        const parsed = JSON.parse(c) as Record<string, unknown>
        if (parsed && typeof parsed === 'object') return parsed
      } catch {
        // try next candidate
      }
    }

    return null
  }, [])

  const generateConfigFromPrompt = useCallback(async () => {
    const prompt = configChatDraft.trim()
    if (!prompt) return

    if (!selectedAiProvider) {
      setConfigEditorError('Select AI provider first.')
      return
    }

    const provider = selectedAiProvider === 'local' ? 'local' : selectedAiProvider
    const hasToken = provider === 'local' || !!aiProviderToken.trim() || !!meSettings?.has_ai_token
    if (!hasToken) {
      setConfigEditorError('Paste AI provider token (or save it to your account) first.')
      return
    }

    let model: string | null = null
    if (provider === 'openrouter') {
      const savedModel = meSettings?.openrouter_model_id || ''
      if (!openRouterModelId && !savedModel) {
        setConfigEditorError('Select OpenRouter model (or save one to your account) first.')
        return
      }
      model = openRouterModelId || savedModel
    } else if (provider === 'openai') {
      model = 'gpt-4o-mini'
    } else if (provider === 'local') {
      model = null
    }

    setConfigEditorError(null)
    setConfigEditorSaveMessage(null)
    setConfigGenerateBusy(true)
    try {
      const context = buildConfigChatContext({
        scope: configEditorOwnerScope,
        ownerId: configEditorOwnerId,
        filename: configEditorFilename,
        source: configEditorSource,
        configText: configEditorText,
      })

      const result = await api<{ content: string }>(
        '/ai/chat',
        {
          method: 'POST',
          body: JSON.stringify({
            provider,
            token: aiProviderToken.trim() || null,
            model,
            messages: [
              { role: 'user' as const, content: context },
              { role: 'user' as const, content: prompt },
            ],
            max_tokens: 900,
            temperature: 0.2,
          }),
        }
      )

      const parsed = tryParseJsonFromAi(result.content)
      if (!parsed) {
        throw new Error('AI response is not valid JSON. Ask it to output ONLY JSON.')
      }

      applyConfigToEditor(parsed, 'generated', {
        scope: configEditorOwnerScope,
        owner_id: configEditorOwnerId,
        filename: configEditorFilename,
      })
    } catch (err) {
      let msg = err instanceof Error ? err.message : 'AI call failed'

      if (typeof msg === 'string' && msg.includes('No cookie auth credentials found')) {
        msg = 'OpenRouter returned 401 (invalid/missing API key). Paste a valid OpenRouter key (usually starts with sk-or-...) and try again.'
      }

      if (typeof msg === 'string' && /\b429\b/.test(msg)) {
        msg =
          'Лимит запросов (429). Провайдер временно ограничил частоту/квоту. Подожди 30–60 секунд и попробуй снова. ' +
          'Если повторяется: выбери другой провайдер, включи local, используй платный/валидный ключ, сократи размер ответа.'
      }

      setConfigEditorError(msg)
    } finally {
      setConfigGenerateBusy(false)
    }
  }, [
    aiProviderToken,
    applyConfigToEditor,
    configChatDraft,
    configEditorFilename,
    configEditorOwnerId,
    configEditorOwnerScope,
    configEditorSource,
    configEditorText,
    meSettings?.has_ai_token,
    meSettings?.openrouter_model_id,
    openRouterModelId,
    selectedAiProvider,
    tryParseJsonFromAi,
  ])

  const refreshWorkflowExecution = useCallback(async () => {
    const rid = (workflowRunId || '').trim()
    if (!rid) return
    setWorkflowExecLoading(true)
    setWorkflowExecError(null)
    try {
      const ex = await getGraphRunExecution(rid)
      setWorkflowExec(ex)
    } catch (err) {
      setWorkflowExecError(err instanceof Error ? err.message : 'Failed to load execution')
    } finally {
      setWorkflowExecLoading(false)
    }
  }, [workflowRunId])

  const loadDbConfigs = useCallback(async (scope: 'strategy' | 'model' | 'alignment', owner_id: string) => {
    if (!owner_id) return
    setDbConfigLoading(true)
    setDbConfigError(null)
    try {
      const qp = new URLSearchParams({ scope, owner_id })
      const items = await api<ConfigFile[]>(`/strategylab/configs?${qp.toString()}`)
      setDbConfigItems(items)
    } catch (err) {
      setDbConfigError(err instanceof Error ? err.message : 'Failed to load configs')
    } finally {
      setDbConfigLoading(false)
    }
  }, [])

  const openDbConfigsDrawer = useCallback(async (scope: 'strategy' | 'model' | 'alignment', owner_id: string) => {
    setDbConfigOwnerScope(scope)
    setDbConfigOwnerId(owner_id)
    setDbConfigItems([])
    setDbConfigContentText('')
    setDbConfigFilename('config.json')
    setDbConfigError(null)
    setDbPromptDraft('')
    setDbLastSavedConfigId(null)
    setDbChatMessages([])
    setDbChatDraft('')
    setDbChatError(null)
    setDbConfigDrawerOpen(true)
    if (owner_id) {
      if (scope === 'strategy') {
        await loadStrategySources()
      } else {
        await loadDbConfigs(scope, owner_id)
      }
    }
  }, [loadDbConfigs])

  const openConfigDrawerForCurrentContext = useCallback(() => {
    if (alignmentIdForConfig) {
      void openDbConfigsDrawer('alignment', alignmentIdForConfig)
      return
    }
    if (selectedModelId) {
      void openDbConfigsDrawer('model', selectedModelId)
      return
    }
    if (selectedStrategyId) {
      void openDbConfigsDrawer('strategy', selectedStrategyId)
      return
    }
    // fallback
    void openDbConfigsDrawer('alignment', '')
  }, [alignmentIdForConfig, openDbConfigsDrawer, selectedModelId, selectedStrategyId])

  const applyDbPromptPreset = useCallback((mode: 'replace' | 'append') => {
    setDbConfigError(null)
    const preset = DB_PROMPT_PRESETS.find((p) => p.preset_id === dbSelectedPromptPresetId) || DB_PROMPT_PRESETS[0]
    if (!preset) {
      setDbConfigError('No prompt preset selected')
      return
    }

    const cfgText = (dbConfigContentText || '').trim()
    const header =
      `Preset: ${preset.title}\n` +
      `Scope: ${dbConfigOwnerScope}\n` +
      `File: ${dbConfigFilename || 'config.json'}\n` +
      '\n'

    const block =
      header +
      preset.template +
      (cfgText ? `\nТекущий JSON:\n${cfgText}\n` : '')

    if (mode === 'replace') {
      setDbPromptDraft(block)
      return
    }
    setDbPromptDraft((prev) => (prev ? `${prev}\n\n${block}` : block))
  }, [dbConfigContentText, dbConfigFilename, dbConfigOwnerScope, dbSelectedPromptPresetId])

  const switchDbConfigsOwner = useCallback(async (nextScope: 'strategy' | 'model' | 'alignment', nextOwnerId: string) => {
    setDbConfigOwnerScope(nextScope)
    setDbConfigOwnerId(nextOwnerId)
    setDbStrategyView('files')
    setDbConfigItems([])
    setDbConfigContentText('')
    setDbConfigFilename('config.json')
    setDbConfigError(null)
    setDbPromptDraft('')
    setDbLastSavedConfigId(null)
    setDbChatMessages([])
    setDbChatDraft('')
    setDbChatError(null)
    if (nextOwnerId) {
      if (nextScope === 'strategy') {
        setDbConfigLoading(true)
        await Promise.all([
          loadStrategySources(nextOwnerId),
          loadDbConfigs(nextScope, nextOwnerId).catch(() => null)
        ])
        setDbConfigLoading(false)
      } else {
        await loadDbConfigs(nextScope, nextOwnerId)
      }
    }
  }, [loadDbConfigs, loadStrategySources])

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      window.localStorage.setItem(DB_CUSTOM_PROMPTS_KEY, JSON.stringify(dbCustomPrompts))
    } catch {
      // ignore
    }
  }, [dbCustomPrompts])

  const addDbCustomPrompt = useCallback(() => {
    const title = dbNewPromptTitle.trim()
    const template = dbNewPromptTemplate.trim()
    if (!title || !template) return
    const item: DbPromptPreset = {
      preset_id: `custom_${Date.now()}`,
      title,
      template,
    }
    setDbCustomPrompts((prev) => [...prev, item])
    setDbNewPromptTitle('')
    setDbNewPromptTemplate('')
  }, [dbNewPromptTemplate, dbNewPromptTitle])

  const usePromptTemplate = useCallback((template: string) => {
    setDbPromptDraft(template || '')
    setDbConfigError(null)
  }, [])

  const saveDbConfigVersion = useCallback(async () => {
    if (!dbConfigOwnerId) return
    setDbConfigError(null)
    setDbSaveBusy(true)
    try {
      const parsed = dbConfigContentText.trim() ? (JSON.parse(dbConfigContentText) as Record<string, unknown>) : {}
      const saved = await api<ConfigFile>('/strategylab/configs', {
        method: 'POST',
        body: JSON.stringify({
          scope: dbConfigOwnerScope,
          owner_id: dbConfigOwnerId,
          name: dbConfigFilename || 'config.json',
          content: parsed,
          make_active: false,
        }),
      })
      setDbLastSavedConfigId(saved?.config_id || null)
      await loadDbConfigs(dbConfigOwnerScope, dbConfigOwnerId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save config'
      setDbConfigError(msg)
    } finally {
      setDbSaveBusy(false)
    }
  }, [dbConfigContentText, dbConfigFilename, dbConfigOwnerId, dbConfigOwnerScope, loadDbConfigs])

  const applyLastSavedDbConfig = useCallback(async () => {
    const id = dbLastSavedConfigId
    if (!id) {
      setDbConfigError('Nothing to apply yet. Save a version first.')
      return
    }
    setDbConfigError(null)
    setDbApplyBusy(true)
    try {
      await api(`/strategylab/configs/${encodeURIComponent(id)}/activate`, { method: 'POST' })
      if (dbConfigOwnerId) {
        await loadDbConfigs(dbConfigOwnerScope, dbConfigOwnerId)
      }
    } catch (err) {
      setDbConfigError(err instanceof Error ? err.message : 'Failed to apply config')
    } finally {
      setDbApplyBusy(false)
    }
  }, [dbConfigOwnerId, dbConfigOwnerScope, dbLastSavedConfigId, loadDbConfigs])

  const generateDbConfigFromPrompt = useCallback(async () => {
    const prompt = dbPromptDraft.trim()
    if (!prompt) return

    if (!selectedAiProvider) {
      setDbConfigError('Select AI provider first.')
      return
    }

    const provider = selectedAiProvider === 'local' ? 'local' : selectedAiProvider
    const hasToken = provider === 'local' || !!aiProviderToken.trim() || !!meSettings?.has_ai_token
    if (!hasToken) {
      setDbConfigError('Paste AI provider token (or save it to your account) first.')
      return
    }

    let model: string | null = null
    if (provider === 'openrouter') {
      const savedModel = meSettings?.openrouter_model_id || ''
      if (!openRouterModelId && !savedModel) {
        setDbConfigError('Select OpenRouter model (or save one to your account) first.')
        return
      }
      model = openRouterModelId || savedModel
    } else if (provider === 'openai') {
      model = 'gpt-4o-mini'
    } else {
      model = null
    }

    setDbConfigError(null)
    setDbGenerateBusy(true)
    try {
      const context =
        dbConfigOwnerScope === 'strategy'
          ? buildStrategyChatContext({
              strategyId: dbConfigOwnerId,
              filename: strategyEditorFilename || 'strategy.py',
              code: strategyEditorText,
            })
          : buildConfigChatContext({
              scope: dbConfigOwnerScope,
              ownerId: dbConfigOwnerId,
              filename: dbConfigFilename,
              source: 'stored',
              configText: dbConfigContentText,
            })

      const result = await api<{ content: string }>(
        '/ai/chat',
        {
          method: 'POST',
          body: JSON.stringify({
            provider,
            token: aiProviderToken.trim() || null,
            model,
            messages: [
              { role: 'user' as const, content: context },
              { role: 'user' as const, content: prompt },
            ],
            max_tokens: 1200,
            temperature: 0.2,
          }),
        }
      )

      if (dbConfigOwnerScope === 'strategy' && dbStrategyView === 'files') {
        setStrategyEditorText(result.content || '')
        return
      }

      const parsed = tryParseJsonFromAi(result.content)
      if (!parsed) throw new Error('AI response is not valid JSON. Ask it to output ONLY JSON.')
      setDbConfigContentText(JSON.stringify(parsed ?? {}, null, 2))
      setDbLastSavedConfigId(null)
    } catch (err) {
      let msg = err instanceof Error ? err.message : 'AI call failed'

      if (typeof msg === 'string' && msg.includes('No cookie auth credentials found')) {
        msg = 'OpenRouter returned 401 (invalid/missing API key). Paste a valid OpenRouter key (usually starts with sk-or-...) and try again.'
      }

      if (typeof msg === 'string' && /\b429\b/.test(msg)) {
        msg =
          'Лимит запросов (429). Провайдер временно ограничил частоту/квоту. Подожди 30–60 секунд и попробуй снова. ' +
          'Если повторяется: выбери другой провайдер, включи local, используй платный/валидный ключ, сократи размер ответа.'
      }

      setDbConfigError(msg)
    } finally {
      setDbGenerateBusy(false)
    }
  }, [
    aiProviderToken,
    dbConfigContentText,
    dbConfigFilename,
    dbConfigOwnerId,
    dbConfigOwnerScope,
    dbPromptDraft,
    meSettings?.has_ai_token,
    meSettings?.openrouter_model_id,
    openRouterModelId,
    selectedAiProvider,
    tryParseJsonFromAi,
    dbConfigOwnerScope,
    strategyEditorFilename,
    strategyEditorText,
    setStrategyEditorText,
  ])

  const sendDbChatMessage = useCallback(async () => {
    const text = dbChatDraft.trim()
    if (!text) return

    if (!selectedAiProvider) {
      setDbChatError('Select AI provider first.')
      return
    }

    const provider = selectedAiProvider === 'local' ? 'local' : selectedAiProvider
    const hasToken = provider === 'local' || !!aiProviderToken.trim() || !!meSettings?.has_ai_token
    if (!hasToken) {
      setDbChatError('Paste AI provider token (or save it to your account) first.')
      return
    }

    let model: string | null = null
    if (provider === 'openrouter') {
      const savedModel = meSettings?.openrouter_model_id || ''
      if (!openRouterModelId && !savedModel) {
        setDbChatError('Select OpenRouter model (or save one to your account) first.')
        return
      }
      model = openRouterModelId || savedModel
    } else if (provider === 'openai') {
      model = 'gpt-4o-mini'
    } else {
      model = null
    }

    setDbChatError(null)
    setDbChatBusy(true)

    const userMsg: DbChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: text,
      created_at: Date.now(),
    }
    setDbChatMessages((prev) => [...prev, userMsg])
    setDbChatDraft('')

    try {
      const context =
        dbConfigOwnerScope === 'strategy'
          ? buildStrategyChatContext({
              strategyId: dbConfigOwnerId,
              filename: strategyEditorFilename || 'strategy.py',
              code: strategyEditorText,
            })
          : buildConfigChatContext({
              scope: dbConfigOwnerScope,
              ownerId: dbConfigOwnerId,
              filename: dbConfigFilename,
              source: 'stored',
              configText: dbConfigContentText,
            })

      const history = [...dbChatMessages, userMsg].map((m) => ({ role: m.role as any, content: m.content }))

      const result = await api<{ content: string }>(
        '/ai/chat',
        {
          method: 'POST',
          body: JSON.stringify({
            provider,
            token: aiProviderToken.trim() || null,
            model,
            messages: [{ role: 'user' as const, content: context }, ...history],
            max_tokens: 900,
            temperature: 0.3,
          }),
        }
      )

      const assistantMsg: DbChatMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content: result.content || '',
        created_at: Date.now(),
      }
      setDbChatMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      setDbChatError(err instanceof Error ? err.message : 'Chat failed')
    } finally {
      setDbChatBusy(false)
    }
  }, [
    aiProviderToken,
    dbChatDraft,
    dbChatMessages,
    dbConfigContentText,
    dbConfigFilename,
    dbConfigOwnerId,
    dbConfigOwnerScope,
    meSettings?.has_ai_token,
    meSettings?.openrouter_model_id,
    openRouterModelId,
    selectedAiProvider,
    strategyEditorFilename,
    strategyEditorText,
  ])

  useEffect(() => {
    let mounted = true
    async function ensureOwnersLoaded() {
      if (!dbConfigDrawerOpen) return
      if (dbOwnerStrategies.length > 0 && dbOwnerModels.length > 0) return

      setDbOwnerLoading(true)
      setDbOwnerError(null)
      try {
        const [strategies, models] = await Promise.all([
          api<Strategy[]>('/strategylab/strategies?lite=1&limit=200'),
          api<Model[]>('/strategylab/models'),
        ])
        if (!mounted) return
        setDbOwnerStrategies(strategies || [])
        setDbOwnerModels(models || [])
      } catch (err) {
        if (!mounted) return
        setDbOwnerError(err instanceof Error ? err.message : 'Failed to load owners')
      } finally {
        if (mounted) setDbOwnerLoading(false)
      }
    }

    void ensureOwnersLoaded()
    return () => {
      mounted = false
    }
  }, [dbConfigDrawerOpen, dbOwnerModels.length, dbOwnerStrategies.length])

  const activateDbConfig = useCallback(async (config_id: string) => {
    if (!config_id) return
    setDbConfigError(null)
    try {
      await api(`/strategylab/configs/${encodeURIComponent(config_id)}/activate`, { method: 'POST' })
      if (dbConfigOwnerId) {
        await loadDbConfigs(dbConfigOwnerScope, dbConfigOwnerId)
      }
    } catch (err) {
      setDbConfigError(err instanceof Error ? err.message : 'Failed to activate config')
    }
  }, [dbConfigOwnerId, dbConfigOwnerScope, loadDbConfigs])

  useEffect(() => {
    let mounted = true

    async function loadOpenRouterModels() {
      if (selectedAiProvider !== 'openrouter') return
      if (openRouterModels.length > 0) return

      setOpenRouterLoading(true)
      setOpenRouterError(null)
      try {
        const data = await api<{ models: Array<{ id: string; name: string; is_free?: boolean }> }>('/ai/openrouter/models')
        if (!mounted) return
        setOpenRouterModels(data.models || [])
      } catch (err) {
        if (!mounted) return
        setOpenRouterError(err instanceof Error ? err.message : 'Failed to load OpenRouter models')
      } finally {
        if (mounted) setOpenRouterLoading(false)
      }
    }

    void loadOpenRouterModels()
    return () => {
      mounted = false
    }
  }, [selectedAiProvider, openRouterModels.length])

  useEffect(() => {
    // Reset strategy editor when strategy changes
    setStrategySources([])
    setStrategySourcePath('')
    setStrategyEditorFilename('')
    setStrategyEditorText('')
    setStrategyEditorError(null)
    setStrategySourcesError(null)
    setStrategySaveMessage(null)
    setStrategyVariationName('')
  }, [selectedStrategyId])

  // Load bot data
  useEffect(() => {
    let mounted = true
    
    async function loadData() {
      if (!bot.bot_id) return
      
      setLoading(true)
      setError(null)
      
      try {
        // Load trades
        const tradesData = await api<Trade[]>(`/trading/bots/${bot.bot_id}/trades?limit=50`)
        if (mounted) setTrades(tradesData)
        
        // Load sessions
        const sessionsData = await api<BotSession[]>(`/trading/bots/${bot.bot_id}/sessions?limit=5`)
        if (mounted) {
          setSessions(sessionsData)
          
          // Load stats from latest session
          if (sessionsData.length > 0) {
            const latestSession = sessionsData[0]
            try {
              const statsData = await api<SessionStats>(`/trading/sessions/${latestSession.session_id}/stats`)
              if (mounted) setStats(statsData)
            } catch (err) {
              console.warn('Failed to load session stats:', err)
            }
          }
        }

        // Load persisted backtests (DB)
        try {
          if (mounted) setBacktestsError(null)
          if (mounted) setBacktestsLoading(true)
          const bt = await listBotBacktests(bot.bot_id, { limit: 10, offset: 0 })
          if (mounted) setBacktests(bt)
        } catch (err) {
          if (mounted) setBacktestsError(err instanceof Error ? err.message : 'Failed to load backtests')
        } finally {
          if (mounted) setBacktestsLoading(false)
        }
      } catch (err) {
        console.error('Failed to load bot data:', err)
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    
    loadData()
    
    // Refresh every 30s if running
    const interval = isRunning ? setInterval(loadData, 30000) : undefined
    
    return () => {
      mounted = false
      if (interval) clearInterval(interval)
    }
  }, [bot.bot_id, isRunning])

  const runBotBacktest = useCallback(async () => {
    setRunBacktestBusy(true)
    setRunBacktestMessage(null)
    setBacktestsError(null)
    try {
      const res = await api<any>(`/strategylab/bots/${encodeURIComponent(bot.bot_id)}/backtest`, { method: 'POST' })
      const wr = typeof res?.backtest?.win_rate === 'number' ? res.backtest.win_rate : undefined
      const tr = typeof res?.backtest?.total_return === 'number' ? res.backtest.total_return : undefined
      setRunBacktestMessage(
        `Backtest completed${wr !== undefined ? ` • Win rate: ${wr.toFixed(1)}%` : ''}${tr !== undefined ? ` • Return: ${tr.toFixed(2)}%` : ''}`
      )
      const bt = await listBotBacktests(bot.bot_id, { limit: 10, offset: 0 })
      setBacktests(bt)
    } catch (err) {
      setBacktestsError(err instanceof Error ? err.message : 'Backtest failed')
    } finally {
      setRunBacktestBusy(false)
    }
  }, [bot.bot_id])

  // Calculate stats from trades if no session stats available
  const calculatedStats = useMemo(() => {
    if (stats) {
      return {
        profit: formatFixed(stats.total_pnl, 2),
        profitPct: formatFixed(stats.balance_change_percent, 2),
        trades: toFiniteNumber(stats.total_trades) ?? 0,
        winRate: formatFixed(stats.win_rate, 1),
        openTrades: toFiniteNumber(stats.open_positions) ?? 0,
        balance: '---',
        avgWin: '---',
        avgLoss: '---',
        maxDrawdown: '---',
        sharpe: '---',
      }
    }
    
    // Calculate from trades
    const openTrades = trades.filter(t => t.status === 'open')
    const closedTrades = trades.filter(t => t.status === 'closed')
    const winningTrades = closedTrades.filter(t => (t.profit || 0) > 0)
    
    const totalProfit = closedTrades.reduce((sum, t) => sum + (t.profit || 0), 0)
    const wins = winningTrades.map(t => t.profit || 0)
    const losses = closedTrades.filter(t => (t.profit || 0) < 0).map(t => Math.abs(t.profit || 0))
    
    return {
      profit: totalProfit.toFixed(2),
      profitPct: '---',
      trades: closedTrades.length,
      winRate: closedTrades.length > 0 ? ((winningTrades.length / closedTrades.length) * 100).toFixed(1) : '0.0',
      openTrades: openTrades.length,
      balance: '---',
      avgWin: wins.length > 0 ? (wins.reduce((a, b) => a + b, 0) / wins.length).toFixed(2) : '0.00',
      avgLoss: losses.length > 0 ? (losses.reduce((a, b) => a + b, 0) / losses.length).toFixed(2) : '0.00',
      maxDrawdown: '---',
      sharpe: '---',
    }
  }, [stats, trades])

  const openTrades = trades.filter(t => t.status === 'open')
  const closedTrades = trades.filter(t => t.status === 'closed')
  const isProfitable = parseFloat(calculatedStats.profit) > 0

  return (
    <div style={{
      borderRadius: BORDER_RADIUS.md,
      border: `${BORDER_WIDTH.thin} solid var(--border)`,
      background: 'var(--surface)',
      marginBottom: SPACING.sm,
      overflow: 'hidden',
    }}>
      {/* Main Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '200px 120px 80px 100px 80px 80px 80px 80px 120px auto',
        gap: SPACING.md,
        padding: PADDING.section,
        alignItems: 'center',
        fontSize: FONT_SIZE.md,
      }}>
        {/* Bot ID as Code */}
        <div>
          <ModuleBadge
            icon="🤖"
            color={MODULE_COLORS.bot}
            text={bot.bot_id.slice(0, 12)}
            title={bot.bot_id}
          />
          <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--text-secondary)', marginTop: GAP.xs }}>
            Bot Code
          </div>
        </div>

        {/* Strategy + Model */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: GAP.xs }}>
          <ModuleBadge icon="📊" color={MODULE_COLORS.strategy} text={strategy?.name || 'N/A'} />
          <ModuleBadge icon="🧠" color={MODULE_COLORS.model} text={model?.name || 'N/A'} />
        </div>

        {/* Status */}
        <div style={{
          padding: '6px 10px',
          borderRadius: BORDER_RADIUS.sm,
          fontSize: FONT_SIZE.xs,
          fontWeight: FONT_WEIGHT.bold,
          textAlign: 'center',
          background: isRunning ? STATUS_COLORS.success.bg : STATUS_COLORS.error.bg,
          color: isRunning ? STATUS_COLORS.success.text : STATUS_COLORS.error.text,
        }}>
          {isRunning ? '● RUN' : '○ STOP'}
        </div>

        {/* Profit */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ 
            fontWeight: FONT_WEIGHT.bold, 
            color: isProfitable ? MODULE_COLORS.strategy : STATUS_COLORS.error.text,
          }}>
            {isProfitable ? '+' : ''}${calculatedStats.profit}
          </div>
          <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--text-secondary)' }}>
            {calculatedStats.profitPct !== '---' ? (isProfitable ? '+' : '') + calculatedStats.profitPct + '%' : '---'}
          </div>
        </div>

        {/* Win Rate */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: FONT_WEIGHT.semibold }}>{calculatedStats.winRate}%</div>
          <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--text-secondary)' }}>win rate</div>
        </div>

        {/* Trades */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: FONT_WEIGHT.semibold }}>{calculatedStats.trades}</div>
          <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--text-secondary)' }}>trades</div>
        </div>

        {/* Avg Win/Loss */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: FONT_SIZE.sm, color: MODULE_COLORS.strategy }}>+{calculatedStats.avgWin}%</div>
          <div style={{ fontSize: FONT_SIZE.sm, color: STATUS_COLORS.error.text }}>-{calculatedStats.avgLoss}%</div>
        </div>

        {/* Drawdown */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: FONT_WEIGHT.semibold, color: STATUS_COLORS.error.text }}>{calculatedStats.maxDrawdown}%</div>
          <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--text-secondary)' }}>drawdown</div>
        </div>

        {/* Exchange + Mode */}
        <div>
          <div style={{ fontSize: FONT_SIZE.sm }}>{bot.exchange}</div>
          <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--text-secondary)' }}>{bot.mode}</div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: GAP.sm, justifyContent: 'flex-end' }}>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              padding: '6px 12px',
              borderRadius: BORDER_RADIUS.sm,
              border: `${BORDER_WIDTH.thin} solid var(--border)`,
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: FONT_SIZE.sm,
              cursor: 'pointer',
              transition: `all ${TRANSITION.fast}`,
            }}
            title="Show trades"
          >
            {expanded ? '▲' : '▼'}
          </button>
          {isRunning ? (
            <button
              onClick={onStop}
              disabled={busy}
              style={{
                padding: '6px 12px',
                borderRadius: BORDER_RADIUS.sm,
                border: 'none',
                background: busy ? 'var(--border)' : STATUS_COLORS.error.text,
                color: '#fff',
                fontSize: FONT_SIZE.sm,
                fontWeight: FONT_WEIGHT.semibold,
                cursor: busy ? 'not-allowed' : 'pointer',
                transition: `all ${TRANSITION.fast}`,
              }}
            >
              ■ Stop
            </button>
          ) : (
            <button
              onClick={onDeploy}
              disabled={busy}
              style={{
                padding: '6px 12px',
                borderRadius: BORDER_RADIUS.sm,
                border: 'none',
                background: busy ? 'var(--border)' : MODULE_COLORS.strategy,
                color: '#fff',
                fontSize: FONT_SIZE.sm,
                fontWeight: FONT_WEIGHT.semibold,
                cursor: busy ? 'not-allowed' : 'pointer',
                transition: `all ${TRANSITION.fast}`,
              }}
            >
              ▶ Start
            </button>
          )}
        </div>
      </div>

      {/* Expanded Trades */}
      {expanded && (
        <div style={{
          borderTop: `${BORDER_WIDTH.thin} solid var(--border)`,
          background: 'var(--bg)',
          padding: SPACING.lg,
        }}>
          <div style={{ marginBottom: SPACING.lg }}>
            <CollapsibleSection
              title="Backtests"
              icon="🧪"
              defaultExpanded={false}
              variant="card"
              headerActions={
                <button
                  onClick={() => void runBotBacktest()}
                  disabled={busy || runBacktestBusy}
                  style={{
                    padding: '6px 10px',
                    borderRadius: BORDER_RADIUS.sm,
                    border: `${BORDER_WIDTH.thin} solid var(--border)`,
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: FONT_SIZE.sm,
                    cursor: busy || runBacktestBusy ? 'not-allowed' : 'pointer',
                  }}
                  title="Run backtest for this bot"
                >
                  {runBacktestBusy ? 'Running…' : 'Run backtest'}
                </button>
              }
            >
              {runBacktestMessage && (
                <div style={{
                  padding: SPACING.md,
                  background: STATUS_COLORS.success.bg,
                  borderRadius: BORDER_RADIUS.sm,
                  color: STATUS_COLORS.success.text,
                  fontSize: FONT_SIZE.md,
                  marginBottom: SPACING.md,
                }}>
                  {runBacktestMessage}
                </div>
              )}

              {backtestsError && (
                <div style={{
                  padding: SPACING.md,
                  background: STATUS_COLORS.error.bg,
                  borderRadius: BORDER_RADIUS.sm,
                  color: STATUS_COLORS.error.text,
                  fontSize: FONT_SIZE.md,
                  marginBottom: SPACING.md,
                }}>
                  {backtestsError}
                </div>
              )}

              <div style={{
                borderRadius: BORDER_RADIUS.sm,
                border: `${BORDER_WIDTH.thin} solid var(--border)`,
                background: 'var(--surface)',
                overflowX: 'auto',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT_SIZE.sm }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: `${BORDER_WIDTH.thin} solid var(--border)` }}>
                      <th style={{ padding: '10px 12px' }}>Created</th>
                      <th style={{ padding: '10px 12px' }}>Status</th>
                      <th style={{ padding: '10px 12px' }}>Return %</th>
                      <th style={{ padding: '10px 12px' }}>Win %</th>
                      <th style={{ padding: '10px 12px' }}>Sharpe</th>
                      <th style={{ padding: '10px 12px' }}>DD %</th>
                      <th style={{ padding: '10px 12px' }}>Trades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backtestsLoading ? (
                      <tr>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }} colSpan={7}>
                          Loading…
                        </td>
                      </tr>
                    ) : backtests.length === 0 ? (
                      <tr>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }} colSpan={7}>
                          No backtests yet.
                        </td>
                      </tr>
                    ) : (
                      backtests.map((b) => {
                        const ret = toFiniteNumber(b.total_return_percent)
                        const wr = toFiniteNumber(b.win_rate)
                        const sharpe = toFiniteNumber(b.sharpe_ratio)
                        const dd = toFiniteNumber(b.max_drawdown_percent)
                        const created = b.created_at ? new Date(b.created_at).toLocaleString() : '—'

                        return (
                          <tr key={b.backtest_id} style={{ borderBottom: `${BORDER_WIDTH.thin} solid var(--border)` }}>
                            <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{created}</td>
                            <td style={{ padding: '10px 12px' }}>{b.status}</td>
                            <td style={{ padding: '10px 12px' }}>{ret !== null ? formatFixed(ret, 2) : '—'}</td>
                            <td style={{ padding: '10px 12px' }}>{wr !== null ? formatFixed(wr, 1) : '—'}</td>
                            <td style={{ padding: '10px 12px' }}>{sharpe !== null ? formatFixed(sharpe, 2) : '—'}</td>
                            <td style={{ padding: '10px 12px' }}>{dd !== null ? formatFixed(dd, 2) : '—'}</td>
                            <td style={{ padding: '10px 12px' }}>{b.total_trades ?? 0}</td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          </div>

          {workflowRunId && (
            <div style={{ marginBottom: SPACING.lg }}>
              <CollapsibleSection
                title="Workflow execution"
                icon="🧩"
                defaultExpanded={false}
                variant="card"
                headerActions={
                  <button
                    onClick={() => void refreshWorkflowExecution()}
                    disabled={workflowExecLoading}
                    style={{
                      padding: '6px 10px',
                      borderRadius: BORDER_RADIUS.sm,
                      border: `${BORDER_WIDTH.thin} solid var(--border)`,
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      fontSize: FONT_SIZE.sm,
                      cursor: workflowExecLoading ? 'not-allowed' : 'pointer',
                    }}
                    title="Refresh execution"
                  >
                    {workflowExecLoading ? 'Loading…' : 'Refresh'}
                  </button>
                }
              >
                {workflowExecError && (
                  <div style={{
                    padding: SPACING.md,
                    background: STATUS_COLORS.error.bg,
                    borderRadius: BORDER_RADIUS.sm,
                    color: STATUS_COLORS.error.text,
                    fontSize: FONT_SIZE.md,
                    marginBottom: SPACING.md,
                  }}>
                    {workflowExecError}
                  </div>
                )}

                <div style={{ display: 'grid', gap: GAP.xs, marginBottom: SPACING.md }}>
                  <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--text-secondary)' }}>
                    run_id: <span style={{ fontFamily: 'monospace', color: 'var(--text)' }}>{workflowRunId}</span>
                  </div>
                  {workflowExec?.run?.status && (
                    <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--text-secondary)' }}>
                      status: <span style={{ color: 'var(--text)' }}>{workflowExec.run.status}</span>
                    </div>
                  )}
                  {workflowExec?.stats && (
                    <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--text-secondary)' }}>
                      nodes: <span style={{ color: 'var(--text)' }}>{workflowExec.stats.total_nodes}</span>
                      {' · '}duration: <span style={{ color: 'var(--text)' }}>{workflowExec.stats.run_duration_ms ?? '—'} ms</span>
                    </div>
                  )}
                </div>

                <div style={{
                  borderRadius: BORDER_RADIUS.sm,
                  border: `${BORDER_WIDTH.thin} solid var(--border)`,
                  background: 'var(--surface)',
                  overflowX: 'auto',
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT_SIZE.sm }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: `${BORDER_WIDTH.thin} solid var(--border)` }}>
                        <th style={{ padding: '10px 12px' }}>Node</th>
                        <th style={{ padding: '10px 12px' }}>Kind</th>
                        <th style={{ padding: '10px 12px' }}>Status</th>
                        <th style={{ padding: '10px 12px' }}>Duration</th>
                        <th style={{ padding: '10px 12px' }}>Summary / Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workflowExecLoading ? (
                        <tr>
                          <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }} colSpan={5}>
                            Loading…
                          </td>
                        </tr>
                      ) : !workflowExec?.nodes?.length ? (
                        <tr>
                          <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }} colSpan={5}>
                            No nodes yet.
                          </td>
                        </tr>
                      ) : (
                        (() => {
                          const timingByNodeId = new Map<string, number | null>()
                          for (const t of workflowExec.timings || []) {
                            timingByNodeId.set(t.node_id, t.duration_ms ?? null)
                          }

                          const summarize = (outputs: any): string => {
                            if (!outputs) return ''
                            const summary = (outputs as any).summary
                            if (!summary) return ''
                            try {
                              const s = typeof summary === 'string' ? summary : JSON.stringify(summary)
                              return s.length > 140 ? s.slice(0, 140) + '…' : s
                            } catch {
                              return '[summary]'
                            }
                          }

                          return workflowExec.nodes.map((n) => {
                            const dur = timingByNodeId.get(n.node_id)
                            const err = n.error_message ? String(n.error_message) : ''
                            const sum = summarize(n.outputs)
                            const msg = err || sum || ''
                            const meta = kindMetaByKind.get(n.kind)
                            const kindLabel = meta?.label ?? n.kind
                            const kindTitle = meta?.description ? `${n.kind} — ${meta.description}` : n.kind
                            return (
                              <tr key={n.run_node_id} style={{ borderBottom: `${BORDER_WIDTH.thin} solid var(--border)` }}>
                                <td style={{ padding: '10px 12px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{n.node_id}</td>
                                <td style={{ padding: '10px 12px', fontFamily: 'monospace' }} title={kindTitle}>{kindLabel}</td>
                                <td style={{ padding: '10px 12px' }}>{n.status}</td>
                                <td style={{ padding: '10px 12px' }}>{dur === null || dur === undefined ? '—' : `${dur} ms`}</td>
                                <td style={{ padding: '10px 12px', color: err ? STATUS_COLORS.error.text : 'var(--text-secondary)' }}>
                                  {msg || '—'}
                                </td>
                              </tr>
                            )
                          })
                        })()
                      )}
                    </tbody>
                  </table>
                </div>
              </CollapsibleSection>
            </div>
          )}

          <div style={{ marginBottom: SPACING.lg }}>
            <CollapsibleSection
              title="Config tuning menu"
              icon="⚙️"
              defaultExpanded={false}
              variant="card"
            >
              <div style={{ display: 'grid', gap: SPACING.md }}>
                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: SPACING.md, alignItems: 'center' }}>
                  <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--text-secondary)' }}>Exchange</div>
                  <select
                    value={selectedExchange}
                    onChange={(e) => setSelectedExchange(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: BORDER_RADIUS.sm,
                      border: `${BORDER_WIDTH.thin} solid var(--border)`,
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      fontSize: FONT_SIZE.md,
                    }}
                  >
                    <option value="" disabled>Select exchange</option>
                    {bot.exchange ? <option value={bot.exchange}>{bot.exchange}</option> : null}
                    <option value="binance">binance</option>
                    <option value="bybit">bybit</option>
                    <option value="kucoin">kucoin</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: SPACING.md, alignItems: 'center' }}>
                  <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--text-secondary)' }}>Exchange token</div>
                  <input
                    type="password"
                    value={exchangeToken}
                    onChange={(e) => setExchangeToken(e.target.value)}
                    placeholder="Paste exchange API token"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: BORDER_RADIUS.sm,
                      border: `${BORDER_WIDTH.thin} solid var(--border)`,
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      fontSize: FONT_SIZE.md,
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: SPACING.md, alignItems: 'center' }}>
                  <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--text-secondary)' }}>AI agent</div>
                  <select
                    value={selectedAiProvider}
                    onChange={(e) => {
                      const v = e.target.value as 'openai' | 'anthropic' | 'openrouter' | 'local' | ''
                      setSelectedAiProvider(v)
                      window.localStorage.setItem('ai_provider', v)
                      void saveMeSettings({ ai_provider: v || null }).catch(() => {})
                      if (v !== 'openrouter') {
                        setOpenRouterModelId('')
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: BORDER_RADIUS.sm,
                      border: `${BORDER_WIDTH.thin} solid var(--border)`,
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      fontSize: FONT_SIZE.md,
                    }}
                  >
                    <option value="" disabled>Select AI provider</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="local">Local</option>
                  </select>
                </div>

                {selectedAiProvider === 'openrouter' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: SPACING.md, alignItems: 'center' }}>
                    <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--text-secondary)' }}>OpenRouter model</div>
                    <div style={{ display: 'grid', gap: GAP.xs }}>
                      <select
                        value={openRouterModelId}
                        onChange={(e) => {
                          const v = e.target.value
                          setOpenRouterModelId(v)
                          window.localStorage.setItem('openrouter_model_id', v)
                          void saveMeSettings({ openrouter_model_id: v || null }).catch(() => {})
                        }}
                        disabled={openRouterLoading || !!openRouterError}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: BORDER_RADIUS.sm,
                          border: `${BORDER_WIDTH.thin} solid var(--border)`,
                          background: 'var(--surface)',
                          color: 'var(--text)',
                          fontSize: FONT_SIZE.md,
                        }}
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
                      {selectedOpenRouterModel?.is_free && (
                        <div style={{ fontSize: FONT_SIZE.xs, color: STATUS_COLORS.success.text }}>
                          FREE model
                        </div>
                      )}
                      {openRouterError && (
                        <div style={{ fontSize: FONT_SIZE.xs, color: STATUS_COLORS.error.text }}>
                          {openRouterError}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: SPACING.md, alignItems: 'center' }}>
                  <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--text-secondary)' }}>AI agent token</div>
                  <input
                    type="password"
                    value={aiProviderToken}
                    onChange={(e) => {
                      const v = e.target.value
                      setAiProviderToken(v)
                      window.localStorage.setItem('ai_provider_token', v)

                      // Persist to account with a small debounce so refresh doesn't lose it.
                      if (aiTokenSaveTimerRef.current) window.clearTimeout(aiTokenSaveTimerRef.current)
                      aiTokenSaveTimerRef.current = window.setTimeout(() => {
                        void saveMeSettings({
                          ai_provider: selectedAiProvider || null,
                          ai_token: v,
                        }).catch(() => {})
                      }, 650)
                    }}
                    onBlur={() => {
                      void saveMeSettings({
                        ai_provider: selectedAiProvider || null,
                        ai_token: aiProviderToken,
                      }).catch(() => {})
                    }}
                    placeholder="Paste AI provider token"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: BORDER_RADIUS.sm,
                      border: `${BORDER_WIDTH.thin} solid var(--border)`,
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      fontSize: FONT_SIZE.md,
                    }}
                  />
                  {meSettings?.has_ai_token && !aiProviderToken.trim() && (
                    <div style={{ fontSize: FONT_SIZE.xs, color: STATUS_COLORS.success.text }}>
                      Token is saved on your account (not shown).
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleSection>
          </div>

          <div style={{ marginBottom: SPACING.lg }}>
            <CollapsibleSection
              title="Strategy / Model / Alignment"
              icon="🧩"
              defaultExpanded={false}
              variant="card"
            >
              <div style={{ display: 'grid', gap: SPACING.md }}>
                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr auto', gap: SPACING.md, alignItems: 'center' }}>
                  <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--text-secondary)' }}>Strategy</div>
                  <select
                    value={selectedStrategyId}
                    disabled
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: BORDER_RADIUS.sm,
                      border: `${BORDER_WIDTH.thin} solid var(--border)`,
                      background: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontSize: FONT_SIZE.md,
                    }}
                  >
                    <option value={selectedStrategyId}>{strategy?.name || selectedStrategyId || '—'}</option>
                  </select>

                  <button
                    onClick={() => void openDbConfigsDrawer('strategy', selectedStrategyId)}
                    disabled={!selectedStrategyId}
                    style={{
                      padding: '6px 10px',
                      borderRadius: BORDER_RADIUS.sm,
                      border: `${BORDER_WIDTH.thin} solid var(--border)`,
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      fontSize: FONT_SIZE.sm,
                      cursor: selectedStrategyId ? 'pointer' : 'not-allowed',
                      whiteSpace: 'nowrap',
                    }}
                    title="Edit strategy config versions (DB)"
                  >
                    ⚙️ Configs
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr auto', gap: SPACING.md, alignItems: 'center' }}>
                  <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--text-secondary)' }}>Model</div>
                  <select
                    value={selectedModelId}
                    disabled
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: BORDER_RADIUS.sm,
                      border: `${BORDER_WIDTH.thin} solid var(--border)`,
                      background: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontSize: FONT_SIZE.md,
                    }}
                  >
                    <option value={selectedModelId}>{model?.name || selectedModelId || '—'}</option>
                  </select>

                  <button
                    onClick={() => void openDbConfigsDrawer('model', selectedModelId)}
                    disabled={!selectedModelId}
                    style={{
                      padding: '6px 10px',
                      borderRadius: BORDER_RADIUS.sm,
                      border: `${BORDER_WIDTH.thin} solid var(--border)`,
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      fontSize: FONT_SIZE.sm,
                      cursor: selectedModelId ? 'pointer' : 'not-allowed',
                      whiteSpace: 'nowrap',
                    }}
                    title="Edit model config versions (DB)"
                  >
                    ⚙️ Configs
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr auto', gap: SPACING.md, alignItems: 'center' }}>
                  <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--text-secondary)' }}>Alignment</div>
                  <select
                    value={alignmentIdForConfig}
                    disabled
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: BORDER_RADIUS.sm,
                      border: `${BORDER_WIDTH.thin} solid var(--border)`,
                      background: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontSize: FONT_SIZE.md,
                      fontFamily: 'monospace',
                    }}
                  >
                    <option value={alignmentIdForConfig}>{alignmentIdForConfig || '—'}</option>
                  </select>

                  <button
                    onClick={() => void openDbConfigsDrawer('alignment', alignmentIdForConfig)}
                    disabled={!alignmentIdForConfig}
                    style={{
                      padding: '6px 10px',
                      borderRadius: BORDER_RADIUS.sm,
                      border: `${BORDER_WIDTH.thin} solid var(--border)`,
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      fontSize: FONT_SIZE.sm,
                      cursor: alignmentIdForConfig ? 'pointer' : 'not-allowed',
                      whiteSpace: 'nowrap',
                    }}
                    title="Edit alignment config versions (DB)"
                  >
                    ⚙️ Configs
                  </button>
                </div>
              </div>
            </CollapsibleSection>
          </div>

          <div style={{ marginBottom: 24 }}>
            <CollapsibleSection
              title="Advanced Config Editor"
              icon="📝"
              defaultExpanded={true}
              variant="card"
            >
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => navigate('/strategylab/editor')}
                  style={{
                    padding: '6px 10px',
                    borderRadius: BORDER_RADIUS.sm,
                    border: `${BORDER_WIDTH.thin} solid var(--border)`,
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: FONT_SIZE.sm,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  title="Open sequential Deploy Wizard (strategy config → model config → pairs → run)"
                >
                  Open Deploy Wizard
                </button>
              </div>
              <div style={{ height: '700px', display: 'flex', flexDirection: 'column' }}>
                 <UniversalEditor
                    scope={dbConfigOwnerScope || 'alignment'}
                    id={dbConfigOwnerId || alignmentIdForConfig}
                    embedded={true}
                 />
              </div>
            </CollapsibleSection>
          </div>

        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CombinatorPageV2() {
  const navigate = useNavigate()
  // Data
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [models, setModels] = useState<Model[]>([])
  const [alignments, setAlignments] = useState<Alignment[]>([])
  const [bots, setBots] = useState<Bot[]>([])
  const [containerStatuses, setContainerStatuses] = useState<Record<string, ContainerStatus>>({})

  const [meSettings, setMeSettings] = useState<{
    ai_provider: string | null
    openrouter_model_id: string | null
    has_ai_token: boolean
  } | null>(null)

  // Selection
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [selectedAlignmentId, setSelectedAlignmentId] = useState<string | null>(null)

  // UI state
  const [expandedColumns, setExpandedColumns] = useState({
    strategies: true,
    strategiesEdited: false,
    models: true,
    modelsEdited: false,
    alignments: true,
  })
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadMeSettings = useCallback(async () => {
    try {
      const s = await api<{ ai_provider: string | null; openrouter_model_id: string | null; has_ai_token: boolean }>(
        '/auth/me/settings'
      )
      setMeSettings(s)
    } catch {
      // ignore (unauthenticated or unavailable)
    }
  }, [])

  const saveMeSettings = useCallback(
    async (patch: { ai_provider?: string | null; openrouter_model_id?: string | null; ai_token?: string | null }) => {
      try {
        const s = await api<{ ai_provider: string | null; openrouter_model_id: string | null; has_ai_token: boolean }>(
          '/auth/me/settings',
          {
            method: 'PUT',
            body: JSON.stringify(patch),
          }
        )
        setMeSettings(s)
      } catch {
        // ignore
      }
    },
    []
  )

  // Split strategies/models into base and edited
  const baseStrategies = useMemo(() => 
    strategies.filter(s => !s.meta?.base_slug || s.slug === s.meta.base_slug)
  , [strategies])
  
  const editedStrategies = useMemo(() => 
    strategies.filter(s => s.meta?.base_slug && s.slug !== s.meta.base_slug)
  , [strategies])

  const baseModels = useMemo(() => 
    models.filter(m => !m.config?.base_slug || m.slug === m.config.base_slug)
  , [models])
  
  const editedModels = useMemo(() => 
    models.filter(m => m.config?.base_slug && m.slug !== m.config.base_slug)
  , [models])

  // Maps
  const strategyById = useMemo(() => new Map(strategies.map(s => [s.strategy_id, s])), [strategies])
  const modelById = useMemo(() => new Map(models.map(m => [m.model_id, m])), [models])

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [strategiesRes, modelsRes, alignmentsRes, botsRes] = await Promise.all([
        api<Strategy[]>('/strategylab/strategies?lite=1&limit=200'),
        api<Model[]>('/strategylab/models?limit=200'),
        api<Alignment[]>('/strategylab/alignments?limit=200'),
        api<Bot[]>('/trading/bots?limit=100'),
      ])
      setStrategies(strategiesRes)
      setModels(modelsRes)
      setAlignments(alignmentsRes)
      setBots(botsRes)

      // Load statuses
      const statuses: Record<string, ContainerStatus> = {}
      await Promise.all(botsRes.map(async bot => {
        try {
          const status = await api<ContainerStatus>(`/trading/bots/${bot.bot_id}/container-status`)
          statuses[bot.bot_id] = status
        } catch {
          statuses[bot.bot_id] = { bot_id: bot.bot_id, container_name: '', status: 'unknown' }
        }
      }))
      setContainerStatuses(statuses)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    void loadMeSettings()
  }, [loadMeSettings])

  // Auto-sync alignment when strategy/model selected
  useEffect(() => {
    if (selectedStrategyId && selectedModelId && !selectedAlignmentId) {
      // Find matching alignment
      const matching = alignments.find(
        a => a.strategy_id === selectedStrategyId && a.model_id === selectedModelId
      )
      if (matching) {
        setSelectedAlignmentId(matching.alignment_id)
      }
    }
  }, [selectedStrategyId, selectedModelId, selectedAlignmentId, alignments])

  // Current alignment
  const currentAlignment = useMemo(() => {
    if (selectedAlignmentId) {
      return alignments.find(a => a.alignment_id === selectedAlignmentId) || null
    }
    if (selectedStrategyId && selectedModelId) {
      return alignments.find(a => a.strategy_id === selectedStrategyId && a.model_id === selectedModelId) || null
    }
    return null
  }, [alignments, selectedStrategyId, selectedModelId, selectedAlignmentId])

  // Actions
  async function createAlignment() {
    if (!selectedStrategyId || !selectedModelId) return
    setBusy(true)
    setError(null)
    try {
      const result = await api<Alignment>('/strategylab/alignments', {
        method: 'POST',
        body: JSON.stringify({
          strategy_id: selectedStrategyId,
          model_id: selectedModelId,
          profile: 'default',
          status: 'draft',
        }),
      })
      setAlignments(prev => [...prev, result])
      setSelectedAlignmentId(result.alignment_id)
      setMessage('✅ Alignment created')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function generateBot() {
    if (!currentAlignment) {
      setError('Select or create alignment first')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await api<{ bot_id: string; bot_name: string }>(
        `/strategylab/alignments/${currentAlignment.alignment_id}/generate-bot`,
        { method: 'POST' }
      )
      setMessage(`✅ Bot generated: ${result.bot_name}`)
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function deployBot(botId: string) {
    setBusy(true)
    setError(null)
    try {
      await api(`/trading/bots/${botId}/deploy`, { method: 'POST' })
      setMessage('✅ Bot deployed')
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deploy failed')
    } finally {
      setBusy(false)
    }
  }

  async function stopBot(botId: string) {
    setBusy(true)
    setError(null)
    try {
      await api(`/trading/bots/${botId}/stop`, { method: 'POST' })
      setMessage('✅ Bot stopped')
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stop failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'var(--bg)',
      overflowY: 'auto',
      padding: SPACING.xxl,
      display: 'flex',
      flexDirection: 'column',
      gap: SPACING.xxl,
    }}>
      {/* Top: Bot Generator Section */}
      <CollapsibleSection
        title="Bot Generator"
        icon="🤖"
        variant="card"
        defaultExpanded={true}
          headerActions={
            <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'center' }}>
              <a
                href="/strategylab/graphs"
                style={{
                  padding: SPACING.sm + 'px ' + SPACING.lg + 'px',
                  borderRadius: BORDER_RADIUS.sm,
                  border: `${BORDER_WIDTH.thin} solid var(--border)`,
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: FONT_SIZE.md,
                  textDecoration: 'none',
                  transition: `all ${TRANSITION.fast}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
                title="n8n-style editor: drag blocks + connect arrows"
              >
                🧩 Node Graphs
              </a>

              <button
                onClick={loadData}
                disabled={busy}
                style={{
                  padding: SPACING.sm + 'px ' + SPACING.lg + 'px',
                  borderRadius: BORDER_RADIUS.sm,
                  border: `${BORDER_WIDTH.thin} solid var(--border)`,
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: FONT_SIZE.md,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  transition: `all ${TRANSITION.fast}`,
                }}
              >
                🔄 Refresh
              </button>
            </div>
          }
        >
          <div style={{ marginBottom: SPACING.lg }}>
            <p style={{ fontSize: FONT_SIZE.md, color: 'var(--text-secondary)', margin: `0 0 ${SPACING.lg}px 0` }}>
              Select strategy + model → Create alignment → Generate bot
            </p>

            {/* Messages */}
            {(error || message) && (
              <div style={{ marginBottom: SPACING.lg }}>
                {error && (
                  <div style={{
                    padding: SPACING.md,
                    borderRadius: BORDER_RADIUS.md,
                    background: STATUS_COLORS.error.bg,
                    color: STATUS_COLORS.error.text,
                    fontSize: FONT_SIZE.md,
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}>
                    <span>❌ {error}</span>
                    <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: STATUS_COLORS.error.text }}>✕</button>
                  </div>
                )}
                {message && (
                  <div style={{
                    padding: SPACING.md,
                    borderRadius: BORDER_RADIUS.md,
                    background: STATUS_COLORS.success.bg,
                    color: STATUS_COLORS.success.text,
                    fontSize: FONT_SIZE.md,
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}>
                    <span>{message}</span>
                    <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: STATUS_COLORS.success.text }}>✕</button>
                  </div>
                )}
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div style={{
                padding: SPACING.md,
                borderRadius: BORDER_RADIUS.md,
                background: 'var(--surface)',
                color: 'var(--text-secondary)',
                fontSize: FONT_SIZE.md,
                textAlign: 'center',
              }}>
                ⏳ Loading data...
              </div>
            )}
          </div>

          {/* Collapsible Columns Grid */}
          {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: SPACING.md }}>
          {/* Strategies */}
          <CollapsibleSection
            title={`📊 Strategies (${baseStrategies.length})`}
            defaultExpanded={expandedColumns.strategies}
            variant="card"
            onToggle={(expanded) => setExpandedColumns(prev => ({ ...prev, strategies: expanded }))}
          >
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {baseStrategies.map(s => (
                <SelectableItem
                  key={s.strategy_id}
                  label={s.name}
                  sublabel={s.slug}
                  selected={selectedStrategyId === s.strategy_id}
                  onClick={() => {
                    setSelectedStrategyId(s.strategy_id)
                    setSelectedAlignmentId(null)
                  }}
                />
              ))}
            </div>
          </CollapsibleSection>

          {/* Strategies Edited */}
          <CollapsibleSection
            title={`✏️ Strategies Edited (${editedStrategies.length})`}
            defaultExpanded={expandedColumns.strategiesEdited}
            variant="card"
            onToggle={(expanded) => setExpandedColumns(prev => ({ ...prev, strategiesEdited: expanded }))}
          >
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {editedStrategies.map(s => (
                <SelectableItem
                  key={s.strategy_id}
                  label={s.name}
                  sublabel={s.slug}
                  selected={selectedStrategyId === s.strategy_id}
                  onClick={() => {
                    setSelectedStrategyId(s.strategy_id)
                    setSelectedAlignmentId(null)
                  }}
                  badge="var"
                />
              ))}
            </div>
          </CollapsibleSection>

          {/* Models */}
          <CollapsibleSection
            title={`🧠 Models (${baseModels.length})`}
            defaultExpanded={expandedColumns.models}
            variant="card"
            onToggle={(expanded) => setExpandedColumns(prev => ({ ...prev, models: expanded }))}
          >
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {baseModels.map(m => (
                <SelectableItem
                  key={m.model_id}
                  label={m.name}
                  sublabel={m.algorithm}
                  selected={selectedModelId === m.model_id}
                  onClick={() => {
                    setSelectedModelId(m.model_id)
                    setSelectedAlignmentId(null)
                  }}
                />
              ))}
            </div>
          </CollapsibleSection>

          {/* Models Edited */}
          <CollapsibleSection
            title={`✏️ Models Edited (${editedModels.length})`}
            defaultExpanded={expandedColumns.modelsEdited}
            variant="card"
            onToggle={(expanded) => setExpandedColumns(prev => ({ ...prev, modelsEdited: expanded }))}
          >
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {editedModels.map(m => (
                <SelectableItem
                  key={m.model_id}
                  label={m.name}
                  sublabel={m.algorithm}
                  selected={selectedModelId === m.model_id}
                  onClick={() => {
                    setSelectedModelId(m.model_id)
                    setSelectedAlignmentId(null)
                  }}
                  badge="var"
                />
              ))}
            </div>
          </CollapsibleSection>

          {/* Alignments */}
          <CollapsibleSection
            title={`🔗 Alignments (${alignments.length})`}
            defaultExpanded={expandedColumns.alignments}
            variant="card"
            onToggle={(expanded) => setExpandedColumns(prev => ({ ...prev, alignments: expanded }))}
          >
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {alignments.map(a => {
                const strategy = strategyById.get(a.strategy_id)
                const model = modelById.get(a.model_id)
                return (
                  <SelectableItem
                    key={a.alignment_id}
                    label={`${strategy?.name || 'N/A'} + ${model?.name || 'N/A'}`}
                    sublabel={a.alignment_id.slice(0, 12) + '...'}
                    selected={selectedAlignmentId === a.alignment_id}
                    onClick={() => {
                      setSelectedAlignmentId(a.alignment_id)
                      setSelectedStrategyId(a.strategy_id)
                      setSelectedModelId(a.model_id)
                    }}
                  />
                )
              })}
            </div>
          </CollapsibleSection>
          </div>
        )}

        {/* Action Buttons */}
        {!loading && selectedStrategyId && selectedModelId && (
          <div style={{ marginTop: SPACING.lg, display: 'flex', gap: SPACING.md }}>
            {!currentAlignment && (
              <button
                onClick={createAlignment}
                disabled={busy}
                style={{
                  padding: '10px 20px',
                  borderRadius: BORDER_RADIUS.md,
                  border: 'none',
                  background: busy ? 'var(--border)' : MODULE_COLORS.alignment,
                  color: '#fff',
                  fontWeight: FONT_WEIGHT.semibold,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  transition: `all ${TRANSITION.fast}`,
                }}
              >
                ➕ Create Alignment
              </button>
            )}
            <button
              onClick={generateBot}
              disabled={busy || !currentAlignment}
              style={{
                padding: '10px 20px',
                borderRadius: BORDER_RADIUS.md,
                border: 'none',
                background: busy || !currentAlignment ? 'var(--border)' : 'var(--primary)',
                color: '#fff',
                fontWeight: FONT_WEIGHT.semibold,
                cursor: busy || !currentAlignment ? 'not-allowed' : 'pointer',
                transition: `all ${TRANSITION.fast}`,
              }}
            >
              🤖 Generate Bot
            </button>
          </div>
        )}
      </CollapsibleSection>

      {/* Bottom: Bots List */}
      <CollapsibleSection
        title={`Active Bots (${bots.length})`}
        icon="🤖"
        variant="card"
        defaultExpanded={true}
      >
          {bots.length === 0 ? (
            <div style={{
              padding: SPACING.xxxl + SPACING.sm,
              textAlign: 'center',
              color: 'var(--text-secondary)',
              background: 'var(--bg)',
              borderRadius: BORDER_RADIUS.md,
            }}>
              No bots yet. Generate one from alignment above.
            </div>
          ) : (
            <div>
              {bots.map(bot => {
                const alignment = alignments.find(a => a.alignment_id === bot.alignment_id)
                const strategy = alignment ? strategyById.get(alignment.strategy_id) : undefined
                const model = alignment ? modelById.get(alignment.model_id) : undefined

                return (
                  <BotRow
                    key={bot.bot_id}
                    bot={bot}
                    containerStatus={containerStatuses[bot.bot_id]}
                    strategy={strategy}
                    model={model}
                    alignment={alignment}
                    onDeploy={() => deployBot(bot.bot_id)}
                    onStop={() => stopBot(bot.bot_id)}
                    meSettings={meSettings}
                    saveMeSettings={saveMeSettings}
                    busy={busy}
                    onMessage={setMessage}
                  />
                )
              })}
            </div>
          )}
      </CollapsibleSection>
    </div>
  )
}
