import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'

import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  type Connection,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  type NodeTypes,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'
import './nodeGraphs.reactflow.css'

import PageHeader from '../../shared/ui/PageHeader'
import Card from '../../shared/ui/Card'
import ErrorBanner from '../../shared/ui/ErrorBanner'
import { createGraph, createGraphRun, createGraphVersion, getGraphRunProgress, listGraphRunNodes, type NodeGraphRunNodeOut } from '../../services/api/graphsApi'
import { getNodeKindCatalog } from '../../services/nodeKindCatalog'
import type { NodeKindMetaOut } from '../../services/api/graphsApi'

type GraphNode = {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, any>
}

type GraphEdge = {
  id: string
  source: string
  target: string
}

type Viewport = { x: number; y: number; zoom: number }

type NodeGraphNodeData = {
  kind: string
  title: string
  config: Record<string, any>
}

type CatalogItem = {
  kind: string
  title: string
  defaultData?: Record<string, any>
}

type CatalogCategory = {
  title: string
  items: CatalogItem[]
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function formatJson(value: any): string {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return String(value)
  }
}

type PathToken = string | number

function inferJsonType(value: any): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function pathTokensToString(tokens: PathToken[]): string {
  let out = ''
  for (const t of tokens) {
    if (typeof t === 'number') {
      out += `[${t}]`
      continue
    }
    if (!out) out += t
    else out += `.${t}`
  }
  return out
}

function parsePathString(path: string): PathToken[] | null {
  const p = String(path ?? '').trim()
  if (!p) return []

  const tokens: PathToken[] = []
  const re = /([^.[\]]+)|\[(\d+)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(p)) !== null) {
    if (m[1] != null) tokens.push(m[1])
    else if (m[2] != null) tokens.push(Number(m[2]))
  }

  // If we didn't consume anything meaningful, treat as invalid.
  if (tokens.length === 0) return null
  return tokens
}

function walkJsonLeaves(value: any, prefix: PathToken[], cb: (path: PathToken[], leaf: any) => void) {
  if (value === null) {
    cb(prefix, null)
    return
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      cb(prefix, [])
      return
    }
    for (let i = 0; i < value.length; i += 1) {
      walkJsonLeaves(value[i], [...prefix, i], cb)
    }
    return
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0) {
      cb(prefix, {})
      return
    }
    for (const k of keys) {
      walkJsonLeaves(value[k], [...prefix, k], cb)
    }
    return
  }

  cb(prefix, value)
}

function setAtPath(root: any, tokens: PathToken[], value: any): any {
  if (tokens.length === 0) return value

  const [head, ...rest] = tokens
  const isIndex = typeof head === 'number'

  if (isIndex) {
    const idx = head as number
    const arr: any[] = Array.isArray(root) ? root.slice() : []
    // ensure length
    if (arr.length <= idx) arr.length = idx + 1
    arr[idx] = setAtPath(arr[idx], rest, value)
    return arr
  }

  const key = head as string
  const obj: Record<string, any> = root && typeof root === 'object' && !Array.isArray(root) ? { ...(root as any) } : {}
  obj[key] = setAtPath(obj[key], rest, value)
  return obj
}

export default function NodeGraphsPage() {
  return (
    <ReactFlowProvider>
      <NodeGraphsPageInner />
    </ReactFlowProvider>
  )
}

function NodeGraphsPageInner() {
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)

  const [kindMetaByKind, setKindMetaByKind] = useState<Map<string, NodeKindMetaOut>>(new Map())

  const [isSpacePanning, setIsSpacePanning] = useState(false)
  const [minimapVisible, setMinimapVisible] = useState(false)
  const minimapHideTimeoutRef = useRef<number | null>(null)
  const minimapHoveredRef = useRef(false)

  const [catalogOpen, setCatalogOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [catalogExpanded, setCatalogExpanded] = useState(false)
  const [inspectorExpanded, setInspectorExpanded] = useState(false)

  const [catalogQuery, setCatalogQuery] = useState('')
  const catalogQueryInputRef = useRef<HTMLInputElement | null>(null)

  const [catalogCollapsed, setCatalogCollapsed] = useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)

  const catalogTitleClickTimeoutRef = useRef<number | null>(null)
  const inspectorTitleClickTimeoutRef = useRef<number | null>(null)

  const [chatDockOpen, setChatDockOpen] = useState(false)
  const [chatDockCollapsed, setChatDockCollapsed] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant' | 'system'; text: string; ts: number }>>([])

  const [graphName, setGraphName] = useState('New graph')
  const [graphId, setGraphId] = useState<string | null>(null)
  const [versionId, setVersionId] = useState<string | null>(null)

  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 })

  const initialGraphNodes: GraphNode[] = useMemo(() => ([{
    id: 'n1',
    type: 'input.static',
    position: { x: 60, y: 60 },
    data: { value: { bot_ids: [], backtest_ids: [] } },
  }, {
    id: 'n2',
    type: 'analysis.compare',
    position: { x: 360, y: 60 },
    data: {},
  }]), [])

  const initialGraphEdges: GraphEdge[] = useMemo(() => ([{ id: 'e1', source: 'n1', target: 'n2' }]), [])

  const [rfNodes, setRfNodes, onRfNodesChange] = useNodesState<NodeGraphNodeData>(
    initialGraphNodes.map((n) => ({
      id: n.id,
      type: 'nodegraph',
      position: n.position,
      data: { kind: n.type, title: n.type, config: n.data },
    }))
  )
  const [rfEdges, setRfEdges, onRfEdgesChange] = useEdgesState<Edge>(
    initialGraphEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
    }))
  )

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const selectedNode = useMemo(() => rfNodes.find((n) => n.id === selectedNodeId) ?? null, [rfNodes, selectedNodeId])

  const clearSelection = useCallback(() => {
    setRfNodes((prev) => prev.map((n) => (n.selected ? { ...n, selected: false } : n)))
    setRfEdges((prev) => prev.map((e) => ((e as any).selected ? { ...(e as any), selected: false } : e)))
  }, [setRfNodes, setRfEdges])

  const deleteSelection = useCallback(() => {
    const selectedNodeIds = new Set(rfNodes.filter((n) => n.selected).map((n) => n.id))
    const selectedEdgeIds = new Set(rfEdges.filter((e) => (e as any).selected).map((e) => e.id))

    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0 && selectedNodeId) {
      selectedNodeIds.add(selectedNodeId)
    }
    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) return

    setRfEdges((prev) => prev.filter((e) => !selectedEdgeIds.has(e.id) && !selectedNodeIds.has(e.source) && !selectedNodeIds.has(e.target)))
    setRfNodes((prev) => prev.filter((n) => !selectedNodeIds.has(n.id)))
    setSelectedNodeId((prev) => (prev && selectedNodeIds.has(prev) ? null : prev))
  }, [rfNodes, rfEdges, selectedNodeId, setRfEdges, setRfNodes])

  const [nodeDataText, setNodeDataText] = useState<string>('')
  const [configFullscreenOpen, setConfigFullscreenOpen] = useState(false)

  const [configsSelected, setConfigsSelected] = useState<{ kind: 'node'; id: string } | { kind: 'strategy' } | { kind: 'model' } | { kind: 'alignment' }>({ kind: 'node', id: 'n1' })
  const [strategyConfigText, setStrategyConfigText] = useState<string>('{}')
  const [modelConfigText, setModelConfigText] = useState<string>('{}')
  const [alignmentConfigText, setAlignmentConfigText] = useState<string>('{}')

  const [importMode, setImportMode] = useState<'params' | 'struct'>('struct')
  const [compileMode, setCompileMode] = useState<'path' | 'edges'>('path')

  const titleInputRef = useRef<HTMLInputElement | null>(null)

  const [lastRunId, setLastRunId] = useState<string | null>(null)
  const [runStatus, setRunStatus] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [runNodes, setRunNodes] = useState<Record<string, NodeGraphRunNodeOut | undefined>>({})

  useEffect(() => {
    let cancelled = false
    void getNodeKindCatalog()
      .then((m) => {
        if (cancelled) return
        setKindMetaByKind(m)
      })
      .catch((e) => {
        if (cancelled) return
        setError((prev) => prev ?? `Failed to load node kinds: ${String((e as any)?.message ?? e)}`)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (selectedNodeId) setInspectorOpen(true)
  }, [selectedNodeId])

  useEffect(() => {
    if (!catalogOpen) setCatalogExpanded(false)
  }, [catalogOpen])

  useEffect(() => {
    if (!catalogOpen) setCatalogCollapsed(false)
  }, [catalogOpen])

  useEffect(() => {
    if (!inspectorOpen) setInspectorExpanded(false)
  }, [inspectorOpen])

  useEffect(() => {
    if (!inspectorOpen) setInspectorCollapsed(false)
  }, [inspectorOpen])

  useEffect(() => {
    if (!configFullscreenOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfigFullscreenOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [configFullscreenOpen])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null

      // Save / Run should work globally (n8n-like)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveVersion().catch(() => {})
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        void runGraph().catch(() => {})
        return
      }

      const activeEl = document.activeElement
      const wrapper = reactFlowWrapperRef.current
      const canvasFocused =
        !!wrapper && activeEl instanceof Element && wrapper.contains(activeEl)
      const bodyFocused =
        activeEl === document.body || activeEl === document.documentElement || activeEl === null
      const allowCanvasShortcuts = canvasFocused || bodyFocused

      if (shouldIgnoreCanvasShortcut(target)) return
      if (!allowCanvasShortcuts) return

      // Space => temporary pan mode (n8n-like)
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault()
        setIsSpacePanning(true)
        return
      }

      // Select all
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setRfNodes((prev) => prev.map((n) => ({ ...n, selected: true })))
        return
      }

      // Node creator (Tab)
      if (e.key === 'Tab') {
        e.preventDefault()
        setCatalogOpen(true)
        setCatalogExpanded(false)
        setInspectorOpen(false)
        setInspectorExpanded(false)
        window.setTimeout(() => catalogQueryInputRef.current?.focus(), 0)
        return
      }

      // Rename node (F2)
      if (e.key === 'F2') {
        if (!selectedNodeId) return
        e.preventDefault()
        setInspectorOpen(true)
        setCatalogOpen(false)
        window.setTimeout(() => titleInputRef.current?.focus(), 0)
        return
      }

      // Delete selection (Delete / Backspace)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelection()
        return
      }

      // Escape clears selection
      if (e.key === 'Escape') {
        clearSelection()
        setSelectedNodeId(null)
        return
      }

      // Zoom shortcuts
      const inst = reactFlowInstanceRef.current
      if (!inst) return

      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        showMinimap()
        void (inst as any).zoomIn?.({ duration: 120 })
        scheduleHideMinimap()
        return
      }

      if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        showMinimap()
        void (inst as any).zoomOut?.({ duration: 120 })
        scheduleHideMinimap()
        return
      }

      if (e.key === '0') {
        e.preventDefault()
        showMinimap()
        void (inst as any).setViewport?.({ x: 0, y: 0, zoom: 1 }, { duration: 160 })
        scheduleHideMinimap()
        return
      }

      if (e.key === '1') {
        e.preventDefault()
        showMinimap()
        void (inst as any).fitView?.({ padding: 0.15, duration: 160 })
        scheduleHideMinimap()
        return
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null
      const activeEl = document.activeElement
      const wrapper = reactFlowWrapperRef.current
      const canvasFocused =
        !!wrapper && activeEl instanceof Element && wrapper.contains(activeEl)
      const bodyFocused =
        activeEl === document.body || activeEl === document.documentElement || activeEl === null
      const allowCanvasShortcuts = canvasFocused || bodyFocused

      if (shouldIgnoreCanvasShortcut(target)) return
      if (!allowCanvasShortcuts) return
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault()
        setIsSpacePanning(false)
      }
    }

    window.addEventListener('keydown', onKeyDown, { passive: false })
    window.addEventListener('keyup', onKeyUp, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKeyDown as any)
      window.removeEventListener('keyup', onKeyUp as any)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, graphId, versionId, graphName, deleteSelection, clearSelection])

  function shouldIgnoreCanvasShortcut(el: Element | null): boolean {
    if (!el) return false
    const tag = el.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    if (el.closest('[contenteditable]')) return true
    if (el.closest('.ignore-key-press-canvas')) return true
    return false
  }

  function showMinimap() {
    if (minimapHideTimeoutRef.current) {
      window.clearTimeout(minimapHideTimeoutRef.current)
      minimapHideTimeoutRef.current = null
    }
    setMinimapVisible(true)
  }

  function scheduleHideMinimap() {
    if (minimapHoveredRef.current) return
    if (minimapHideTimeoutRef.current) {
      window.clearTimeout(minimapHideTimeoutRef.current)
      minimapHideTimeoutRef.current = null
    }
    minimapHideTimeoutRef.current = window.setTimeout(() => {
      if (!minimapHoveredRef.current) setMinimapVisible(false)
    }, 1000)
  }

  const catalog: CatalogCategory[] = useMemo(() => {
    const defaults: Record<string, any> = {
      'input.static': { value: { bot_ids: [], backtest_ids: [] } },
    }

    if (!kindMetaByKind || kindMetaByKind.size === 0) {
      return [{ title: 'Loading…', items: [] }]
    }

    const byCategory = new Map<string, CatalogItem[]>()
    const metas = Array.from(kindMetaByKind.values())
    metas.sort((a, b) => {
      const ac = (a.category ?? '').toLowerCase()
      const bc = (b.category ?? '').toLowerCase()
      if (ac !== bc) return ac.localeCompare(bc)
      const al = (a.label ?? '').toLowerCase()
      const bl = (b.label ?? '').toLowerCase()
      if (al !== bl) return al.localeCompare(bl)
      return a.kind.localeCompare(b.kind)
    })

    for (const m of metas) {
      if (m.hidden) continue
      const cat = String(m.category ?? 'Other')
      const items = byCategory.get(cat) ?? []
      items.push({ kind: m.kind, title: m.label || m.kind, defaultData: defaults[m.kind] })
      byCategory.set(cat, items)
    }

    const categories: CatalogCategory[] = []
    for (const [title, items] of Array.from(byCategory.entries()).sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()))) {
      categories.push({ title, items })
    }
    return categories
  }, [kindMetaByKind])

  const reactFlowWrapperRef = useRef<HTMLDivElement | null>(null)
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null)
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!chatDockOpen || chatDockCollapsed) return
    // Focus chat input when opening the dock (keyboard-first)
    const t = window.setTimeout(() => chatInputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [chatDockOpen, chatDockCollapsed])

  const nodeTypes: NodeTypes = useMemo(() => {
    const toneForStatus = (status?: string | null): 'ok' | 'warn' | 'err' | 'idle' => {
      const s = String(status ?? '').toLowerCase()
      if (!s || s === '—') return 'idle'
      if (s.includes('fail') || s.includes('error')) return 'err'
      if (s.includes('run') || s.includes('start') || s.includes('queue')) return 'warn'
      if (s.includes('complete') || s.includes('success') || s.includes('ok') || s.includes('done')) return 'ok'
      return 'idle'
    }

    const NodeComp = ({ id, data, selected }: NodeProps<NodeGraphNodeData>) => {
      const rn = runNodes[id]
      const kind = String(data?.kind ?? '')
      const meta = kindMetaByKind.get(kind)

      const title = String(data?.title ?? id)
      const label = meta?.label ?? kind
      const category = String(meta?.category ?? '')
      const iconText = (category || label || kind || '?').trim().slice(0, 1).toUpperCase()
      const tone = toneForStatus(rn?.status)

      return (
        <div
          className={`nodegraph-node ${selected ? 'nodegraph-node--selected' : ''}`}
          title={meta?.description ? `${label}\n${meta.description}` : label}
        >
          <Handle type="target" position={Position.Left} className="nodegraph-handle nodegraph-handle--in" />

          <div className="nodegraph-node__header">
            <div className="nodegraph-node__headerLeft">
              <div className="nodegraph-node__icon" aria-hidden="true">{iconText}</div>
              <div className="nodegraph-node__titles">
                <div className="nodegraph-node__title">{title}</div>
                <div className="nodegraph-node__subtitle">{label}</div>
              </div>
            </div>
            <div className={`nodegraph-node__statusDot nodegraph-node__statusDot--${tone}`} title={rn?.status ?? '—'} />
          </div>

          <div className="nodegraph-node__body">
            <div className="nodegraph-node__kind">{kind}</div>
          </div>

          <Handle type="source" position={Position.Right} className="nodegraph-handle nodegraph-handle--out" />
        </div>
      )
    }
    return { nodegraph: NodeComp }
  }, [runNodes, kindMetaByKind])

  function selectNode(nodeId: string) {
    setSelectedNodeId(nodeId)
    const n = rfNodes.find((x) => x.id === nodeId)
    const cfg = (n?.data as any)?.config ?? {}
    setNodeDataText(formatJson(cfg))
  }

  function nextNodeId(existingIds: string[]): string {
    // Find smallest free nX to keep things predictable.
    let i = 1
    const set = new Set(existingIds)
    while (set.has(`n${i}`)) i += 1
    return `n${i}`
  }

  function addNodeAt(item: CatalogItem, position?: { x: number; y: number }) {
    const id = nextNodeId(rfNodes.map((n) => n.id))
    const p = position ?? { x: 80, y: 80 }
    setRfNodes((prev) => ([
      ...prev,
      {
        id,
        type: 'nodegraph',
        position: p,
        data: { kind: item.kind, title: item.title, config: item.defaultData ?? {} },
      },
    ]))
    selectNode(id)
  }

  const onConnect = useCallback((connection: Connection) => {
    setRfEdges((eds) => addEdge({
      ...connection,
      id: `e${eds.length + 1}`,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
    }, eds))
  }, [setRfEdges])

  const onNodeClick = useCallback((_evt: any, node: Node) => {
    selectNode(node.id)
  }, [rfNodes])

  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstanceRef.current = instance
  }, [])

  const onMoveEnd = useCallback(() => {
    const inst = reactFlowInstanceRef.current
    if (!inst) return
    const vp = inst.getViewport()
    setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom })
    scheduleHideMinimap()
  }, [])

  const onMoveStart = useCallback(() => {
    showMinimap()
  }, [])

  const onDragStartCatalog = useCallback((evt: DragEvent<HTMLButtonElement>, item: CatalogItem) => {
    evt.dataTransfer.setData('application/nodegraph', JSON.stringify({ kind: item.kind, title: item.title, defaultData: item.defaultData ?? {} }))
    evt.dataTransfer.effectAllowed = 'move'
  }, [])

  const onDragOverCanvas = useCallback((evt: DragEvent<HTMLDivElement>) => {
    evt.preventDefault()
    evt.dataTransfer.dropEffect = 'move'
  }, [])

  const onDropCanvas = useCallback((evt: DragEvent<HTMLDivElement>) => {
    evt.preventDefault()
    const raw = evt.dataTransfer.getData('application/nodegraph')
    if (!raw) return
    const parsed = safeJsonParse(raw)
    if (!parsed || !parsed.kind) return
    const wrapper = reactFlowWrapperRef.current
    const inst = reactFlowInstanceRef.current
    if (!wrapper || !inst) return

    const bounds = wrapper.getBoundingClientRect()
    const position = inst.screenToFlowPosition({ x: evt.clientX - bounds.left, y: evt.clientY - bounds.top })
    addNodeAt({ kind: String(parsed.kind), title: String(parsed.title ?? parsed.kind), defaultData: parsed.defaultData ?? {} }, position)
  }, [addNodeAt])

  function applyNodeDataEdit() {
    if (!selectedNode) return
    const parsed = safeJsonParse(nodeDataText)
    if (parsed === null) {
      setError('Node data JSON is invalid')
      return
    }
    setError(null)
    setRfNodes((p) => p.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...(n.data as any), config: parsed } } : n)))
  }

  function openConfigFullscreen() {
    if (selectedNodeId) setConfigsSelected({ kind: 'node', id: selectedNodeId })
    setConfigFullscreenOpen(true)
  }

  const executionOrder = useMemo(() => {
    const nodes = rfNodes
    const edges = rfEdges

    const kindById = new Map<string, string>()
    for (const n of nodes) kindById.set(n.id, String((n.data as any)?.kind ?? ''))

    const outgoing = new Map<string, string[]>()
    const indeg = new Map<string, number>()
    for (const n of nodes) {
      outgoing.set(n.id, [])
      indeg.set(n.id, 0)
    }
    for (const e of edges) {
      if (!outgoing.has(e.source)) outgoing.set(e.source, [])
      outgoing.get(e.source)!.push(e.target)
      indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1)
      if (!indeg.has(e.source)) indeg.set(e.source, 0)
    }

    const isTrigger = (id: string) => {
      const k = (kindById.get(id) ?? '').toLowerCase()
      return k.startsWith('trigger.') || k.includes('trigger')
    }

    const sortIds = (a: string, b: string) => {
      const ta = isTrigger(a)
      const tb = isTrigger(b)
      if (ta !== tb) return ta ? -1 : 1
      return a.localeCompare(b)
    }

    const q = Array.from(indeg.entries())
      .filter(([, v]) => v === 0)
      .map(([id]) => id)
      .sort(sortIds)

    const res: string[] = []
    const indegWork = new Map(indeg)

    while (q.length) {
      const id = q.shift()!
      res.push(id)
      for (const t of outgoing.get(id) ?? []) {
        const next = (indegWork.get(t) ?? 0) - 1
        indegWork.set(t, next)
        if (next === 0) {
          q.push(t)
          q.sort(sortIds)
        }
      }
    }

    // If there is a cycle, append remaining nodes deterministically.
    if (res.length !== nodes.length) {
      const remaining = nodes
        .map((n) => n.id)
        .filter((id) => !res.includes(id))
        .sort(sortIds)
      res.push(...remaining)
    }

    return res
  }, [rfNodes, rfEdges])

  useEffect(() => {
    // Keep selection sane when graph changes
    if (configsSelected.kind === 'node') {
      const exists = rfNodes.some((n) => n.id === configsSelected.id)
      if (!exists) {
        const fallback = rfNodes[0]?.id
        if (fallback) setConfigsSelected({ kind: 'node', id: fallback })
      }
    }
  }, [rfNodes, configsSelected])

  function getActiveModuleText(): { kind: 'strategy' | 'model' | 'alignment'; text: string } | null {
    if (configsSelected.kind === 'strategy') return { kind: 'strategy', text: strategyConfigText }
    if (configsSelected.kind === 'model') return { kind: 'model', text: modelConfigText }
    if (configsSelected.kind === 'alignment') return { kind: 'alignment', text: alignmentConfigText }
    return null
  }

  function setActiveModuleText(kind: 'strategy' | 'model' | 'alignment', nextText: string) {
    if (kind === 'strategy') setStrategyConfigText(nextText)
    else if (kind === 'model') setModelConfigText(nextText)
    else setAlignmentConfigText(nextText)
  }

  function importActiveModuleConfigToParamNodes() {
    const active = getActiveModuleText()
    if (!active) return

    const parsed = safeJsonParse(active.text)
    if (parsed === null) {
      setError('Module config JSON is invalid')
      return
    }

    const replace = window.confirm('Replace current graph with imported config nodes?')

    const existingNodeIds = new Set(rfNodes.map((n) => n.id))
    const existingEdgeIds = new Set(rfEdges.map((e) => e.id))

    const nextNodeId = (prefix: string) => {
      let i = 1
      while (existingNodeIds.has(`${prefix}${i}`)) i += 1
      const id = `${prefix}${i}`
      existingNodeIds.add(id)
      return id
    }
    const nextEdgeId = (prefix: string) => {
      let i = 1
      while (existingEdgeIds.has(`${prefix}${i}`)) i += 1
      const id = `${prefix}${i}`
      existingEdgeIds.add(id)
      return id
    }

    const byDepthY = new Map<number, number>()
    const createdNodes: Array<Node<NodeGraphNodeData>> = []
    const createdEdges: Array<Edge> = []
    let seq = 0

    const createdParamNodesOnly: Array<Node<NodeGraphNodeData>> = []
    const createdEdgesOnly: Array<Edge> = []

    // Simple mode: only config.param nodes (leaf parameters)
    if (importMode === 'params') {
      walkJsonLeaves(parsed, [], (tokens, leaf) => {
        const depth = tokens.length
        const y0 = byDepthY.get(depth) ?? 60
        byDepthY.set(depth, y0 + 80)

        const path = pathTokensToString(tokens)
        const lastSeg = tokens.length ? String(tokens[tokens.length - 1]) : 'root'
        const title = tokens.length ? lastSeg : 'root'
        const segment = tokens.length ? tokens[tokens.length - 1] : null

        createdParamNodesOnly.push({
          id: nextNodeId('p'),
          type: 'nodegraph',
          position: { x: 60 + Math.min(depth, 6) * 240, y: y0 },
          data: {
            kind: 'config.param',
            title,
            config: {
              path,
              segment,
              value: leaf,
              value_type: inferJsonType(leaf),
              _seq: seq,
            },
          },
        })
        seq += 1
      })

      if (createdParamNodesOnly.length === 0) {
        setError('No parameters found in JSON')
        return
      }

      setError(null)
      if (replace) {
        setRfEdges(createdEdgesOnly)
        setRfNodes(createdParamNodesOnly)
      } else {
        setRfEdges((prev) => [...prev, ...createdEdgesOnly])
        setRfNodes((prev) => [...prev, ...createdParamNodesOnly])
      }
      const firstId = createdParamNodesOnly[0]!.id
      setSelectedNodeId(firstId)
      setNodeDataText(formatJson((createdParamNodesOnly[0]!.data as any)?.config ?? {}))
      return
    }

    // Structural mode: config.object/config.array containers + edges + config.param leaves
    const containerNodeIdByPath = new Map<string, string>()
    const rootPath = ''
    const rootKind = Array.isArray(parsed) ? 'config.array' : (parsed && typeof parsed === 'object' ? 'config.object' : 'config.object')
    const rootId = nextNodeId('c')
    containerNodeIdByPath.set(rootPath, rootId)
    createdNodes.push({
      id: rootId,
      type: 'nodegraph',
      position: { x: 60, y: 60 },
      data: {
        kind: rootKind,
        title: `${active.kind} root`,
        config: { path: rootPath, segment: null, container_type: rootKind },
      },
    })

    const ensureContainerNode = (tokens: PathToken[], containerValue: any): string => {
      const path = pathTokensToString(tokens)
      const existing = containerNodeIdByPath.get(path)
      if (existing) return existing

      const depth = tokens.length
      const y0 = byDepthY.get(depth) ?? 60
      byDepthY.set(depth, y0 + 80)

      const kind = Array.isArray(containerValue) ? 'config.array' : 'config.object'
      const lastSeg = tokens.length ? String(tokens[tokens.length - 1]) : 'root'
      const title = tokens.length ? lastSeg : `${active.kind} root`
      const segment = tokens.length ? tokens[tokens.length - 1] : null

      const id = nextNodeId('c')
      containerNodeIdByPath.set(path, id)
      createdNodes.push({
        id,
        type: 'nodegraph',
        position: { x: 60 + Math.min(depth, 6) * 240, y: y0 },
        data: {
          kind,
          title,
          config: { path, segment, container_type: kind },
        },
      })

      // Connect to parent container
      const parentTokens = tokens.slice(0, -1)
      const parentPath = pathTokensToString(parentTokens)
      const parentId = containerNodeIdByPath.get(parentPath) ?? rootId
      createdEdges.push({
        id: nextEdgeId('e'),
        source: parentId,
        target: id,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
      })

      return id
    }

    const walk = (value: any, tokens: PathToken[]) => {
      if (value === null) {
        // leaf
        const parentId = ensureContainerNode(tokens.slice(0, -1), {})
        const path = pathTokensToString(tokens)
        const depth = tokens.length
        const y0 = byDepthY.get(depth) ?? 60
        byDepthY.set(depth, y0 + 80)
        const id = nextNodeId('p')
        const lastSeg = tokens.length ? String(tokens[tokens.length - 1]) : 'root'
        const segment = tokens.length ? tokens[tokens.length - 1] : null
        createdNodes.push({
          id,
          type: 'nodegraph',
          position: { x: 60 + Math.min(depth, 6) * 240, y: y0 },
          data: { kind: 'config.param', title: lastSeg, config: { path, segment, value, value_type: inferJsonType(value), _seq: seq } },
        })
        createdEdges.push({ id: nextEdgeId('e'), source: parentId, target: id, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } })
        seq += 1
        return
      }

      if (Array.isArray(value)) {
        const thisId = ensureContainerNode(tokens, value)
        if (value.length === 0) {
          // Keep empty container represented as a parameter leaf too
          const path = pathTokensToString(tokens)
          const depth = tokens.length
          const y0 = byDepthY.get(depth + 1) ?? 60
          byDepthY.set(depth + 1, y0 + 80)
          const id = nextNodeId('p')
          const segment = tokens.length ? tokens[tokens.length - 1] : null
          createdNodes.push({
            id,
            type: 'nodegraph',
            position: { x: 60 + Math.min(depth + 1, 6) * 240, y: y0 },
            data: { kind: 'config.param', title: '[]', config: { path, segment, value, value_type: 'array', _seq: seq } },
          })
          createdEdges.push({ id: nextEdgeId('e'), source: thisId, target: id, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } })
          seq += 1
          return
        }
        for (let i = 0; i < value.length; i += 1) walk(value[i], [...tokens, i])
        return
      }

      if (typeof value === 'object') {
        const thisId = ensureContainerNode(tokens, value)
        const keys = Object.keys(value)
        if (keys.length === 0) {
          const path = pathTokensToString(tokens)
          const depth = tokens.length
          const y0 = byDepthY.get(depth + 1) ?? 60
          byDepthY.set(depth + 1, y0 + 80)
          const id = nextNodeId('p')
          const segment = tokens.length ? tokens[tokens.length - 1] : null
          createdNodes.push({
            id,
            type: 'nodegraph',
            position: { x: 60 + Math.min(depth + 1, 6) * 240, y: y0 },
            data: { kind: 'config.param', title: '{}', config: { path, segment, value, value_type: 'object', _seq: seq } },
          })
          createdEdges.push({ id: nextEdgeId('e'), source: thisId, target: id, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } })
          seq += 1
          return
        }
        for (const k of keys) walk((value as any)[k], [...tokens, k])
        return
      }

      // primitive leaf
      const parentId = ensureContainerNode(tokens.slice(0, -1), {})
      const path = pathTokensToString(tokens)
      const depth = tokens.length
      const y0 = byDepthY.get(depth) ?? 60
      byDepthY.set(depth, y0 + 80)
      const id = nextNodeId('p')
      const lastSeg = tokens.length ? String(tokens[tokens.length - 1]) : 'root'
      const segment = tokens.length ? tokens[tokens.length - 1] : null
      createdNodes.push({
        id,
        type: 'nodegraph',
        position: { x: 60 + Math.min(depth, 6) * 240, y: y0 },
        data: { kind: 'config.param', title: lastSeg, config: { path, segment, value, value_type: inferJsonType(value), _seq: seq } },
      })
      createdEdges.push({ id: nextEdgeId('e'), source: parentId, target: id, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } })
      seq += 1
    }

    // If module JSON isn't an object/array, treat it as a single leaf at root
    if (parsed && (typeof parsed === 'object')) {
      walk(parsed, [])
    } else {
      walk(parsed, ['value'])
    }

    const hasParams = createdNodes.some((n) => String((n.data as any)?.kind ?? '') === 'config.param')
    if (!hasParams) {
      setError('No parameters found in JSON')
      return
    }

    setError(null)
    if (replace) {
      setRfEdges(createdEdges)
      setRfNodes(createdNodes)
    } else {
      setRfEdges((prev) => [...prev, ...createdEdges])
      setRfNodes((prev) => [...prev, ...createdNodes])
    }
    setSelectedNodeId(rootId)
    setNodeDataText(formatJson((createdNodes.find((n) => n.id === rootId)?.data as any)?.config ?? {}))
  }

  function compileConfigByParamPaths(): any {
    const active = getActiveModuleText()
    if (!active) return

    const paramNodes = rfNodes.filter((n) => String((n.data as any)?.kind ?? '') === 'config.param')
    if (paramNodes.length === 0) {
      setError('No config.param nodes found to compile')
      return
    }

    // Deterministic compile: sort by path, then by creation seq if present.
    const sorted = paramNodes.slice().sort((a, b) => {
      const pa = String((a.data as any)?.config?.path ?? '')
      const pb = String((b.data as any)?.config?.path ?? '')
      const pc = pa.localeCompare(pb)
      if (pc !== 0) return pc
      const sa = Number((a.data as any)?.config?._seq ?? 0)
      const sb = Number((b.data as any)?.config?._seq ?? 0)
      return sa - sb
    })

    let out: any = {}
    for (const n of sorted) {
      const cfg = (n.data as any)?.config ?? {}
      const pathStr = String(cfg.path ?? '')
      const tokens = parsePathString(pathStr)
      if (tokens === null) {
        setError(`Invalid path in node ${n.id}: ${pathStr || '—'}`)
        return
      }
      out = setAtPath(out, tokens, cfg.value)
    }

    return out
  }

  function segmentFromNode(n: Node<NodeGraphNodeData>): PathToken | null {
    const cfg = (n.data as any)?.config ?? {}
    if (cfg.segment === 0) return 0
    if (cfg.segment) return cfg.segment as any
    // Fallback: derive from path
    const pathStr = String(cfg.path ?? '')
    if (pathStr) {
      const tokens = parsePathString(pathStr)
      if (tokens && tokens.length) return tokens[tokens.length - 1]
    }
    return null
  }

  function compileConfigByEdges(): any {
    const active = getActiveModuleText()
    if (!active) return

    const cfgNodes = rfNodes.filter((n) => String((n.data as any)?.kind ?? '').startsWith('config.'))
    if (cfgNodes.length === 0) {
      setError('No config.* nodes found to compile')
      return
    }

    const cfgNodeIds = new Set(cfgNodes.map((n) => n.id))
    const cfgEdges = rfEdges.filter((e) => cfgNodeIds.has(e.source) && cfgNodeIds.has(e.target))

    const indeg = new Map<string, number>()
    const out = new Map<string, string[]>()
    for (const n of cfgNodes) {
      indeg.set(n.id, 0)
      out.set(n.id, [])
    }
    for (const e of cfgEdges) {
      indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1)
      out.get(e.source)?.push(e.target)
    }

    const roots = cfgNodes
      .filter((n) => (indeg.get(n.id) ?? 0) === 0)
      .filter((n) => {
        const k = String((n.data as any)?.kind ?? '')
        return k === 'config.object' || k === 'config.array'
      })
      .sort((a, b) => a.id.localeCompare(b.id))

    if (roots.length !== 1) {
      setError(roots.length === 0 ? 'Cannot find a single config root (no root container node)' : 'Multiple config roots found — keep only one')
      return
    }

    const byId = new Map(cfgNodes.map((n) => [n.id, n]))

    const build = (id: string): any => {
      const n = byId.get(id)
      if (!n) return undefined
      const kind = String((n.data as any)?.kind ?? '')
      const cfg = (n.data as any)?.config ?? {}

      if (kind === 'config.param') return cfg.value
      if (kind !== 'config.object' && kind !== 'config.array') return undefined

      const isArr = kind === 'config.array'
      const container: any = isArr ? [] : {}
      const children = (out.get(id) ?? []).slice()
      children.sort((a, b) => {
        const na = byId.get(a)
        const nb = byId.get(b)
        const sa = na ? segmentFromNode(na) : null
        const sb = nb ? segmentFromNode(nb) : null
        const ka = typeof sa === 'number' ? String(sa).padStart(10, '0') : String(sa ?? '')
        const kb = typeof sb === 'number' ? String(sb).padStart(10, '0') : String(sb ?? '')
        const c = ka.localeCompare(kb)
        if (c !== 0) return c
        return a.localeCompare(b)
      })

      for (const childId of children) {
        const child = byId.get(childId)
        if (!child) continue
        const seg = segmentFromNode(child)
        if (seg === null) throw new Error(`Missing segment for node ${childId}`)
        const value = build(childId)
        if (isArr) {
          const idx = typeof seg === 'number' ? seg : Number(String(seg))
          if (!Number.isFinite(idx)) throw new Error(`Invalid array index for node ${childId}: ${String(seg)}`)
          if ((container as any[]).length <= idx) (container as any[]).length = idx + 1
          ;(container as any[])[idx] = value
        } else {
          if (typeof seg !== 'string') throw new Error(`Invalid object key for node ${childId}: ${String(seg)}`)
          ;(container as any)[seg] = value
        }
      }

      // Preserve explicit empty containers: if no children, leave {} or []
      return container
    }

    try {
      return build(roots[0]!.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to compile by edges')
      return
    }
  }

  function compileParamNodesToActiveModuleConfig() {
    const active = getActiveModuleText()
    if (!active) return

    const compiled = compileMode === 'edges' ? compileConfigByEdges() : compileConfigByParamPaths()
    if (compiled === undefined) return

    setError(null)
    setActiveModuleText(active.kind, formatJson(compiled))
  }

  function applyNodeTitleEdit(nextTitle: string) {
    if (!selectedNodeId) return
    setRfNodes((prev) =>
      prev.map((n) =>
        n.id === selectedNodeId ? { ...n, data: { ...(n.data as any), title: nextTitle } } : n,
      ),
    )
  }

  async function saveVersion(): Promise<{ graphId: string; versionId: string }> {
    setSaving(true)
    setError(null)
    try {
      let gid = graphId
      if (!gid) {
        const g = await createGraph({ name: graphName, description: 'NodeGraph', scope: 'user', owner_id: null, is_active: true })
        gid = g.graph_id
        setGraphId(gid)
      }

      const definition = {
        nodes: rfNodes.map((n) => ({
          id: n.id,
          type: String((n.data as any)?.kind ?? 'noop'),
          position: n.position,
          data: (n.data as any)?.config ?? {},
        })),
        edges: rfEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
        viewport,
      }
      const v = await createGraphVersion(gid, definition)
      setVersionId(v.version_id)
      return { graphId: gid, versionId: v.version_id }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save graph version')
      throw e
    } finally {
      setSaving(false)
    }
  }

  async function runGraph(inputs?: any) {
    setRunning(true)
    setError(null)
    setRunError(null)
    try {
      let gid = graphId
      let vid = versionId

      if (!gid || !vid) {
        const saved = await saveVersion()
        gid = saved.graphId
        vid = saved.versionId
      }
      if (!gid || !vid) throw new Error('Save a version first')

      const r = await createGraphRun(gid, { version_id: vid, inputs: inputs ?? {}, enqueue: true })
      setLastRunId(r.run_id)
      setRunStatus(r.status)

      const p = await getGraphRunProgress(r.run_id)
      setRunStatus(`${p.status} (redis: ${p.redis_status ?? '—'})`)
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Failed to run graph')
    } finally {
      setRunning(false)
    }
  }

  async function refreshRunDetails() {
    if (!lastRunId) return
    setRunning(true)
    setRunError(null)
    try {
      const p = await getGraphRunProgress(lastRunId)
      setRunStatus(`${p.status} (redis: ${p.redis_status ?? '—'})`)
      if (p.error_message) setRunError(p.error_message)

      const nodesRes = await listGraphRunNodes(lastRunId)
      const byId: Record<string, NodeGraphRunNodeOut | undefined> = {}
      for (const rn of nodesRes.items) byId[rn.node_id] = rn
      setRunNodes(byId)
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Failed to refresh run')
    } finally {
      setRunning(false)
    }
  }

  const canSave = useMemo(() => !saving, [saving])
  const canRun = useMemo(() => !running, [running])

  function pushChatMessage(role: 'user' | 'assistant' | 'system', text: string) {
    setChatMessages((prev) => [...prev, { role, text, ts: Date.now() }])
  }

  async function sendChatMessage() {
    const msg = chatInput.trim()
    if (!msg) return
    setChatInput('')
    pushChatMessage('user', msg)

    // Minimal n8n-like behavior: run the current graph with chat input.
    // Actual semantics depend on graph nodes (e.g. Chat Trigger / AI Agent).
    await runGraph({ chat: { message: msg, history: chatMessages.map((m) => ({ role: m.role, text: m.text })) } })

    // If the graph produces a structured output, we can surface it here.
    // For now, show a lightweight placeholder so the UX loop feels complete.
    pushChatMessage('assistant', 'Run enqueued. Check logs on the right.')
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {error && <ErrorBanner message={error} />}

      <Card>
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 4, minWidth: 260 }}>
            <span>Graph name</span>
            <input value={graphName} onChange={(e) => setGraphName(e.target.value)} />
          </label>

          <button
            onClick={() => void saveVersion()}
            disabled={!canSave}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              cursor: canSave ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Saving…' : 'Save version'}
          </button>

          <button
            onClick={() => void runGraph()}
            disabled={!canRun}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              cursor: canRun ? 'pointer' : 'not-allowed',
            }}
          >
            {running ? 'Running…' : 'Run'}
          </button>

          {lastRunId && (
            <button
              onClick={() => void refreshRunDetails()}
              disabled={!canRun}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                cursor: canRun ? 'pointer' : 'not-allowed',
              }}
            >
              Refresh run
            </button>
          )}

          <div style={{ fontSize: 12, opacity: 0.75 }}>
            {graphId ? `graph_id: ${graphId}` : 'graph_id: —'} · {versionId ? `version_id: ${versionId}` : 'version_id: —'}
          </div>
        </div>

        {(runStatus || runError) && (
          <div style={{ marginTop: 10, fontSize: 12 }}>
            {runStatus && <div>Run status: {runStatus}</div>}
            {runError && <div style={{ color: 'var(--danger)' }}>Run error: {runError}</div>}
            {lastRunId && <div style={{ opacity: 0.75 }}>run_id: {lastRunId}</div>}
          </div>
        )}
      </Card>

      <Card>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700 }}>Canvas</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Drag modules сюда. Соединяй стрелками (drag from handle).</div>
            </div>
          </div>

          <div
            ref={reactFlowWrapperRef}
            className={
              chatDockOpen && !chatDockCollapsed
                ? 'nodegraphs-canvasWrap nodegraphs-canvasWrap--chatOpen'
                : 'nodegraphs-canvasWrap'
            }
            onDragOver={onDragOverCanvas}
            onDrop={onDropCanvas}
          >
            <ReactFlow
              className={isSpacePanning ? 'nodegraphs-rf nodegraphs-rf--panning' : 'nodegraphs-rf'}
              nodes={rfNodes}
              edges={rfEdges}
              onNodesChange={onRfNodesChange}
              onEdgesChange={onRfEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onInit={onInit}
              onMoveStart={onMoveStart}
              onMoveEnd={onMoveEnd}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={{ type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }}
              panOnScroll
              panOnDrag={isSpacePanning ? [0, 1] : [1]}
              selectionOnDrag={!isSpacePanning}
              fitView
            >
              <Background gap={18} size={1} />
              <Controls />

              {minimapVisible && (
                <MiniMap
                  position="bottom-left"
                  pannable
                  zoomable
                  className="nodegraphs-minimap"
                  onMouseEnter={() => {
                    minimapHoveredRef.current = true
                    showMinimap()
                  }}
                  onMouseLeave={() => {
                    minimapHoveredRef.current = false
                    scheduleHideMinimap()
                  }}
                />
              )}
            </ReactFlow>

            <div
              className="nodegraphs-flyoutTab nodegraphs-flyoutTab--left"
              onClick={() => {
                setCatalogOpen(true)
                setInspectorOpen(false)
              }}
              role="button"
              tabIndex={0}
              aria-label="Open modules"
              title="Modules"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setCatalogOpen(true)
              }}
            >
              Modules
            </div>

            <div
              className="nodegraphs-flyoutTab nodegraphs-flyoutTab--right"
              onClick={() => {
                setInspectorOpen(true)
                setCatalogOpen(false)
              }}
              role="button"
              tabIndex={0}
              aria-label="Open inspector"
              title="Inspector"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setInspectorOpen(true)
              }}
            >
              Inspector
            </div>

            {catalogOpen && (
              <div
                className={`nodegraphs-flyout nodegraphs-flyout--left ${catalogExpanded ? 'nodegraphs-flyout--expanded' : ''} ${catalogCollapsed ? 'nodegraphs-flyout--collapsed' : ''}`}
                role="dialog"
                aria-label="Modules"
                onClick={() => {
                  setCatalogOpen(false)
                }}
              >
                <div onClick={(e) => e.stopPropagation()}>
                  <Card>
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div
                        className="nodegraphs-flyoutTitle"
                        onClick={(e) => {
                          e.stopPropagation()
                          // Single click => collapse; Double click => expand
                          if (catalogTitleClickTimeoutRef.current) {
                            window.clearTimeout(catalogTitleClickTimeoutRef.current)
                            catalogTitleClickTimeoutRef.current = null
                          }
                          catalogTitleClickTimeoutRef.current = window.setTimeout(() => {
                            setCatalogCollapsed((v) => !v)
                            catalogTitleClickTimeoutRef.current = null
                          }, 180)
                        }}
                        onDoubleClick={() => {
                          if (catalogTitleClickTimeoutRef.current) {
                            window.clearTimeout(catalogTitleClickTimeoutRef.current)
                            catalogTitleClickTimeoutRef.current = null
                          }
                          setCatalogExpanded((v) => {
                            const next = !v
                            if (next) {
                              setInspectorOpen(false)
                              setInspectorExpanded(false)
                              setInspectorCollapsed(false)
                            }
                            return next
                          })
                        }}
                        title="Клик — свернуть/развернуть · Двойной клик — расширить"
                      >
                        Modules
                      </div>

                      {!catalogCollapsed && (
                        <input
                          ref={catalogQueryInputRef}
                          value={catalogQuery}
                          onChange={(e) => setCatalogQuery(e.target.value)}
                          placeholder="Search modules…"
                          className="nodegraphs-catalogSearch"
                        />
                      )}

                      {!catalogCollapsed && catalog.map((cat) => {
                        const q = catalogQuery.trim().toLowerCase()
                        const items = q
                          ? cat.items.filter((it) => {
                            const meta = kindMetaByKind.get(it.kind)
                            const hay = [
                              it.title,
                              it.kind,
                              meta?.label,
                              meta?.category,
                              meta?.description,
                            ]
                              .filter(Boolean)
                              .join(' · ')
                              .toLowerCase()
                            return hay.includes(q)
                          })
                          : cat.items

                        if (!items.length) return null

                        return (
                          <div key={cat.title} style={{ display: 'grid', gap: 6 }}>
                            <div className="nodegraphs-catalogCategoryTitle">{cat.title}</div>
                            <div style={{ display: 'grid', gap: 6 }}>
                              {items.map((it) => (
                                <button
                                  key={it.kind}
                                  onClick={() => addNodeAt(it)}
                                  draggable
                                  onDragStart={(e) => onDragStartCatalog(e, it)}
                                  className="nodegraphs-catalogItem"
                                  title={it.kind}
                                >
                                  <div className="nodegraphs-catalogItemTitle">{it.title}</div>
                                  <div className="nodegraphs-catalogItemKind">{it.kind}</div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {inspectorOpen && (
              <div
                className={`nodegraphs-flyout nodegraphs-flyout--right ${inspectorExpanded ? 'nodegraphs-flyout--expanded' : ''} ${inspectorCollapsed ? 'nodegraphs-flyout--collapsed' : ''}`}
                role="dialog"
                aria-label="Inspector"
                onClick={() => {
                  setInspectorOpen(false)
                }}
              >
                <div onClick={(e) => e.stopPropagation()}>
                  <Card>
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div
                        className="nodegraphs-flyoutTitle"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (inspectorTitleClickTimeoutRef.current) {
                            window.clearTimeout(inspectorTitleClickTimeoutRef.current)
                            inspectorTitleClickTimeoutRef.current = null
                          }
                          inspectorTitleClickTimeoutRef.current = window.setTimeout(() => {
                            setInspectorCollapsed((v) => !v)
                            inspectorTitleClickTimeoutRef.current = null
                          }, 180)
                        }}
                        onDoubleClick={() => {
                          if (inspectorTitleClickTimeoutRef.current) {
                            window.clearTimeout(inspectorTitleClickTimeoutRef.current)
                            inspectorTitleClickTimeoutRef.current = null
                          }
                          setInspectorExpanded((v) => {
                            const next = !v
                            if (next) {
                              setCatalogOpen(false)
                              setCatalogExpanded(false)
                              setCatalogCollapsed(false)
                            }
                            return next
                          })
                        }}
                        title="Клик — свернуть/развернуть · Двойной клик — расширить"
                      >
                        Inspector
                      </div>

                    {!inspectorCollapsed && !selectedNode && <div style={{ fontSize: 12, opacity: 0.75 }}>Выбери ноду на холсте.</div>}

                    {!inspectorCollapsed && selectedNode && (
                      <>
                        {(() => {
                          const k = String((selectedNode.data as any)?.kind ?? '')
                          const meta = kindMetaByKind.get(k)
                          if (!meta) return null
                          const caps = meta.capabilities
                          return (
                            <div style={{ display: 'grid', gap: 6, padding: '8px 10px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                              <div style={{ fontSize: 12, opacity: 0.75 }}>Node kind</div>
                              <div style={{ fontSize: 13, fontWeight: 700 }}>{meta.label}</div>
                              <div style={{ fontSize: 12, opacity: 0.85 }}>
                                <span style={{ opacity: 0.7 }}>category:</span> {meta.category}
                              </div>
                              {meta.description && (
                                <div style={{ fontSize: 12, opacity: 0.85 }}>{meta.description}</div>
                              )}
                              <div style={{ fontSize: 12, opacity: 0.85 }}>
                                <span style={{ opacity: 0.7 }}>inputs:</span> <span style={{ fontFamily: 'monospace' }}>{(meta.inputs ?? []).join(', ') || '—'}</span>
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.85 }}>
                                <span style={{ opacity: 0.7 }}>outputs:</span> <span style={{ fontFamily: 'monospace' }}>{(meta.outputs ?? []).join(', ') || '—'}</span>
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.85 }}>
                                <span style={{ opacity: 0.7 }}>capabilities:</span>{' '}
                                <span style={{ fontFamily: 'monospace' }}>
                                  side_effects={String(!!caps?.side_effects)} idempotent={String(!!caps?.idempotent)} long_running={String(!!caps?.long_running)}
                                </span>
                              </div>
                            </div>
                          )
                        })()}

                        <div style={{ display: 'grid', gap: 6 }}>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>Title</div>
                          <input
                            ref={titleInputRef}
                            value={String((selectedNode.data as any)?.title ?? '')}
                            onChange={(e) => applyNodeTitleEdit(e.target.value)}
                            placeholder="Node title"
                          />
                          <div style={{ fontSize: 11, opacity: 0.65 }}>F2 — rename</div>
                        </div>

                        <div style={{ fontSize: 12, opacity: 0.85 }}>
                          <div><span style={{ opacity: 0.7 }}>id:</span> <span style={{ fontFamily: 'monospace' }}>{selectedNode.id}</span></div>
                          <div><span style={{ opacity: 0.7 }}>kind:</span> <span style={{ fontFamily: 'monospace' }}>{String((selectedNode.data as any)?.kind ?? '')}</span></div>
                        </div>

                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setConfigsSelected({ kind: 'node', id: selectedNode.id })
                            openConfigFullscreen()
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              setConfigsSelected({ kind: 'node', id: selectedNode.id })
                              openConfigFullscreen()
                            }
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            flex: '1 1 0%',
                            cursor: 'pointer',
                            userSelect: 'none',
                            padding: '8px 10px',
                            borderRadius: 12,
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                          }}
                          title="Open Configs editor"
                        >
                          <span
                            style={{
                              fontSize: 14,
                              color: 'var(--text-secondary)',
                              display: 'inline-block',
                            }}
                          >
                            ▶
                          </span>
                          <span style={{ fontSize: 18 }}>📝</span>
                          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--text)' }}>Config editor</h3>
                        </div>

                        <div style={{ display: 'grid', gap: 8 }}>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>Last run I/O</div>
                          {lastRunId ? (
                            <>
                              <div style={{ fontSize: 12, opacity: 0.85 }}>
                                <div><span style={{ opacity: 0.7 }}>run_id:</span> <span style={{ fontFamily: 'monospace' }}>{lastRunId}</span></div>
                              </div>

                              <div style={{ fontSize: 12, opacity: 0.75 }}>Inputs</div>
                              <pre className="nodegraphs-ioBlock">
                                {formatJson(runNodes[selectedNode.id]?.inputs ?? {})}
                              </pre>

                              <div style={{ fontSize: 12, opacity: 0.75 }}>Outputs</div>
                              <pre className="nodegraphs-ioBlock">
                                {formatJson(runNodes[selectedNode.id]?.outputs ?? {})}
                              </pre>

                              {runNodes[selectedNode.id]?.error_message && (
                                <div style={{ color: 'var(--danger)', fontSize: 12 }}>
                                  Error: {runNodes[selectedNode.id]?.error_message}
                                </div>
                              )}
                            </>
                          ) : (
                            <div style={{ fontSize: 12, opacity: 0.75 }}>Run the graph to see per-node inputs/outputs.</div>
                          )}
                        </div>
                      </>
                    )}
                    </div>
                  </Card>
                </div>
              </div>
            )}

            <div
              className="nodegraphs-chatTab"
              role="button"
              tabIndex={0}
              aria-label="Open chat test mode"
              title="Chat test mode"
              onClick={() => {
                setChatDockOpen(true)
                setChatDockCollapsed(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setChatDockOpen(true)
                  setChatDockCollapsed(false)
                }
              }}
            >
              Chat
            </div>

            {chatDockOpen && (
              <div
                className={chatDockCollapsed ? 'nodegraphs-chatDock nodegraphs-chatDock--collapsed' : 'nodegraphs-chatDock'}
                role="dialog"
                aria-label="Chat test mode"
                onClick={() => {
                  // Click on frame closes (consistent with other overlays)
                  setChatDockOpen(false)
                }}
              >
                <div className="ignore-key-press-canvas" onClick={(e) => e.stopPropagation()}>
                  <div
                    className="nodegraphs-chatDockHeader"
                    role="button"
                    tabIndex={0}
                    onClick={() => setChatDockCollapsed((v) => !v)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setChatDockCollapsed((v) => !v)
                    }}
                    title="Клик — свернуть/развернуть · Клик по рамке — закрыть"
                  >
                    <div style={{ fontWeight: 700 }}>Chat test mode</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Chat слева · Logs справа</div>
                  </div>

                  {!chatDockCollapsed && (
                    <div className="nodegraphs-chatDockBody">
                      <div className="nodegraphs-chatCol">
                        <div className="nodegraphs-chatMessages">
                          {chatMessages.length === 0 && (
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                              Отправь сообщение — мы запустим текущий граф с `inputs.chat.message`.
                            </div>
                          )}
                          {chatMessages.map((m, idx) => (
                            <div key={`${m.ts}-${idx}`} className={`nodegraphs-chatMsg nodegraphs-chatMsg--${m.role}`}>
                              <div className="nodegraphs-chatMsgRole">{m.role}</div>
                              <div className="nodegraphs-chatMsgText">{m.text}</div>
                            </div>
                          ))}
                        </div>

                        <div className="nodegraphs-chatInputRow">
                          <textarea
                            className="nodegraphs-chatInput"
                            ref={chatInputRef}
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="Type a message…"
                            rows={2}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.preventDefault()
                                setChatDockOpen(false)
                                return
                              }

                              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                e.preventDefault()
                                void sendChatMessage()
                                return
                              }

                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                void sendChatMessage()
                              }
                            }}
                          />
                          <button
                            onClick={() => void sendChatMessage()}
                            style={{
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: '1px solid var(--border)',
                              background: 'var(--surface)',
                              color: 'var(--text)',
                              cursor: 'pointer',
                              height: 'fit-content',
                            }}
                          >
                            Send
                          </button>
                        </div>
                      </div>

                      <div className="nodegraphs-logsCol">
                        <div style={{ display: 'grid', gap: 8 }}>
                          <div style={{ fontWeight: 700 }}>Logs</div>
                          {(runStatus || runError || lastRunId) ? (
                            <>
                              {runStatus && <div style={{ fontSize: 12 }}>Run status: {runStatus}</div>}
                              {runError && <div style={{ fontSize: 12, color: 'var(--danger)' }}>Run error: {runError}</div>}
                              {lastRunId && <div style={{ fontSize: 12, opacity: 0.75 }}>run_id: {lastRunId}</div>}
                            </>
                          ) : (
                            <div style={{ fontSize: 12, opacity: 0.7 }}>No runs yet.</div>
                          )}

                          <div style={{ fontSize: 12, opacity: 0.75 }}>Nodes</div>
                          <div className="nodegraphs-logsList">
                            {rfNodes.map((n) => {
                              const rn = runNodes[n.id]
                              return (
                                <div key={n.id} className="nodegraphs-logsRow">
                                  <div style={{ fontFamily: 'monospace', fontSize: 11 }}>{n.id}</div>
                                  <div style={{ fontSize: 11, opacity: 0.75 }}>{String((n.data as any)?.kind ?? '')}</div>
                                  <div style={{ fontSize: 11 }}>{String(rn?.status ?? '—')}</div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {configFullscreenOpen && (
              <div
                className="nodegraphs-configFullscreen"
                role="dialog"
                aria-label="Configs editor fullscreen"
                onClick={() => setConfigFullscreenOpen(false)}
              >
                <div className="nodegraphs-configFullscreenInner" onClick={(e) => e.stopPropagation()}>
                  <div className="nodegraphs-configFullscreenHeader">
                    <div style={{ display: 'grid', minWidth: 0 }}>
                      <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Configs editor</div>
                      <div style={{ fontSize: 12, opacity: 0.75, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Esc или клик по фону — закрыть
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                      {(configsSelected.kind === 'strategy' || configsSelected.kind === 'model' || configsSelected.kind === 'alignment') && (
                        <>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, opacity: 0.85 }}>
                            Import
                            <select
                              value={importMode}
                              onChange={(e) => setImportMode(e.target.value as any)}
                              style={{
                                padding: '8px 10px',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: 'var(--surface)',
                                color: 'var(--text)',
                              }}
                              title="How to generate nodes from JSON"
                            >
                              <option value="params">params only</option>
                              <option value="struct">struct + edges</option>
                            </select>
                          </label>

                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, opacity: 0.85 }}>
                            Compile
                            <select
                              value={compileMode}
                              onChange={(e) => setCompileMode(e.target.value as any)}
                              style={{
                                padding: '8px 10px',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: 'var(--surface)',
                                color: 'var(--text)',
                              }}
                              title="Source of truth for compilation"
                            >
                              <option value="path">by path</option>
                              <option value="edges">by edges</option>
                            </select>
                          </label>

                          <button
                            onClick={importActiveModuleConfigToParamNodes}
                            style={{
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: '1px solid var(--border)',
                              background: 'var(--surface)',
                              color: 'var(--text)',
                              cursor: 'pointer',
                            }}
                            title="Parse module JSON and generate config.param nodes"
                          >
                            Import → nodes
                          </button>
                          <button
                            onClick={compileParamNodesToActiveModuleConfig}
                            style={{
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: '1px solid var(--border)',
                              background: 'var(--surface)',
                              color: 'var(--text)',
                              cursor: 'pointer',
                            }}
                            title="Compile config.param nodes back into module JSON"
                          >
                            Compile nodes
                          </button>
                        </>
                      )}
                      {configsSelected.kind === 'node' && (
                        <button
                          onClick={applyNodeDataEdit}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--text)',
                            cursor: 'pointer',
                          }}
                        >
                          Apply
                        </button>
                      )}
                      <button
                        onClick={() => setConfigFullscreenOpen(false)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'var(--surface)',
                          color: 'var(--text)',
                          cursor: 'pointer',
                        }}
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  <div className="nodegraphs-configsLayout">
                    <div className="nodegraphs-configsCol nodegraphs-configsCol--left">
                      <div style={{ display: 'grid', gap: 8 }}>
                        <div style={{ fontWeight: 700 }}>Configs</div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>Execution order (derived from edges). Triggers first.</div>
                        <div className="nodegraphs-configsList">
                          {(executionOrder.length ? executionOrder : rfNodes.map((n) => n.id)).map((id, idx) => {
                            const n = rfNodes.find((x) => x.id === id)
                            const title = String((n?.data as any)?.title ?? id)
                            const kind = String((n?.data as any)?.kind ?? '')
                            const active = configsSelected.kind === 'node' && configsSelected.id === id
                            return (
                              <button
                                key={id}
                                className={`nodegraphs-configsItem ${active ? 'nodegraphs-configsItem--active' : ''}`}
                                onClick={() => {
                                  setConfigsSelected({ kind: 'node', id })
                                  selectNode(id)
                                }}
                                title={`${id} · ${kind}`}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                                  <div style={{ fontWeight: 700, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {idx + 1}. {title}
                                  </div>
                                  <div style={{ fontSize: 11, opacity: 0.7, fontFamily: 'monospace' }}>{id}</div>
                                </div>
                                <div style={{ fontSize: 11, opacity: 0.75, fontFamily: 'monospace', textAlign: 'left' }}>{kind}</div>
                              </button>
                            )
                          })}
                        </div>

                        <div style={{ fontWeight: 700, marginTop: 8 }}>Modules</div>
                        <div className="nodegraphs-configsList">
                          <button
                            className={`nodegraphs-configsItem ${configsSelected.kind === 'strategy' ? 'nodegraphs-configsItem--active' : ''}`}
                            onClick={() => setConfigsSelected({ kind: 'strategy' })}
                          >
                            <div style={{ fontWeight: 700, fontSize: 12, textAlign: 'left' }}>Strategy config</div>
                            <div style={{ fontSize: 11, opacity: 0.75, textAlign: 'left' }}>JSON</div>
                          </button>
                          <button
                            className={`nodegraphs-configsItem ${configsSelected.kind === 'model' ? 'nodegraphs-configsItem--active' : ''}`}
                            onClick={() => setConfigsSelected({ kind: 'model' })}
                          >
                            <div style={{ fontWeight: 700, fontSize: 12, textAlign: 'left' }}>Model config</div>
                            <div style={{ fontSize: 11, opacity: 0.75, textAlign: 'left' }}>JSON</div>
                          </button>
                          <button
                            className={`nodegraphs-configsItem ${configsSelected.kind === 'alignment' ? 'nodegraphs-configsItem--active' : ''}`}
                            onClick={() => setConfigsSelected({ kind: 'alignment' })}
                          >
                            <div style={{ fontWeight: 700, fontSize: 12, textAlign: 'left' }}>Alignment config</div>
                            <div style={{ fontSize: 11, opacity: 0.75, textAlign: 'left' }}>JSON</div>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="nodegraphs-configsCol nodegraphs-configsCol--center">
                      <div style={{ display: 'grid', gap: 8, height: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {configsSelected.kind === 'node'
                              ? `Node: ${String((rfNodes.find((n) => n.id === configsSelected.id)?.data as any)?.title ?? configsSelected.id)}`
                              : configsSelected.kind === 'strategy'
                                ? 'Strategy config'
                                : configsSelected.kind === 'model'
                                  ? 'Model config'
                                  : 'Alignment config'}
                          </div>
                          {configsSelected.kind === 'node' && (
                            <div style={{ fontSize: 12, opacity: 0.75, fontFamily: 'monospace' }}>{configsSelected.id}</div>
                          )}
                        </div>

                        {configsSelected.kind === 'node' ? (
                          <textarea
                            className="nodegraphs-configTextarea nodegraphs-configTextarea--fullscreen"
                            value={nodeDataText}
                            onChange={(e) => setNodeDataText(e.target.value)}
                          />
                        ) : configsSelected.kind === 'strategy' ? (
                          <textarea
                            className="nodegraphs-configTextarea nodegraphs-configTextarea--fullscreen"
                            value={strategyConfigText}
                            onChange={(e) => setStrategyConfigText(e.target.value)}
                          />
                        ) : configsSelected.kind === 'model' ? (
                          <textarea
                            className="nodegraphs-configTextarea nodegraphs-configTextarea--fullscreen"
                            value={modelConfigText}
                            onChange={(e) => setModelConfigText(e.target.value)}
                          />
                        ) : (
                          <textarea
                            className="nodegraphs-configTextarea nodegraphs-configTextarea--fullscreen"
                            value={alignmentConfigText}
                            onChange={(e) => setAlignmentConfigText(e.target.value)}
                          />
                        )}
                      </div>
                    </div>

                    <div className="nodegraphs-configsCol nodegraphs-configsCol--chat">
                      <div style={{ display: 'grid', gap: 8, height: '100%' }}>
                        <div style={{ fontWeight: 700 }}>Chat</div>
                        <div className="nodegraphs-chatMessages" style={{ maxHeight: 'none' }}>
                          {chatMessages.length ? (
                            chatMessages.map((m) => (
                              <div key={m.ts} className="nodegraphs-chatMsg">
                                <div className="nodegraphs-chatMsgRole">{m.role}</div>
                                <div className="nodegraphs-chatMsgText">{m.text}</div>
                              </div>
                            ))
                          ) : (
                            <div style={{ fontSize: 12, opacity: 0.7 }}>No messages yet.</div>
                          )}
                        </div>

                        <div className="nodegraphs-chatInputRow" style={{ marginTop: 0 }}>
                          <textarea
                            className="nodegraphs-chatInput"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.preventDefault()
                                setConfigFullscreenOpen(false)
                                return
                              }
                              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                e.preventDefault()
                                void sendChatMessage()
                                return
                              }
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                void sendChatMessage()
                              }
                            }}
                            rows={3}
                            placeholder="Message…"
                          />
                          <button
                            onClick={() => void sendChatMessage()}
                            style={{
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: '1px solid var(--border)',
                              background: 'var(--surface)',
                              color: 'var(--text)',
                              cursor: 'pointer',
                              height: 'fit-content',
                            }}
                          >
                            Send
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
