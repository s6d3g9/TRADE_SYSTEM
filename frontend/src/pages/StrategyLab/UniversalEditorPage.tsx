import React, { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { http } from '../../services/httpClient'
import * as api from '../../services/api/strategylabApi'
import { StrategyTemplate, FreqAIModelVariant, StrategyAlignment } from '../../services/api/strategylabApi'
import { listExchanges, listPairs, MarketExchangeInfo, PairInfo } from '../../services/api/marketApi'

// --- THEME ---
const THEME = {
  bg: 'var(--bg)', 
  sidebar: 'var(--surface)', 
  activityBar: 'var(--surface-muted)',
  border: 'var(--border)', 
  text: 'var(--text)',
  textSecondary: 'var(--text-muted-2)',
  accent: 'var(--pos)', // Green-ish from site theme? Or use primary
    hover: 'var(--surface-muted)',
    selection: 'var(--surface-muted)',
  error: 'var(--down)',
  success: 'var(--up)'
}

function toIsoDate(yyyymmdd: string | null | undefined): string {
    const s = (yyyymmdd || '').trim()
    if (!/^\d{8}$/.test(s)) return ''
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

function toYyyyMmDd(iso: string | null | undefined): string {
    const s = (iso || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
    return s.replaceAll('-', '')
}

function isIsoDate(s: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test((s || '').trim())
}

function isoFromDate(d: Date): string {
    const yyyy = d.getUTCFullYear()
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
}

function toUtcDateFromIso(iso: string): Date {
    // iso is YYYY-MM-DD
    const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10))
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1))
}

function addMonthsUtc(date: Date, deltaMonths: number): Date {
    const y = date.getUTCFullYear()
    const m = date.getUTCMonth()
    return new Date(Date.UTC(y, m + deltaMonths, 1))
}

function daysInMonthUtc(year: number, monthIndex0: number): number {
    // monthIndex0: 0..11
    return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate()
}

function weekday0Mon(date: Date): number {
    // 0..6, Monday=0
    const js = date.getUTCDay() // Sunday=0
    return (js + 6) % 7
}

function MiniCalendar({
    valueIso,
    monthAnchorUtc,
    onChangeMonth,
    onPick,
    onClose,
}: {
    valueIso: string
    monthAnchorUtc: Date
    onChangeMonth: (next: Date) => void
    onPick: (iso: string) => void
    onClose: () => void
}) {
    const y = monthAnchorUtc.getUTCFullYear()
    const m = monthAnchorUtc.getUTCMonth()
    const first = new Date(Date.UTC(y, m, 1))
    const offset = weekday0Mon(first)
    const dim = daysInMonthUtc(y, m)
    const selected = isIsoDate(valueIso) ? valueIso : ''

    const monthLabel = monthAnchorUtc.toLocaleString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

    const cells: Array<{ iso: string; label: string; inMonth: boolean }> = []
    // 6 weeks grid
    for (let i = 0; i < 42; i++) {
        const dayNum = i - offset + 1
        if (dayNum >= 1 && dayNum <= dim) {
            const d = new Date(Date.UTC(y, m, dayNum))
            cells.push({ iso: isoFromDate(d), label: String(dayNum), inMonth: true })
        } else {
            cells.push({ iso: '', label: '', inMonth: false })
        }
    }

    return (
        <div
            style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                zIndex: 50,
                background: THEME.sidebar,
                border: `1px solid ${THEME.border}`,
                borderRadius: 10,
                padding: 10,
                width: 260,
                boxSizing: 'border-box',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <button
                    type="button"
                    onClick={() => onChangeMonth(addMonthsUtc(monthAnchorUtc, -1))}
                    style={{
                        padding: '6px 8px',
                        borderRadius: 8,
                        border: `1px solid ${THEME.border}`,
                        background: THEME.bg,
                        color: THEME.text,
                        cursor: 'pointer',
                        fontSize: 12,
                    }}
                >
                    ←
                </button>
                <div style={{ fontWeight: 800, color: THEME.text, fontSize: 12 }}>{monthLabel}</div>
                <button
                    type="button"
                    onClick={() => onChangeMonth(addMonthsUtc(monthAnchorUtc, 1))}
                    style={{
                        padding: '6px 8px',
                        borderRadius: 8,
                        border: `1px solid ${THEME.border}`,
                        background: THEME.bg,
                        color: THEME.text,
                        cursor: 'pointer',
                        fontSize: 12,
                    }}
                >
                    →
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
                {weekdays.map((w) => (
                    <div key={w} style={{ textAlign: 'center', fontSize: 11, color: THEME.textSecondary, padding: '2px 0' }}>
                        {w}
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {cells.map((c, idx) => {
                    const isSel = c.iso && selected === c.iso
                    return (
                        <button
                            key={idx}
                            type="button"
                            disabled={!c.inMonth}
                            onClick={() => {
                                if (!c.iso) return
                                onPick(c.iso)
                                onClose()
                            }}
                            style={{
                                height: 30,
                                borderRadius: 8,
                                border: `1px solid ${isSel ? THEME.accent : THEME.border}`,
                                background: isSel ? THEME.selection : THEME.bg,
                                color: THEME.text,
                                cursor: c.inMonth ? 'pointer' : 'default',
                                opacity: c.inMonth ? 1 : 0.35,
                                fontSize: 12,
                            }}
                        >
                            {c.label}
                        </button>
                    )
                })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                    type="button"
                    onClick={onClose}
                    style={{
                        padding: '6px 10px',
                        borderRadius: 8,
                        border: `1px solid ${THEME.border}`,
                        background: THEME.bg,
                        color: THEME.text,
                        cursor: 'pointer',
                        fontSize: 12,
                    }}
                >
                    Close
                </button>
            </div>
        </div>
    )
}

function CalendarField({
    label,
    valueIso,
    onChangeIso,
}: {
    label: string
    valueIso: string
    onChangeIso: (nextIso: string) => void
}) {
    const [open, setOpen] = useState(false)
    const [monthAnchor, setMonthAnchor] = useState<Date>(() => {
        const v = (valueIso || '').trim()
        if (isIsoDate(v)) return addMonthsUtc(toUtcDateFromIso(v), 0)
        return addMonthsUtc(new Date(), 0)
    })

    useEffect(() => {
        const v = (valueIso || '').trim()
        if (isIsoDate(v)) {
            setMonthAnchor(addMonthsUtc(toUtcDateFromIso(v), 0))
        }
    }, [valueIso])

    return (
        <label style={{ display: 'grid', gap: 4, fontSize: 11, color: THEME.textSecondary, position: 'relative' }}>
            {label}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                <input
                    type="text"
                    value={valueIso}
                    onChange={(e) => onChangeIso(e.target.value)}
                    placeholder="YYYY-MM-DD"
                    style={{
                        background: THEME.bg,
                        border: `1px solid ${THEME.border}`,
                        color: THEME.text,
                        padding: '8px',
                        width: '100%',
                        borderRadius: 2,
                        boxSizing: 'border-box',
                        fontFamily: 'monospace',
                        fontSize: 13,
                    }}
                />
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    style={{
                        padding: '8px 10px',
                        borderRadius: 2,
                        border: `1px solid ${THEME.border}`,
                        background: THEME.bg,
                        color: THEME.text,
                        cursor: 'pointer',
                        fontSize: 12,
                        whiteSpace: 'nowrap',
                    }}
                >
                    Pick
                </button>
            </div>

            {open ? (
                <MiniCalendar
                    valueIso={valueIso}
                    monthAnchorUtc={monthAnchor}
                    onChangeMonth={setMonthAnchor}
                    onPick={onChangeIso}
                    onClose={() => setOpen(false)}
                />
            ) : null}
        </label>
    )
}

function normalizeTimerange(value: string): { start: string; end: string } {
    const raw = (value || '').trim()
    if (!raw) return { start: '', end: '' }
    const [a, b] = raw.split('-', 2)
    const start = (a || '').replace(/\D/g, '').slice(0, 8)
    const end = (b || '').replace(/\D/g, '').slice(0, 8)
    return { start, end }
}

function TimerangePicker({
    value,
    onChange,
    label,
    hint,
}: {
    value: string
    onChange: (next: string) => void
    label?: string
    hint?: string
}) {
    const { start, end } = useMemo(() => normalizeTimerange(value), [value])
    const isoStart = useMemo(() => toIsoDate(start), [start])
    const isoEnd = useMemo(() => toIsoDate(end), [end])

    function setParts(nextStartIso: string, nextEndIso: string) {
        const nextStart = toYyyyMmDd(nextStartIso)
        const nextEnd = toYyyyMmDd(nextEndIso)
        if (!nextStart && !nextEnd) {
            onChange('')
            return
        }
        onChange(`${nextStart}-${nextEnd}`)
    }

    return (
        <div style={{ display: 'grid', gap: 8 }}>
            {label ? (
                <label style={{ fontWeight: 600, display: 'block', fontSize: 12, color: THEME.text }}>{label}</label>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <CalendarField label="Start" valueIso={isoStart} onChangeIso={(next) => setParts(next, isoEnd)} />
                <CalendarField label="End" valueIso={isoEnd} onChangeIso={(next) => setParts(isoStart, next)} />
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="YYYYMMDD-YYYYMMDD (или YYYYMMDD-)"
                    style={{
                        background: THEME.bg,
                        border: `1px solid ${THEME.border}`,
                        color: THEME.text,
                        padding: '8px',
                        width: '100%',
                        borderRadius: 2,
                        fontFamily: 'monospace',
                        fontSize: 13,
                        boxSizing: 'border-box',
                    }}
                />
                <div style={{ fontSize: 11, color: THEME.textSecondary }}>
                    {hint || 'Формат: YYYYMMDD-YYYYMMDD или YYYYMMDD- (открытый конец)'}
                </div>
            </div>
        </div>
    )
}

const TIMEFRAME_OPTIONS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d']

function fmtYyyyMmDd(d: Date): string {
    const yyyy = d.getUTCFullYear()
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    return `${yyyy}${mm}${dd}`
}

function timerangeLastDays(days: number): string {
    const end = new Date()
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
    return `${fmtYyyyMmDd(start)}-${fmtYyyyMmDd(end)}`
}

function TimerangePresets({ onPick }: { onPick: (v: string) => void }) {
    return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[30, 90, 180, 365].map((d) => (
                <button
                    key={d}
                    type="button"
                    onClick={() => onPick(timerangeLastDays(d))}
                    style={{
                        padding: '6px 10px',
                        borderRadius: 8,
                        border: `1px solid ${THEME.border}`,
                        background: THEME.sidebar,
                        color: THEME.text,
                        cursor: 'pointer',
                        fontSize: 12,
                        lineHeight: 1,
                        whiteSpace: 'nowrap',
                    }}
                >
                    Last {d}d
                </button>
            ))}
            <button
                type="button"
                onClick={() => {
                    const end = new Date()
                    const start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1))
                    onPick(`${fmtYyyyMmDd(start)}-${fmtYyyyMmDd(end)}`)
                }}
                style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: `1px solid ${THEME.border}`,
                    background: THEME.sidebar,
                    color: THEME.text,
                    cursor: 'pointer',
                    fontSize: 12,
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                }}
            >
                YTD
            </button>
        </div>
    )
}

type FlatRow = { path: string; type: string; value: string }

function safeStringify(value: any): string {
    try {
        if (typeof value === 'string') return value
        if (typeof value === 'number' || typeof value === 'boolean' || value == null) return String(value)
        return JSON.stringify(value)
    } catch {
        return String(value)
    }
}

function extractJsonObject(text: string): any | null {
    const raw = (text || '').trim()
    if (!raw) return null

    const tryParse = (s: string): any | null => {
        const t = (s || '').trim()
        if (!t) return null

        // Fast-path: exact JSON
        try {
            const v = JSON.parse(t)
            if (v && typeof v === 'object' && !Array.isArray(v)) return v
        } catch {
            // continue
        }

        // Cheap repair: remove trailing commas
        const repaired = t.replace(/,\s*([}\]])/g, '$1')
        try {
            const v = JSON.parse(repaired)
            if (v && typeof v === 'object' && !Array.isArray(v)) return v
        } catch {
            // continue
        }

        return null
    }

    // Prefer fenced JSON blocks (```json ...```), then any fenced block.
    const fenceJson = raw.match(/```json\s*([\s\S]*?)\s*```/i)
    if (fenceJson) {
        const v = tryParse(fenceJson[1])
        if (v) return v
    }
    const fenceAny = raw.match(/```\s*([\s\S]*?)\s*```/i)
    if (fenceAny) {
        const v = tryParse(fenceAny[1])
        if (v) return v
    }

    // Balanced-brace scan for first JSON object.
    const s = raw
    const start = s.indexOf('{')
    if (start === -1) return null

    let depth = 0
    let inStr = false
    let escape = false
    for (let i = start; i < s.length; i++) {
        const ch = s[i]
        if (inStr) {
            if (escape) {
                escape = false
                continue
            }
            if (ch === '\\') {
                escape = true
                continue
            }
            if (ch === '"') {
                inStr = false
            }
            continue
        }

        if (ch === '"') {
            inStr = true
            continue
        }
        if (ch === '{') depth++
        if (ch === '}') {
            depth--
            if (depth === 0) {
                const slice = s.slice(start, i + 1)
                const v = tryParse(slice)
                if (v) return v
                return null
            }
        }
    }

    return null
}

function flattenAny(value: any, basePath = ''): FlatRow[] {
    const rows: FlatRow[] = []

    const t = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value

    const pushContainer = (type: string, info: string) => {
        rows.push({ path: basePath || '(root)', type, value: info })
    }

    if (t === 'object') {
        const keys = Object.keys(value || {})
        pushContainer('object', `keys: ${keys.length}`)
        keys.sort().forEach((k) => {
            const nextPath = basePath ? `${basePath}.${k}` : k
            rows.push(...flattenAny(value[k], nextPath))
        })
        return rows
    }

    if (t === 'array') {
        const arr = value as any[]
        pushContainer('array', `len: ${arr.length}`)
        arr.forEach((item, idx) => {
            const nextPath = basePath ? `${basePath}[${idx}]` : `[${idx}]`
            rows.push(...flattenAny(item, nextPath))
        })
        return rows
    }

    // primitive
    rows.push({
        path: basePath || '(root)',
        type: t,
        value: safeStringify(value),
    })
    return rows
}

function BacktestResultTable({ data }: { data: any }) {
    const rows = useMemo(() => flattenAny(data), [data])

    return (
        <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 12, color: THEME.textSecondary }}>Rows: {rows.length}</div>
            <div style={{ overflow: 'auto', border: `1px solid ${THEME.border}`, borderRadius: 10, background: THEME.bg }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: THEME.activityBar }}>
                            <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: `1px solid ${THEME.border}`, position: 'sticky', top: 0, zIndex: 1 }}>Path</th>
                            <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: `1px solid ${THEME.border}`, position: 'sticky', top: 0, zIndex: 1 }}>Type</th>
                            <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: `1px solid ${THEME.border}`, position: 'sticky', top: 0, zIndex: 1 }}>Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={i} style={{ borderBottom: `1px solid ${THEME.border}` }}>
                                <td style={{ padding: '8px 12px', verticalAlign: 'top', fontFamily: 'monospace', color: THEME.text, whiteSpace: 'nowrap' }}>{r.path}</td>
                                <td style={{ padding: '8px 12px', verticalAlign: 'top', color: THEME.textSecondary, whiteSpace: 'nowrap' }}>{r.type}</td>
                                <td style={{ padding: '8px 12px', verticalAlign: 'top', color: THEME.text, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{r.value}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

type Scope = 'strategy' | 'model' | 'alignment'
type FileType = 'python' | 'json'

// Minimal tree node structure
type ExplorerNode = {
  id: string
  label: string
  type: 'folder' | 'file'
  fileType?: FileType
  children?: ExplorerNode[]
  data?: any // Holds real IDs etc
  isOpen?: boolean
}

function HyperoptWizard({ strategyName, onClose, onRun }: { strategyName: string, onClose: () => void, onRun: (cfg: any) => void }) {
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(true)
    const [analysis, setAnalysis] = useState<any>(null)
    
    // Config State
    const [spaces, setSpaces] = useState<string[]>([])
    const [epochs, setEpochs] = useState(100)
    const [timerange, setTimerange] = useState('')
    
    useEffect(() => {
        http(`/strategylab/strategies/${strategyName}/hyperopt-info`)
            .then((res: any) => {
                setAnalysis(res)
                // Auto-select spaces based on analysis
                const defaults = []
                if (res.has_buy_params) defaults.push('buy')
                if (res.has_sell_params) defaults.push('sell')
                if (res.has_protection_params) defaults.push('stoplib') // mapping?
                if (res.uses_roi) defaults.push('roi')
                // Always add roi/stoploss/trailing if not detected?
                // Default fallback:
                if (defaults.length === 0) defaults.push('roi', 'stoplib')
                setSpaces(defaults)
                setLoading(false)
            })
            .catch(e => {
                setLoading(false)
                alert("Failed to analyze strategy: " + e.message)
            })
    }, [strategyName])

    const availableSpaces = ['buy', 'sell', 'roi', 'stoploss', 'trailing', 'protection']

    if (loading) return (
        <div style={{ padding: 20, color: THEME.text }}>Analyzing {strategyName}...</div>
    )

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
            <div style={{
                width: 720,
                maxWidth: '92vw',
                maxHeight: '92vh',
                overflowY: 'auto',
                background: THEME.sidebar,
                border: `1px solid ${THEME.border}`,
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Header */}
                <div style={{ padding: 16, borderBottom: `1px solid ${THEME.border}`, display: 'flex', justifyContent: 'space-between' }}>
                    <h3 style={{ margin: 0, color: THEME.text }}>Hyperopt Wizard: {strategyName}</h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: THEME.textSecondary, cursor: 'pointer' }}>✕</button>
                </div>
                
                {/* Content */}
                <div style={{ padding: 20, color: THEME.textSecondary }}>
                    {step === 1 && (
                        <div>
                            <h4 style={{marginTop:0}}>Detected Parameters</h4>
                            <div style={{background: THEME.activityBar, padding: 10, marginBottom: 10, border: `1px solid ${THEME.border}`}}>
                                {analysis.parameters.length === 0 && <div>No explicit parameters found.</div>}
                                {analysis.parameters.map((p: any, i:number) => (
                                    <div key={i} style={{fontSize: 12, marginBottom: 4}}>
                                        <span style={{color: THEME.text}}>{p.name}</span>
                                        <span style={{color: THEME.textSecondary}}> {p.type}</span>
                                        <span style={{color: THEME.textSecondary}}> ({p.space || 'global'})</span>
                                    </div>
                                ))}
                            </div>
                            <div style={{fontSize: 12, color: THEME.textSecondary}}>
                                Found {analysis.parameters.length} optimization targets.
                            </div>
                            <div style={{marginTop: 20, textAlign: 'right'}}>
                                <button onClick={() => setStep(2)} style={{padding: '8px 16px', background: THEME.accent, color: THEME.text, border: 'none', cursor: 'pointer'}}>Next: Configuration &gt;</button>
                            </div>
                        </div>
                    )}
                    
                    {step === 2 && (
                        <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                            <div>
                                <label style={{display: 'block', marginBottom: 8, fontWeight: 'bold'}}>Optimization Spaces</label>
                                <div style={{display: 'flex', gap: 10}}>
                                    {availableSpaces.map(s => (
                                        <label key={s} style={{display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer'}}>
                                            <input 
                                                type="checkbox" 
                                                checked={spaces.includes(s)}
                                                onChange={e => {
                                                    if (e.target.checked) setSpaces([...spaces, s])
                                                    else setSpaces(spaces.filter(x => x !== s))
                                                }}
                                            />
                                            {s}
                                        </label>
                                    ))}
                                </div>
                                <div style={{fontSize: 12, color: THEME.textSecondary, marginTop: 4}}>
                                    Based on static analysis, we recommend: <b>{analysis.has_buy_params ? 'buy ' : ''}{analysis.has_sell_params ? 'sell ' : ''}</b>
                                </div>
                            </div>
                            
                            <div>
                                <label style={{display: 'block', marginBottom: 8, fontWeight: 'bold'}}>Epochs</label>
                                <input type="number" 
                                    value={epochs} 
                                    onChange={e => setEpochs(parseInt(e.target.value))}
                                    style={{background: '#333', border: '1px solid #555', color: 'white', padding: 6, width: 100}}
                                />
                                <span style={{fontSize: 12, color: '#888', marginLeft: 10}}>100-500 recommended for quick checks.</span>
                            </div>
                            
                                                        <TimerangePicker
                                                            value={timerange}
                                                            onChange={setTimerange}
                                                            label="Timerange (Optional)"
                                                            hint="Leave empty for full history or use '20240101-'"
                                                        />

                            <div style={{marginTop: 20, display: 'flex', justifyContent: 'space-between'}}>
                                <button onClick={() => setStep(1)} style={{padding: '8px 16px', background: '#333', color: 'white', border: 'none', cursor: 'pointer'}}>&lt; Back</button>
                                <button onClick={() => onRun({ spaces: spaces.join(' '), epochs, timerange })} style={{padding: '8px 16px', background: '#d7ba7d', color: '#1e1e1e', border: 'none', cursor: 'pointer', fontWeight: 'bold'}}>🚀 START OPTIMIZATION</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function LogViewerPanel({ jobId }: { jobId: string }) {
  const [logs, setLogs] = useState<string[]>([])
  const [status, setStatus] = useState('starting')
  const logRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    fetchLogs();
    const timer = setInterval(fetchLogs, 2000)
    return () => clearInterval(timer)
    
    async function fetchLogs() {
      try {
        const res = await http<{ logs: string[], status: string }>(`/strategylab/hyperopt/${jobId}/logs`)
        setLogs(res.logs || [])
        setStatus(res.status || 'unknown')
      } catch (e) {
        console.error(e)
      }
    }
  }, [jobId])

  useEffect(() => {
    if (logRef.current) {
        logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div style={{ height: 250, display: 'flex', flexDirection: 'column', background: '#1e1e1e', borderBottom: `1px solid ${THEME.border}` }}>
        <div style={{ padding: '8px 16px', background: '#252526', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: '#ccc', fontSize: 13 }}>Hyperopt Logs</span>
            <span style={{ 
                fontSize: 11, padding: '2px 6px', borderRadius: 3, 
                background: status === 'running' ? '#007acc' : (status === 'completed' ? '#00cc00' : '#cc0000'),
                color: 'white'
            }}>{status.toUpperCase()}</span>
        </div>
        <div ref={logRef} style={{ flex: 1, overflowY: 'auto', padding: 10, fontFamily: 'Consolas, monospace', fontSize: 12, color: '#d4d4d4' }}>
            {logs.length === 0 && <div style={{opacity: 0.5}}>Waiting for logs...</div>}
            {logs.map((l, i) => (
                <div key={i} style={{whiteSpace: 'pre-wrap', marginBottom: 2, wordBreak: 'break-all'}}>{l}</div>
            ))}
        </div>
    </div>
  )
}

function LogViewerModal({ jobId, onClose }: { jobId: string, onClose: () => void }) {
  const [logs, setLogs] = useState<string[]>([])
  const [status, setStatus] = useState('starting')
  const logRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    // Initial fetch
    fetchLogs();
    
    // Polling
    const timer = setInterval(fetchLogs, 2000)
    return () => clearInterval(timer)
    
    async function fetchLogs() {
      try {
        const res = await http<{ logs: string[], status: string }>(`/strategylab/hyperopt/${jobId}/logs`)
        setLogs(res.logs || [])
        setStatus(res.status || 'unknown')
      } catch (e) {
        console.error(e)
      }
    }
  }, [jobId])

  useEffect(() => {
    if (logRef.current) {
        logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
        <div style={{
            width: '80%', height: '80%', background: '#1e1e1e', border: `1px solid ${THEME.border}`,
            display: 'flex', flexDirection: 'column', boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
        }}>
            <div style={{ padding: 16, borderBottom: `1px solid ${THEME.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#252526' }}>
                <div style={{display:'flex', gap: 10, alignItems:'center'}}>
                    <span style={{ fontWeight: 'bold', color: 'white' }}>Hyperopt Logs</span>
                    <span style={{ 
                        fontSize: 12, padding: '2px 8px', borderRadius: 4, 
                        background: status === 'running' ? '#007acc' : (status === 'completed' ? '#00cc00' : '#cc0000'),
                        color: 'white'
                    }}>
                        {status.toUpperCase()}
                    </span>
                </div>
                <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div ref={logRef} style={{ flex: 1, overflow: 'auto', padding: 16, fontFamily: 'Consolas, monospace', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2, color: '#d4d4d4', background: '#1e1e1e' }}>
                {logs.length === 0 && <div style={{opacity: 0.5}}>Waiting for logs...</div>}
                {logs.map((l, i) => (
                    <div key={i} style={{whiteSpace: 'pre-wrap'}}>{l}</div>
                ))}
            </div>
        </div>
    </div>
  )
}


function humanScopeLabel(scope: 'strategy' | 'model' | 'alignment') {
  if (scope === 'strategy') return 'strategy'
  if (scope === 'model') return 'model'
  return 'alignment'
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
function HyperoptDashboard({ strategyName, activeJobId, onRun }: { strategyName: string | null, activeJobId: string | null, onRun: (cfg: any) => void }) {
    const [analysis, setAnalysis] = useState<any>(null)
    const [spaces, setSpaces] = useState<string[]>([])
    const [epochs, setEpochs] = useState(100)
    const [timerange, setTimerange] = useState('20240101-')
    const [hyperoptLoss, setHyperoptLoss] = useState('SharpeHyperOptLoss')
    const [downloadData, setDownloadData] = useState(true)
    const [jobWorkers, setJobWorkers] = useState(1)
    const [timeframe, setTimeframe] = useState<string>('')
    const [timeframeDetail, setTimeframeDetail] = useState<string>('')
    const [pairsOverride, setPairsOverride] = useState<string>('')
    const [maxOpenTrades, setMaxOpenTrades] = useState<string>('')
    const [stakeAmount, setStakeAmount] = useState<string>('')
    const [fee, setFee] = useState<string>('')
    const [dryRunWallet, setDryRunWallet] = useState<string>('')
    const [eps, setEps] = useState<boolean>(false)
    const [enableProtections, setEnableProtections] = useState<boolean>(false)
    const [randomState, setRandomState] = useState<string>('')
    const [minTrades, setMinTrades] = useState<string>('')
    const [analyzePerEpoch, setAnalyzePerEpoch] = useState<boolean>(false)
    const [earlyStop, setEarlyStop] = useState<string>('')
    const [dataFormatOHLCV, setDataFormatOHLCV] = useState<string>('')
    const [printAll, setPrintAll] = useState<boolean>(false)
    const [printJson, setPrintJson] = useState<boolean>(false)
    const [disableParamExport, setDisableParamExport] = useState<boolean>(false)
    const [ignoreMissingSpaces, setIgnoreMissingSpaces] = useState<boolean>(false)
    const [showAllDetected, setShowAllDetected] = useState(false)
    const [paramDrafts, setParamDrafts] = useState<Record<string, any>>({})
    const [applyBusy, setApplyBusy] = useState(false)
    const [applyMsg, setApplyMsg] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    
    // Log state
    const [logs, setLogs] = useState<string[]>([])
    const [status, setStatus] = useState('starting')
    const logRef = useRef<HTMLDivElement>(null)

    // Load Analysis when strategy changes
    useEffect(() => {
        if (!strategyName) return
        setLoading(true)
        http(`/strategylab/strategies/${strategyName}/hyperopt-info`)
            .then((res: any) => {
                setAnalysis(res)
                                // Initialize drafts from detected params
                                const nextDrafts: Record<string, any> = {}
                                ;(res?.parameters || []).forEach((p: any) => {
                                    if (!p?.name) return
                                    nextDrafts[p.name] = {
                                        name: p.name,
                                        type: p.type,
                                        min: p.min ?? null,
                                        max: p.max ?? null,
                                        default: p.default ?? null,
                                        space: p.space ?? null,
                                        optimize: typeof p.optimize === 'boolean' ? p.optimize : null,
                                    }
                                })
                                setParamDrafts(nextDrafts)
                // Auto-select spaces
                const defaults = []
                if (res.has_buy_params) defaults.push('buy')
                if (res.has_sell_params) defaults.push('sell')
                if (res.has_protection_params) defaults.push('protection')
                if (res.uses_roi) defaults.push('roi')
                if (defaults.length === 0) defaults.push('roi', 'stoploss')
                setSpaces(defaults)
                setLoading(false)
            })
            .catch(e => {
                setLoading(false)
                console.error(e)
            })
    }, [strategyName])

        const spaceHasEnabledParams = useMemo(() => {
            const enabled = (analysis?.parameters || []).filter((p: any) => p && p.optimize !== false)
            const set = new Set<string>()
            enabled.forEach((p: any) => {
                const sp = (p?.space || '').toString().trim()
                if (sp) set.add(sp)
            })
            // roi/trailing may be valid even without Parameter objects
            if (analysis?.uses_roi) set.add('roi')
            if (analysis?.uses_trailing) set.add('trailing')
            // stoploss is generally available as a strategy attribute
            set.add('stoploss')
            return set
        }, [analysis])

        function setDraft(name: string, patch: Record<string, any>) {
            setParamDrafts((prev) => ({
                ...prev,
                [name]: {
                    ...(prev[name] || { name }),
                    ...patch,
                },
            }))
        }

        async function applyParamEdits() {
            if (!strategyName) return
            setApplyBusy(true)
            setApplyMsg(null)
            try {
                const updates = Object.values(paramDrafts || {}).map((p: any) => ({
                    name: p.name,
                    type: p.type ?? null,
                    min: p.min === '' ? null : p.min,
                    max: p.max === '' ? null : p.max,
                    default: p.default === '' ? null : p.default,
                    space: (p.space ?? '').toString().trim() || null,
                    optimize: typeof p.optimize === 'boolean' ? p.optimize : null,
                }))

                const res = await http<{ ok: boolean; updated: number; analysis: any }>(
                    `/strategylab/strategies/${strategyName}/hyperopt-params/apply`,
                    {
                        method: 'POST',
                        body: JSON.stringify({ updates }),
                    },
                )

                if (res?.analysis) {
                    setAnalysis(res.analysis)
                }
                setApplyMsg(`Applied: ${res?.updated ?? 0}`)
            } catch (e: any) {
                setApplyMsg(`Error: ${e?.message || 'Failed to apply edits'}`)
            } finally {
                setApplyBusy(false)
            }
        }

    // Fetch Logs if activeJobId
    useEffect(() => {
        if (!activeJobId) {
            setLogs([])
            setStatus('idle')
            return
        }
        
        const fetchLogs = async () => {
            try {
                const res = await http<{ logs: string[], status: string }>(`/strategylab/hyperopt/${activeJobId}/logs`)
                setLogs(res.logs || [])
                setStatus(res.status || 'unknown')
            } catch (e) {
                console.error(e)
            }
        }
        fetchLogs()
        const t = setInterval(fetchLogs, 2000)
        return () => clearInterval(t)
    }, [activeJobId])
    
    // Scroll logs
    useEffect(() => {
        if(logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    }, [logs])

    return (
        <div style={{height: '100%', overflowY: 'auto', overflowX: 'hidden', background: THEME.bg}}>
        <div style={{display: 'flex', minHeight: '100%'}}>
            {/* Setting Pane */}
            <div style={{width: 320, borderRight: `1px solid ${THEME.border}`, display: 'flex', flexDirection: 'column', background: THEME.sidebar}}>
                <div style={{padding: '10px 16px', borderBottom: `1px solid ${THEME.border}`, color: THEME.textSecondary, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5}}>
                    Hyperopt Configuration
                </div>
                
                <div style={{padding: 16}}>
                    {!strategyName ? <div style={{color: THEME.textSecondary, fontSize: 13, fontStyle: 'italic'}}>Select a strategy file to configure.</div> : (
                        loading ? <div style={{color: THEME.textSecondary}}>Analyzing {strategyName}...</div> : (
                        <div style={{display: 'flex', flexDirection: 'column', gap: 24}}>
                            {/* Spaces */}
                            <div>
                                <label style={{fontWeight: 600, display: 'block', marginBottom: 8, fontSize: 12, color: THEME.text}}>OPTIMIZATION SPACES</label>
                                <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
                                    {['buy', 'sell', 'roi', 'stoploss', 'trailing', 'protection'].map(s => (
                                         <label key={s} style={{
                                             display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', 
                                             background: spaces.includes(s) ? THEME.selection : 'transparent', 
                                             border: `1px solid ${spaces.includes(s) ? THEME.accent : THEME.border}`,
                                                                                         opacity: (analysis && !spaceHasEnabledParams.has(s)) ? 0.55 : 1,
                                             padding: '6px 10px', borderRadius: 2, fontSize: 13, color: THEME.text,
                                             transition: 'all 0.2s'
                                         }}>
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={spaces.includes(s)}
                                                                                            disabled={!!analysis && !spaceHasEnabledParams.has(s)}
                                                                                            onChange={e => {
                                                                                                    if (e.target.checked) setSpaces([...spaces, s])
                                                                                                    else setSpaces(spaces.filter(x => x !== s))
                                                                                            }}
                                                                                            style={{accentColor: THEME.accent}}
                                                                                        />
                                            {s}
                                         </label>
                                    ))}
                                </div>
                                <div style={{fontSize: 11, color: THEME.textSecondary, marginTop: 6}}>
                                  Spaces correspond to Freqtrade hyperopt spaces (what groups to optimize).
                                </div>
                                                                {analysis ? (
                                                                    <div style={{fontSize: 11, color: THEME.textSecondary, marginTop: 6}}>
                                                                        Disabled spaces mean no enabled parameters detected (often because parameters use optimize=False).
                                                                    </div>
                                                                ) : null}
                            </div>
                            
                             {/* Epochs */}
                            <div>
                                <label style={{fontWeight: 600, display: 'block', marginBottom: 8, fontSize: 12, color: THEME.text}}>EPOCHS</label>
                                                                <input type="number" min={1} step={1} value={epochs} onChange={e => {
                                                                    const n = parseInt(e.target.value, 10)
                                                                    setEpochs(Number.isFinite(n) && n > 0 ? n : 1)
                                                                }} 
                                   style={{
                                       background: THEME.bg, border: `1px solid ${THEME.border}`, 
                                       color: THEME.text, padding: '8px', width: '100%', borderRadius: 2,
                                       fontFamily: 'inherit', fontSize: 13
                                   }} 
                                />
                                <div style={{fontSize: 11, color: THEME.textSecondary, marginTop: 4}}>Number of iterations to run.</div>
                            </div>

                                                                                                                {/* Timerange */}
                                                                                                                <TimerangePicker
                                                                                                                    value={timerange}
                                                                                                                    onChange={setTimerange}
                                                                                                                    label="TIMERANGE"
                                                                                                                />

                                                                                                                <TimerangePresets onPick={setTimerange} />

                                                        {/* Loss */}
                                                        <div>
                                                                <label style={{fontWeight: 600, display: 'block', marginBottom: 8, fontSize: 12, color: THEME.text}}>HYPEROPT LOSS</label>
                                                                <input
                                                                    type="text"
                                                                    value={hyperoptLoss}
                                                                    onChange={(e) => setHyperoptLoss(e.target.value)}
                                                                    placeholder="SharpeHyperOptLoss"
                                                                    style={{
                                                                        background: THEME.bg,
                                                                        border: `1px solid ${THEME.border}`,
                                                                        color: THEME.text,
                                                                        padding: '8px',
                                                                        width: '100%',
                                                                        borderRadius: 2,
                                                                        fontFamily: 'monospace',
                                                                        fontSize: 13,
                                                                        boxSizing: 'border-box',
                                                                    }}
                                                                />
                                                                <div style={{fontSize: 11, color: THEME.textSecondary, marginTop: 4}}>Имя класса loss-функции (Freqtrade).</div>
                                                        </div>

                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                Job workers
                                                                <input
                                                                    type="number"
                                                                    min={-1}
                                                                    max={32}
                                                                    step={1}
                                                                    value={jobWorkers}
                                                                    onChange={(e) => {
                                                                        const n = parseInt(e.target.value, 10)
                                                                        setJobWorkers(Number.isFinite(n) ? n : 1)
                                                                    }}
                                                                    style={{
                                                                        background: THEME.bg,
                                                                        border: `1px solid ${THEME.border}`,
                                                                        color: THEME.text,
                                                                        padding: '8px',
                                                                        width: '100%',
                                                                        borderRadius: 2,
                                                                        fontFamily: 'inherit',
                                                                        fontSize: 13,
                                                                        boxSizing: 'border-box',
                                                                    }}
                                                                />
                                                                <div style={{ fontSize: 11, color: THEME.textSecondary }}>1..32 or -1 (auto)</div>
                                                            </label>
                                                            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: THEME.text, paddingTop: 22 }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={downloadData}
                                                                    onChange={(e) => setDownloadData(e.target.checked)}
                                                                    style={{ accentColor: THEME.accent }}
                                                                />
                                                                Download missing data
                                                            </label>
                                                        </div>

                                                        <details style={{ border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 10, background: THEME.bg }}>
                                                            <summary style={{ cursor: 'pointer', fontWeight: 700, color: THEME.text, fontSize: 12 }}>Advanced options</summary>
                                                            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                        Timeframe (override)
                                                                        <select
                                                                            value={timeframe}
                                                                            onChange={(e) => setTimeframe(e.target.value)}
                                                                            style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 2 }}
                                                                        >
                                                                            <option value="">(use config/strategy)</option>
                                                                            {TIMEFRAME_OPTIONS.map((t) => (
                                                                                <option key={t} value={t}>
                                                                                    {t}
                                                                                </option>
                                                                            ))}
                                                                        </select>
                                                                    </label>
                                                                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                        Timeframe detail
                                                                        <select
                                                                            value={timeframeDetail}
                                                                            onChange={(e) => setTimeframeDetail(e.target.value)}
                                                                            style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 2 }}
                                                                        >
                                                                            <option value="">(none)</option>
                                                                            {TIMEFRAME_OPTIONS.map((t) => (
                                                                                <option key={t} value={t}>
                                                                                    {t}
                                                                                </option>
                                                                            ))}
                                                                        </select>
                                                                    </label>
                                                                </div>

                                                                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                    Pairs override (comma/space separated)
                                                                    <input
                                                                        value={pairsOverride}
                                                                        onChange={(e) => setPairsOverride(e.target.value)}
                                                                        placeholder="BTC/USDT ETH/USDT"
                                                                        style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 2, fontFamily: 'monospace', fontSize: 12 }}
                                                                    />
                                                                </label>

                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                        Max open trades
                                                                        <input
                                                                            type="number"
                                                                            value={maxOpenTrades}
                                                                            onChange={(e) => setMaxOpenTrades(e.target.value)}
                                                                            placeholder="(config)"
                                                                            style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 2, fontSize: 13 }}
                                                                        />
                                                                    </label>
                                                                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                        Stake amount
                                                                        <input
                                                                            value={stakeAmount}
                                                                            onChange={(e) => setStakeAmount(e.target.value)}
                                                                            placeholder="(config)"
                                                                            style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 2, fontSize: 13 }}
                                                                        />
                                                                    </label>
                                                                </div>

                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                        Fee
                                                                        <input
                                                                            type="number"
                                                                            step="0.0001"
                                                                            value={fee}
                                                                            onChange={(e) => setFee(e.target.value)}
                                                                            placeholder="(config)"
                                                                            style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 2, fontSize: 13 }}
                                                                        />
                                                                    </label>
                                                                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                        Dry-run wallet
                                                                        <input
                                                                            type="number"
                                                                            step="0.01"
                                                                            value={dryRunWallet}
                                                                            onChange={(e) => setDryRunWallet(e.target.value)}
                                                                            placeholder="(config)"
                                                                            style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 2, fontSize: 13 }}
                                                                        />
                                                                    </label>
                                                                </div>

                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: THEME.text }}>
                                                                        <input type="checkbox" checked={eps} onChange={(e) => setEps(e.target.checked)} style={{ accentColor: THEME.accent }} />
                                                                        --eps
                                                                    </label>
                                                                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: THEME.text }}>
                                                                        <input type="checkbox" checked={enableProtections} onChange={(e) => setEnableProtections(e.target.checked)} style={{ accentColor: THEME.accent }} />
                                                                        Enable protections
                                                                    </label>
                                                                </div>

                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                        Random state
                                                                        <input
                                                                            type="number"
                                                                            step="1"
                                                                            value={randomState}
                                                                            onChange={(e) => setRandomState(e.target.value)}
                                                                            placeholder="(none)"
                                                                            style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 2, fontSize: 13 }}
                                                                        />
                                                                    </label>
                                                                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                        Min trades
                                                                        <input
                                                                            type="number"
                                                                            step="1"
                                                                            value={minTrades}
                                                                            onChange={(e) => setMinTrades(e.target.value)}
                                                                            placeholder="(none)"
                                                                            style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 2, fontSize: 13 }}
                                                                        />
                                                                    </label>
                                                                </div>

                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: THEME.text }}>
                                                                        <input type="checkbox" checked={analyzePerEpoch} onChange={(e) => setAnalyzePerEpoch(e.target.checked)} style={{ accentColor: THEME.accent }} />
                                                                        Analyze per epoch
                                                                    </label>
                                                                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                        Early stop
                                                                        <input
                                                                            type="number"
                                                                            step="1"
                                                                            value={earlyStop}
                                                                            onChange={(e) => setEarlyStop(e.target.value)}
                                                                            placeholder="(none)"
                                                                            style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 2, fontSize: 13 }}
                                                                        />
                                                                    </label>
                                                                </div>

                                                                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                    OHLCV data format
                                                                    <input
                                                                        value={dataFormatOHLCV}
                                                                        onChange={(e) => setDataFormatOHLCV(e.target.value)}
                                                                        placeholder="(default)"
                                                                        style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 2, fontFamily: 'monospace', fontSize: 12 }}
                                                                    />
                                                                </label>

                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: THEME.text }}>
                                                                        <input type="checkbox" checked={printAll} onChange={(e) => setPrintAll(e.target.checked)} style={{ accentColor: THEME.accent }} />
                                                                        Print all
                                                                    </label>
                                                                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: THEME.text }}>
                                                                        <input type="checkbox" checked={printJson} onChange={(e) => setPrintJson(e.target.checked)} style={{ accentColor: THEME.accent }} />
                                                                        Print JSON
                                                                    </label>
                                                                </div>

                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: THEME.text }}>
                                                                        <input type="checkbox" checked={disableParamExport} onChange={(e) => setDisableParamExport(e.target.checked)} style={{ accentColor: THEME.accent }} />
                                                                        Disable param export
                                                                    </label>
                                                                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: THEME.text }}>
                                                                        <input type="checkbox" checked={ignoreMissingSpaces} onChange={(e) => setIgnoreMissingSpaces(e.target.checked)} style={{ accentColor: THEME.accent }} />
                                                                        Ignore missing spaces
                                                                    </label>
                                                                </div>
                                                            </div>
                                                        </details>

                            
                            <button 
                                                                onClick={() => {
                                                                    const pairs = (pairsOverride || '')
                                                                        .split(/[\s,]+/g)
                                                                        .map((p) => p.trim())
                                                                        .filter(Boolean)
                                                                    const cfg: any = {
                                                                        spaces,
                                                                        epochs,
                                                                        timerange,
                                                                        hyperopt_loss: hyperoptLoss,
                                                                        download_data: downloadData,
                                                                        job_workers: jobWorkers,
                                                                    }
                                                                    if (timeframe) cfg.timeframe = timeframe
                                                                    if (timeframeDetail) cfg.timeframe_detail = timeframeDetail
                                                                    if (dataFormatOHLCV.trim()) cfg.data_format_ohlcv = dataFormatOHLCV.trim()
                                                                    if (maxOpenTrades.trim() && Number.isFinite(parseInt(maxOpenTrades.trim(), 10))) cfg.max_open_trades = parseInt(maxOpenTrades.trim(), 10)
                                                                    if (stakeAmount.trim()) cfg.stake_amount = stakeAmount.trim()
                                                                    if (fee.trim() && Number.isFinite(parseFloat(fee.trim()))) cfg.fee = parseFloat(fee.trim())
                                                                    if (dryRunWallet.trim() && Number.isFinite(parseFloat(dryRunWallet.trim()))) cfg.dry_run_wallet = parseFloat(dryRunWallet.trim())
                                                                    if (pairs.length) cfg.pairs = pairs
                                                                    if (eps) cfg.eps = true
                                                                    if (enableProtections) cfg.enable_protections = true
                                                                    if (randomState.trim() && Number.isFinite(parseInt(randomState.trim(), 10))) cfg.random_state = parseInt(randomState.trim(), 10)
                                                                    if (minTrades.trim() && Number.isFinite(parseInt(minTrades.trim(), 10))) cfg.min_trades = parseInt(minTrades.trim(), 10)
                                                                    if (analyzePerEpoch) cfg.analyze_per_epoch = true
                                                                    if (earlyStop.trim() && Number.isFinite(parseInt(earlyStop.trim(), 10))) cfg.early_stop = parseInt(earlyStop.trim(), 10)
                                                                    if (printAll) cfg.print_all = true
                                                                    if (printJson) cfg.print_json = true
                                                                    if (disableParamExport) cfg.disable_param_export = true
                                                                    if (ignoreMissingSpaces) cfg.ignore_missing_spaces = true
                                                                    onRun(cfg)
                                                                }}
                                disabled={!!activeJobId && status === 'running'}
                                style={{
                                    padding: '10px', background: (activeJobId && status === 'running') ? THEME.activityBar : THEME.accent, 
                                    color: 'white', border: 'none', cursor: (activeJobId && status === 'running') ? 'not-allowed' : 'pointer', fontWeight: 600,
                                    borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                                }}
                            >
                                {activeJobId && status === 'running' ? (
                                    <><span>Running...</span></>
                                ) : (
                                    <><span>▶ Start Optimization</span></>
                                )}
                            </button>
                        </div>
                    )
                )}
                </div>
            </div>
            {/* Logs Pane */}
            <div style={{flex: 1, display: 'flex', flexDirection: 'column', background: THEME.bg}}>
                 {/* Parameters Pane */}
                 <div style={{borderBottom: `1px solid ${THEME.border}`, background: THEME.bg}}>
                     <div style={{
                         padding: '8px 16px',
                         borderBottom: `1px solid ${THEME.border}`,
                         background: THEME.activityBar,
                         display: 'flex',
                         justifyContent: 'space-between',
                         alignItems: 'center',
                         minHeight: 40,
                     }}>
                         <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                             <span style={{fontWeight: 600, fontSize: 12, color: THEME.textSecondary}}>PARAMETERS</span>
                             <span style={{fontSize: 11, color: THEME.textSecondary}}>Detected: {analysis?.parameters?.length || 0}</span>
                         </div>
                         <button
                             type="button"
                             onClick={() => void applyParamEdits()}
                             disabled={!strategyName || applyBusy || !analysis?.parameters?.length}
                             style={{
                                 padding: '6px 10px',
                                 background: applyBusy ? THEME.activityBar : THEME.accent,
                                 color: THEME.text,
                                 border: 'none',
                                 cursor: (!strategyName || applyBusy || !analysis?.parameters?.length) ? 'not-allowed' : 'pointer',
                                 fontWeight: 600,
                                 borderRadius: 2,
                                 fontSize: 12,
                             }}
                         >
                             {applyBusy ? 'Applying…' : 'Apply to strategy file'}
                         </button>
                     </div>

                     <div style={{padding: 16}}>
                         {!strategyName ? (
                             <div style={{color: THEME.textSecondary, fontSize: 13, fontStyle: 'italic'}}>Select a strategy file to view parameters.</div>
                         ) : loading ? (
                             <div style={{color: THEME.textSecondary}}>Analyzing {strategyName}...</div>
                         ) : !analysis?.parameters?.length ? (
                             <div style={{fontSize: 12, color: THEME.textSecondary}}>No Hyperopt parameters detected in the strategy.</div>
                         ) : (
                             <div style={{display: 'grid', gap: 10}}>
                                 {(analysis?.parameters || []).map((p: any) => {
                                     const d = paramDrafts[p.name] || p
                                     const isNumeric = ['Int', 'Decimal', 'Real'].includes(String(p.type))
                                     return (
                                         <div key={p.name} style={{border: `1px solid ${THEME.border}`, borderRadius: 4, padding: 10}}>
                                             <div style={{display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline'}}>
                                                 <div style={{fontWeight: 600, fontSize: 12, color: THEME.text}}>{p.name}</div>
                                                 <div style={{fontSize: 11, color: THEME.textSecondary, fontFamily: 'monospace'}}>{p.type}</div>
                                             </div>

                                             <div style={{display: 'grid', gridTemplateColumns: isNumeric ? '1fr 1fr' : '1fr', gap: 8, marginTop: 10}}>
                                                 {isNumeric ? (
                                                     <>
                                                         <label style={{display: 'grid', gap: 4, fontSize: 11, color: THEME.textSecondary}}>
                                                             min
                                                             <input
                                                                 value={d.min ?? ''}
                                                                 onChange={(e) => {
                                                                     const v = e.target.value
                                                                     const n = v.trim() === '' ? null : Number(v)
                                                                     setDraft(p.name, { min: Number.isFinite(n as any) ? n : null })
                                                                 }}
                                                                 style={{background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '6px 8px', borderRadius: 2, fontFamily: 'monospace'}}
                                                             />
                                                         </label>
                                                         <label style={{display: 'grid', gap: 4, fontSize: 11, color: THEME.textSecondary}}>
                                                             max
                                                             <input
                                                                 value={d.max ?? ''}
                                                                 onChange={(e) => {
                                                                     const v = e.target.value
                                                                     const n = v.trim() === '' ? null : Number(v)
                                                                     setDraft(p.name, { max: Number.isFinite(n as any) ? n : null })
                                                                 }}
                                                                 style={{background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '6px 8px', borderRadius: 2, fontFamily: 'monospace'}}
                                                             />
                                                         </label>
                                                     </>
                                                 ) : null}

                                                 <label style={{display: 'grid', gap: 4, fontSize: 11, color: THEME.textSecondary}}>
                                                     default
                                                     <input
                                                         value={d.default ?? ''}
                                                         onChange={(e) => {
                                                             const raw = e.target.value
                                                             if (raw.trim() === '') {
                                                                 setDraft(p.name, { default: null })
                                                                 return
                                                             }
                                                             if (String(p.type) === 'Int') {
                                                                 const n = parseInt(raw, 10)
                                                                 setDraft(p.name, { default: Number.isFinite(n) ? n : null })
                                                                 return
                                                             }
                                                             if (String(p.type) === 'Decimal' || String(p.type) === 'Real') {
                                                                 const n = Number(raw)
                                                                 setDraft(p.name, { default: Number.isFinite(n) ? n : null })
                                                                 return
                                                             }
                                                             if (String(p.type) === 'Boolean') {
                                                                 const v = raw.toLowerCase()
                                                                 setDraft(p.name, { default: v === 'true' ? true : v === 'false' ? false : raw })
                                                                 return
                                                             }
                                                             setDraft(p.name, { default: raw })
                                                         }}
                                                         style={{background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '6px 8px', borderRadius: 2, fontFamily: 'monospace'}}
                                                         placeholder={String(p.default ?? '')}
                                                     />
                                                 </label>

                                                 <label style={{display: 'grid', gap: 4, fontSize: 11, color: THEME.textSecondary}}>
                                                     space
                                                     <input
                                                         value={d.space ?? ''}
                                                         onChange={(e) => setDraft(p.name, { space: e.target.value })}
                                                         style={{background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '6px 8px', borderRadius: 2, fontFamily: 'monospace'}}
                                                         placeholder={String(p.space ?? '')}
                                                     />
                                                 </label>

                                                                                                 <label style={{display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: THEME.textSecondary}}>
                                                                                                     <input
                                                                                                         type="checkbox"
                                                                                                         checked={d.optimize !== false}
                                                                                                         onChange={(e) => setDraft(p.name, { optimize: e.target.checked })}
                                                                                                         style={{accentColor: THEME.accent}}
                                                                                                     />
                                                                                                     optimize
                                                                                                 </label>
                                             </div>
                                         </div>
                                     )
                                 })}

                                 {applyMsg ? <div style={{fontSize: 12, color: THEME.textSecondary}}>{applyMsg}</div> : null}
                             </div>
                         )}
                     </div>
                 </div>

                 <div style={{
                     padding: '8px 16px', borderBottom: `1px solid ${THEME.border}`, background: THEME.activityBar,
                     display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 40
                 }}>
                    <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                        <span style={{fontWeight: 600, fontSize: 12, color: THEME.textSecondary}}>EXECUTION LOG</span>
                        {status && activeJobId && (
                            <span style={{
                                fontSize: 10, padding: '2px 6px', borderRadius: 2, fontWeight: 'bold',
                                background: status === 'running' ? THEME.accent : (status === 'completed' ? THEME.success : THEME.error),
                                color: THEME.text
                            }}>
                                {status.toUpperCase()}
                            </span>
                        )}
                    </div>
                    {activeJobId && <div style={{fontSize: 11, color: THEME.textSecondary, fontFamily: 'monospace'}}>JOB: {activeJobId.split('-')[0]}...</div>}
                 </div>
                 <div ref={logRef} style={{flex: 1, padding: 16, overflowY: 'auto', fontFamily: "'Consolas', 'Monaco', monospace", fontSize: 13, color: THEME.text, lineHeight: 1.5}}>
                    {!activeJobId ? (
                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: THEME.textSecondary, flexDirection: 'column', gap: 10}}>
                            <div style={{fontSize: 40, opacity: 0.2}}>⚡</div>
                            <div>Configure parameters and start optimization to see logs.</div>
                        </div>
                    ) : (
                        logs.map((l, i) => <div key={i} style={{whiteSpace: 'pre-wrap', wordBreak: 'break-all'}}>{l}</div>)
                    )}
                 </div>
            </div>
        </div>
        </div>
    )
}

export type UniversalEditorProps = {
  scope?: string
  id?: string
  initialPath?: string
  onClose?: () => void
  embedded?: boolean
}

export function UniversalEditor({ scope: paramScope, id: paramId, initialPath: paramPath, onClose, embedded }: UniversalEditorProps) {
  const navigate = useNavigate()
  
  
  const [showHyperoptWizard, setShowHyperoptWizard] = useState(false)
  const [hyperoptJobId, setHyperoptJobId] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<'editor' | 'hyperopt' | 'backtest' | 'deploy'>('editor')

    // --- DEPLOY WIZARD (Advanced Config Editor flow) ---
    const showDeployWizard = !paramScope && !paramId
    const [deployWizardStep, setDeployWizardStep] = useState<1 | 2 | 3>(1)
    const [wizardStrategyId, setWizardStrategyId] = useState<string>('')
    const [wizardModelId, setWizardModelId] = useState<string>('')
    const [wizardStrategyConfigs, setWizardStrategyConfigs] = useState<api.ConfigFile[]>([])
    const [wizardModelConfigs, setWizardModelConfigs] = useState<api.ConfigFile[]>([])
    const [wizardStrategyConfigId, setWizardStrategyConfigId] = useState<string>('')
    const [wizardModelConfigId, setWizardModelConfigId] = useState<string>('')
    const [wizardPairs, setWizardPairs] = useState<string[]>([])
    const [wizardPairsQuery, setWizardPairsQuery] = useState<string>('')
    const [wizardPairsList, setWizardPairsList] = useState<PairInfo[]>([])
    const [wizardPairsBusy, setWizardPairsBusy] = useState(false)
    const [wizardPairsSource, setWizardPairsSource] = useState<'map' | 'discover'>('discover')
    const [wizardExchange, setWizardExchange] = useState<string>('binance')
    const [wizardMarketKind, setWizardMarketKind] = useState<'spot' | 'perp'>('spot')
    const [wizardQuote, setWizardQuote] = useState<string>('USDT')
    const [wizardExchanges, setWizardExchanges] = useState<MarketExchangeInfo[]>([])
    const [wizardHyperoptAlignmentId, setWizardHyperoptAlignmentId] = useState<string | null>(null)
    const [wizardBusy, setWizardBusy] = useState(false)
    const [wizardError, setWizardError] = useState<string | null>(null)
    const [wizardStrategyName, setWizardStrategyName] = useState<string | null>(null)

  // --- DATA LISTS ---
  const [strategies, setStrategies] = useState<StrategyTemplate[]>([])
  const [models, setModels] = useState<FreqAIModelVariant[]>([])
  const [alignments, setAlignments] = useState<StrategyAlignment[]>([])

  // --- UI STATE ---
  const [activeTab, setActiveTab] = useState<'strategies' | 'models' | 'alignments'>('strategies')
  const [filesExpanded, setFilesExpanded] = useState(true)
  const [chatExpanded, setChatExpanded] = useState(true)
  const [promptsExpanded, setPromptsExpanded] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set()) // folders expanded
  
  // --- EDITOR STATE ---
  const [activeFile, setActiveFile] = useState<{
     id: string // unique ID for the file node
     ownerId: string
     scope: Scope
     path: string
     name: string
     type: FileType
  } | null>(null)

  const [editorContent, setEditorContent] = useState('')
  const [editorLoading, setEditorLoading] = useState(false)
  const [editorDirty, setEditorDirty] = useState(false)
  const [saving, setSaving] = useState(false)

    // --- CONFIG (DB) STATE ---
    const [loadedConfigId, setLoadedConfigId] = useState<string | null>(null)
    const [configBusy, setConfigBusy] = useState(false)
    const [configError, setConfigError] = useState<string | null>(null)
    const [configMessage, setConfigMessage] = useState<string | null>(null)

    // --- BACKTEST UI STATE ---
    const [backtestTimerange, setBacktestTimerange] = useState<string>('20240101-')
    const [backtestTimeframe, setBacktestTimeframe] = useState<string>('5m')
    const [backtestIncludeTimeframes, setBacktestIncludeTimeframes] = useState<string[]>(['5m', '15m', '1h'])
    const [backtestTimeframeDetail, setBacktestTimeframeDetail] = useState<string>('')
    const [backtestPairsOverride, setBacktestPairsOverride] = useState<string>('')
    const [backtestStakeAmount, setBacktestStakeAmount] = useState<string>('')
    const [backtestMaxOpenTrades, setBacktestMaxOpenTrades] = useState<string>('')
    const [backtestFee, setBacktestFee] = useState<string>('')
    const [backtestDryRunWallet, setBacktestDryRunWallet] = useState<string>('')
    const [backtestEps, setBacktestEps] = useState<boolean>(false)
    const [backtestEnableProtections, setBacktestEnableProtections] = useState<boolean>(false)
    const [backtestEnableDynamicPairlist, setBacktestEnableDynamicPairlist] = useState<boolean>(false)
    const [backtestExport, setBacktestExport] = useState<string>('')
    const [backtestBreakdown, setBacktestBreakdown] = useState<string>('')
    const [backtestCache, setBacktestCache] = useState<string>('')
    const [backtestFreqaiLiveModels, setBacktestFreqaiLiveModels] = useState<boolean>(false)
    const [backtestNotes, setBacktestNotes] = useState<string>('')
    const [backtestDataFormatOHLCV, setBacktestDataFormatOHLCV] = useState<string>('')
    const [backtestBusy, setBacktestBusy] = useState(false)
    const [backtestError, setBacktestError] = useState<string | null>(null)
    const [backtestResult, setBacktestResult] = useState<any>(null)

    // --- DEPLOY UI STATE ---
    const [deployBusy, setDeployBusy] = useState(false)
    const [deployError, setDeployError] = useState<string | null>(null)
    const [deployResult, setDeployResult] = useState<any>(null)

  // --- AI SETTINGS ---
  const [aiSettings, setAiSettings] = useState<{ ai_provider: string | null; openrouter_model_id: string | null; has_ai_token: boolean } | null>(null)
  const [chatBusy, setChatBusy] = useState(false)

  // --- AI STATE ---
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant', content: string }[]>([
     { role: 'assistant', content: 'Select a file to start editing. I can analyze code and suggest configs.' }
  ])
  const [chatInput, setChatInput] = useState('')
  const [prompts] = useState([
     'Explain this code',
     'Find bugs',
     'Optimize parameters',
     'Generate config.json'
  ])

    const hyperoptStrategyName = useMemo(() => {
        // 1) If user opened a strategy .py file
        if (activeFile?.scope === 'strategy' && activeFile.type === 'python') {
            const name = (activeFile.name || '').replace(/\.py$/i, '').trim()
            return name || null
        }

        // 2) If user opened config.json (alignment/model) and it has `strategy`
        if (activeFile?.type === 'json') {
            try {
                const parsed = JSON.parse(editorContent || '{}') as any
                const name = typeof parsed?.strategy === 'string' ? parsed.strategy.trim() : ''
                return name || null
            } catch {
                return null
            }
        }

        return null
    }, [activeFile, editorContent])

    const effectiveHyperoptStrategyName = useMemo(() => {
        const fromWizard = (wizardStrategyName || '').trim()
        if (fromWizard) return fromWizard
        return hyperoptStrategyName
    }, [wizardStrategyName, hyperoptStrategyName])

    useEffect(() => {
        // If user navigated into a scoped editor, stop using the wizard-selected strategy.
        if (paramScope || paramId) setWizardStrategyName(null)
    }, [paramScope, paramId])

    const showCloseButton = !embedded || !!onClose

    const topMenuButtonStyle: React.CSSProperties = {
        padding: '6px 10px',
        borderRadius: 8,
        border: `1px solid ${THEME.border}`,
        background: THEME.sidebar,
        color: THEME.text,
        cursor: 'pointer',
        fontSize: 12,
        lineHeight: 1,
        whiteSpace: 'nowrap',
    }

  // --- INITIAL LOAD ---
  useEffect(() => { loadData(); loadAiSettings() }, [])


  async function loadAiSettings() {
      try {
          // @ts-ignore
          const s = await http<{ ai_provider: string | null; openrouter_model_id: string | null; has_ai_token: boolean }>('/auth/me/settings')
          setAiSettings(s)
      } catch (e) { console.error('Failed to load AI settings', e) }
  }
  async function loadData() {
    try {
      const [s, m, a] = await Promise.all([
        api.listStrategyTemplates(),
        api.listFreqAIModelVariants(),
        api.listStrategyAlignments()
      ])
      setStrategies(s)
      setModels(m)
      setAlignments(a)
    } catch (e) { console.error(e) }
  }

    const wizardStrategy = useMemo(() => {
      return strategies.find(s => s.strategy_id === wizardStrategyId) || null
  }, [strategies, wizardStrategyId])

  const wizardModel = useMemo(() => {
      return models.find(m => m.model_id === wizardModelId) || null
  }, [models, wizardModelId])

    const [wizardStrategyQuery, setWizardStrategyQuery] = useState('')
    const [wizardModelQuery, setWizardModelQuery] = useState('')
    const [wizardTimerange, setWizardTimerange] = useState<string>('20240101-')
    const [wizardTimeframe, setWizardTimeframe] = useState<string>('5m')
    const [wizardIncludeTimeframes, setWizardIncludeTimeframes] = useState<string[]>(['5m', '15m', '1h'])
    const [wizardBacktestTimeframeDetail, setWizardBacktestTimeframeDetail] = useState<string>('')
    const [wizardBacktestStakeAmount, setWizardBacktestStakeAmount] = useState<string>('')
    const [wizardBacktestMaxOpenTrades, setWizardBacktestMaxOpenTrades] = useState<string>('')
    const [wizardBacktestFee, setWizardBacktestFee] = useState<string>('')
    const [wizardBacktestDryRunWallet, setWizardBacktestDryRunWallet] = useState<string>('')
    const [wizardBacktestEps, setWizardBacktestEps] = useState<boolean>(false)
    const [wizardBacktestEnableProtections, setWizardBacktestEnableProtections] = useState<boolean>(false)
    const [wizardBacktestEnableDynamicPairlist, setWizardBacktestEnableDynamicPairlist] = useState<boolean>(false)
    const [wizardBacktestExport, setWizardBacktestExport] = useState<string>('')
    const [wizardBacktestBreakdown, setWizardBacktestBreakdown] = useState<string>('')
    const [wizardBacktestCache, setWizardBacktestCache] = useState<string>('')
    const [wizardBacktestNotes, setWizardBacktestNotes] = useState<string>('')
    const [wizardBacktestDataFormatOHLCV, setWizardBacktestDataFormatOHLCV] = useState<string>('')
    const [wizardTradingMode, setWizardTradingMode] = useState<'spot' | 'futures'>('spot')
    const [wizardMarginMode, setWizardMarginMode] = useState<string>('')
    const [wizardLeverage, setWizardLeverage] = useState<string>('')
    const [wizardHyperoptSpaces, setWizardHyperoptSpaces] = useState<string[]>(['buy', 'sell', 'roi', 'stoploss'])
    const [wizardHyperoptEpochs, setWizardHyperoptEpochs] = useState<number>(100)
    const [wizardHyperoptLoss, setWizardHyperoptLoss] = useState<string>('SharpeHyperOptLoss')
    const [wizardHyperoptDownloadData, setWizardHyperoptDownloadData] = useState<boolean>(true)
    const [wizardHyperoptJobWorkers, setWizardHyperoptJobWorkers] = useState<number>(1)
    const [wizardAiDirection, setWizardAiDirection] = useState<'long' | 'short' | 'both'>('long')
    const [wizardAiHorizon, setWizardAiHorizon] = useState<'scalp' | 'mid' | 'long'>('scalp')
    const [wizardAiRisk, setWizardAiRisk] = useState<'low' | 'balanced' | 'high'>('balanced')
    const [wizardAiPairsMode, setWizardAiPairsMode] = useState<'none' | 'top_volume'>('top_volume')
    const [wizardAiPairsLimit, setWizardAiPairsLimit] = useState<string>('20')
    const [wizardAiPairsMinVolumeQuote, setWizardAiPairsMinVolumeQuote] = useState<string>('')
    const [wizardAiPairsInclude, setWizardAiPairsInclude] = useState<string>('')
    const [wizardAiPairsExclude, setWizardAiPairsExclude] = useState<string>('')
    const [wizardAiBusy, setWizardAiBusy] = useState<boolean>(false)
    const [wizardAiMsg, setWizardAiMsg] = useState<string | null>(null)
    const [pendingBacktest, setPendingBacktest] = useState<{ alignmentId: string; timerange: string; timeframe?: string; includeTimeframes?: string[]; opts?: any } | null>(null)

    const wizardAiProfile = useMemo(() => {
        return `${wizardAiDirection}_${wizardAiHorizon}_${wizardAiRisk}`
    }, [wizardAiDirection, wizardAiHorizon, wizardAiRisk])

    useEffect(() => {
        if (!showDeployWizard) return
        if (wizardExchanges.length) return
        void (async () => {
            try {
                const res = await listExchanges()
                setWizardExchanges(res || [])
            } catch {
                // Non-fatal fallback
                setWizardExchanges([
                    { exchange: 'binance', kinds: ['spot', 'perp'] },
                    { exchange: 'bybit', kinds: ['spot', 'perp'] },
                    { exchange: 'okx', kinds: ['spot', 'perp'] },
                    { exchange: 'kraken', kinds: ['spot'] },
                    { exchange: 'coinbase', kinds: ['spot'] },
                ])
            }
        })()
    }, [showDeployWizard, wizardExchanges.length])

    useEffect(() => {
        // Keep config/trading mode in sync with pairs kind.
        if (wizardMarketKind === 'perp') {
            setWizardTradingMode('futures')
            if (!wizardMarginMode.trim()) setWizardMarginMode('isolated')
            if (!wizardLeverage.trim()) setWizardLeverage('5')
        } else {
            setWizardTradingMode('spot')
            setWizardMarginMode('')
            setWizardLeverage('')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wizardMarketKind])

    useEffect(() => {
        if (!showDeployWizard) return
        setWizardPairsBusy(true)
        void (async () => {
            try {
                const res = await listPairs({
                    source: wizardPairsSource,
                    exchange: wizardExchange,
                    kind: wizardMarketKind,
                    quote: wizardQuote,
                    limit: 2000,
                    offset: 0,
                })
                const next = res || []
                setWizardPairsList(next)

                // If discovery list is active, keep selection valid.
                if (wizardPairsSource === 'discover' && next.length) {
                    const avail = new Set(next.map((p) => String(p?.pair || '').trim()).filter(Boolean))
                    setWizardPairs((prev) => (prev || []).filter((p) => avail.has(p)))
                }
            } catch {
                // Non-fatal: pairs menu can remain empty
                setWizardPairsList([])
            } finally {
                setWizardPairsBusy(false)
            }
        })()
    }, [showDeployWizard, wizardPairsSource, wizardExchange, wizardMarketKind, wizardQuote])

    useEffect(() => {
        if (!wizardStrategyId) {
            setWizardStrategyConfigs([])
            setWizardStrategyConfigId('')
            return
        }
        setWizardError(null)
        setWizardBusy(true)
        void (async () => {
            try {
                const cfgs = await api.listConfigs('strategy', wizardStrategyId)
                setWizardStrategyConfigs(cfgs)
                const active = cfgs.find((c) => c.is_active)
                if (active) setWizardStrategyConfigId(active.config_id)
                else if (cfgs[0]) setWizardStrategyConfigId(cfgs[0].config_id)
            } catch (e: any) {
                setWizardStrategyConfigs([])
                setWizardStrategyConfigId('')
                setWizardError(e?.message || 'Failed to load strategy configs')
            } finally {
                setWizardBusy(false)
            }
        })()
    }, [wizardStrategyId])

    useEffect(() => {
        if (!wizardModelId) {
            setWizardModelConfigs([])
            setWizardModelConfigId('')
            return
        }
        setWizardError(null)
        setWizardBusy(true)
        void (async () => {
            try {
                const cfgs = await api.listConfigs('model', wizardModelId)
                setWizardModelConfigs(cfgs)
                const active = cfgs.find((c) => c.is_active)
                if (active) setWizardModelConfigId(active.config_id)
                else if (cfgs[0]) setWizardModelConfigId(cfgs[0].config_id)
            } catch (e: any) {
                setWizardModelConfigs([])
                setWizardModelConfigId('')
                setWizardError(e?.message || 'Failed to load model configs')
            } finally {
                setWizardBusy(false)
            }
        })()
    }, [wizardModelId])

  async function ensureAlignment(strategy_id: string, model_id: string): Promise<StrategyAlignment> {
      const existing = alignments.find(a => a.strategy_id === strategy_id && a.model_id === model_id)
      if (existing) return existing
      const created = await api.createStrategyAlignment({
          strategy_id,
          model_id,
          profile: null,
          scope: null,
          defaults: null,
          mapping: null,
          freqtrade_overrides: {},
          freqai_overrides: {},
          status: 'draft',
      })
      setAlignments(prev => [created as any, ...prev])
      return created as any
  }

    async function activateWizardConfig(config_id: string): Promise<void> {
        const id = (config_id || '').trim()
        if (!id) return
        setWizardBusy(true)
        setWizardError(null)
        try {
            await api.activateConfig(id)
        } catch (e: any) {
            setWizardError(e?.message || 'Failed to activate config')
        } finally {
            setWizardBusy(false)
        }
    }

    async function createDefaultStrategyConfig(): Promise<void> {
        if (!wizardStrategyId) return
        const s = wizardStrategy
        const strategyName = (s?.strategy_class || s?.slug || s?.name || '').toString().trim()
        if (!strategyName) {
            setWizardError('Select a strategy first')
            return
        }
        setWizardBusy(true)
        setWizardError(null)
        try {
            const cfg = await api.createConfig({
                scope: 'strategy',
                owner_id: wizardStrategyId,
                name: 'strategy-config.json',
                make_active: true,
                content: {
                    strategy: strategyName,
                    freqtrade: {},
                    freqai: {},
                },
            })
            const cfgs = await api.listConfigs('strategy', wizardStrategyId)
            setWizardStrategyConfigs(cfgs)
            setWizardStrategyConfigId(cfg.config_id)
        } catch (e: any) {
            setWizardError(e?.message || 'Failed to create strategy config')
        } finally {
            setWizardBusy(false)
        }
    }

    async function createDefaultModelConfig(): Promise<void> {
        if (!wizardModelId) return
        setWizardBusy(true)
        setWizardError(null)
        try {
            const cfg = await api.createConfig({
                scope: 'model',
                owner_id: wizardModelId,
                name: 'model-config.json',
                make_active: true,
                content: {
                    freqtrade: {},
                    freqai: {},
                },
            })
            const cfgs = await api.listConfigs('model', wizardModelId)
            setWizardModelConfigs(cfgs)
            setWizardModelConfigId(cfg.config_id)
        } catch (e: any) {
            setWizardError(e?.message || 'Failed to create model config')
        } finally {
            setWizardBusy(false)
        }
    }

    function withPairsOverrides(aln: StrategyAlignment, pairs: string[]): StrategyAlignment {
        const list = (pairs || []).map((p) => String(p).trim()).filter(Boolean)
        if (!list.length) return aln
        const existing = (aln.freqtrade_overrides || {}) as any
        const ex = (existing.exchange || {}) as any
        const nextEx = {
            ...ex,
            pair_whitelist: list,
        }

        const next: any = {
            ...aln,
            freqtrade_overrides: {
                ...existing,
                exchange: nextEx,
                // Ensure pairlists present when using explicit whitelist.
                pairlists: [{ method: 'StaticPairList' }],
            },
        }
        return next
    }

    function withExchangeModeOverrides(
        aln: StrategyAlignment,
        exchangeName: string,
        tradingMode: 'spot' | 'futures',
        marginMode: string,
        leverage: string,
    ): StrategyAlignment {
        const exName = String(exchangeName || '').trim()
        const mode = tradingMode === 'futures' ? 'futures' : 'spot'
        const margin = mode === 'futures' ? String(marginMode || '').trim() || 'isolated' : ''

        const existing = (aln.freqtrade_overrides || {}) as any
        const ex = (existing.exchange || {}) as any
        const nextEx: any = { ...ex }
        if (exName) nextEx.name = exName

        const nextFt: any = {
            ...existing,
            exchange: nextEx,
            trading_mode: mode,
            margin_mode: margin,
        }

        if (mode === 'futures') {
            const n = parseInt(String(leverage || '').trim(), 10)
            if (Number.isFinite(n) && n > 0) nextFt.leverage = n
        } else {
            if ('leverage' in nextFt) delete nextFt.leverage
        }

        return {
            ...aln,
            freqtrade_overrides: nextFt,
        }
    }

    function withTimeframeOverrides(aln: StrategyAlignment, timeframe: string, includeTfs: string[]): StrategyAlignment {
        const tf = (timeframe || '').trim()
        const include = (includeTfs || []).map((x) => String(x).trim()).filter(Boolean)

        let next: any = { ...aln }

        if (tf) {
            next.freqtrade_overrides = {
                ...(aln.freqtrade_overrides || {}),
                timeframe: tf,
            }
        }

        if (include.length) {
            const prevFreqai = (aln.freqai_overrides || {}) as any
            const fp = ((prevFreqai.feature_parameters as any) || {}) as any
            next.freqai_overrides = {
                ...prevFreqai,
                feature_parameters: {
                    ...fp,
                    include_timeframes: include,
                },
            }
        }

        return next
    }

    async function prepareWizardAlignmentForRun(): Promise<StrategyAlignment> {
        if (!wizardStrategyId || !wizardModelId) throw new Error('Select strategy and model')
        if (!wizardStrategyConfigId) throw new Error('Select a strategy config')
        if (!wizardModelConfigId) throw new Error('Select a model config')

        setWizardBusy(true)
        setWizardError(null)
        try {
            // Ensure selected configs are active (combined config requires active strategy+model configs).
            await Promise.all([api.activateConfig(wizardStrategyConfigId), api.activateConfig(wizardModelConfigId)])

            const aln = await ensureAlignment(wizardStrategyId, wizardModelId)
            let next = aln
            next = withPairsOverrides(next, wizardPairs)
            next = withExchangeModeOverrides(next, wizardExchange, wizardTradingMode, wizardMarginMode, wizardLeverage)
            next = withTimeframeOverrides(next, wizardTimeframe, wizardIncludeTimeframes)
            const updated = await api.updateStrategyAlignment(next as any)
            setAlignments((prev) => prev.map((x) => (x.alignment_id === updated.alignment_id ? (updated as any) : x)))
            return updated as any
        } finally {
            setWizardBusy(false)
        }
    }

    async function gotoWizardBacktest(runNow: boolean) {
        if (!wizardStrategyId || !wizardModelId) return
        setWizardBusy(true)
        setWizardError(null)
        try {
            const aln = await prepareWizardAlignmentForRun()
            const encoded = encodeURIComponent('virtual://config')
            if (runNow) {
                const opts: any = {}
                if (wizardTimeframe.trim()) opts.timeframe = wizardTimeframe.trim()
                if (wizardBacktestTimeframeDetail.trim()) opts.timeframe_detail = wizardBacktestTimeframeDetail.trim()
                if (wizardBacktestDataFormatOHLCV.trim()) opts.data_format_ohlcv = wizardBacktestDataFormatOHLCV.trim()
                if (wizardBacktestStakeAmount.trim()) opts.stake_amount = wizardBacktestStakeAmount.trim()
                if (wizardBacktestMaxOpenTrades.trim() && Number.isFinite(parseInt(wizardBacktestMaxOpenTrades.trim(), 10))) {
                    opts.max_open_trades = parseInt(wizardBacktestMaxOpenTrades.trim(), 10)
                }
                if (wizardBacktestFee.trim() && Number.isFinite(parseFloat(wizardBacktestFee.trim()))) opts.fee = parseFloat(wizardBacktestFee.trim())
                if (wizardBacktestDryRunWallet.trim() && Number.isFinite(parseFloat(wizardBacktestDryRunWallet.trim()))) opts.dry_run_wallet = parseFloat(wizardBacktestDryRunWallet.trim())
                if (wizardBacktestEps) opts.eps = true
                if (wizardBacktestEnableProtections) opts.enable_protections = true
                if (wizardBacktestEnableDynamicPairlist) opts.enable_dynamic_pairlist = true
                if (wizardBacktestExport.trim()) opts.export = wizardBacktestExport.trim()
                if (wizardBacktestBreakdown.trim()) opts.breakdown = wizardBacktestBreakdown.trim()
                if (wizardBacktestCache.trim()) opts.cache = wizardBacktestCache.trim()
                if (wizardBacktestNotes.trim()) opts.notes = wizardBacktestNotes.trim()
                setPendingBacktest({ alignmentId: aln.alignment_id, timerange: wizardTimerange, timeframe: wizardTimeframe, includeTimeframes: wizardIncludeTimeframes, opts })
            }
            navigate(`/strategylab/editor/alignment/${encodeURIComponent(aln.alignment_id)}/${encoded}`)
            setViewMode('backtest')
        } catch (e: any) {
            setWizardError(e?.message || 'Failed to prepare alignment for backtest')
        } finally {
            setWizardBusy(false)
        }
    }

    function applyWizardSuggestions(s: any) {
        if (!s || typeof s !== 'object') return

        // Exchange + market kind
        if (typeof s.exchange === 'string') {
            const ex = s.exchange.trim().toLowerCase()
            if (ex) setWizardExchange(ex)
        }
        if (typeof s.market_kind === 'string') {
            const k = s.market_kind.trim().toLowerCase()
            if (k === 'spot' || k === 'perp') setWizardMarketKind(k as any)
        }
        if (typeof s.margin_mode === 'string') {
            setWizardMarginMode(s.margin_mode.trim())
        }
        if (s.leverage != null) {
            setWizardLeverage(String(s.leverage))
        }

        // Timerange
        if (typeof s.timerange === 'string') {
            setWizardTimerange(s.timerange.trim())
        }

        // Timeframe & include timeframes
        if (typeof s.timeframe === 'string') {
            const tf = s.timeframe.trim()
            if (TIMEFRAME_OPTIONS.includes(tf)) setWizardTimeframe(tf)
        }
        if (Array.isArray(s.include_timeframes)) {
            const next = s.include_timeframes.map((x: any) => String(x).trim()).filter((x: string) => TIMEFRAME_OPTIONS.includes(x))
            if (next.length) setWizardIncludeTimeframes(Array.from(new Set(next)))
        }

        // Backtest advanced
        if (typeof s.timeframe_detail === 'string') {
            const td = s.timeframe_detail.trim()
            if (td === '' || TIMEFRAME_OPTIONS.includes(td)) setWizardBacktestTimeframeDetail(td)
        }
        if (s.stake_amount != null) setWizardBacktestStakeAmount(String(s.stake_amount))
        if (s.max_open_trades != null) setWizardBacktestMaxOpenTrades(String(s.max_open_trades))
        if (s.fee != null) setWizardBacktestFee(String(s.fee))
        if (s.dry_run_wallet != null) setWizardBacktestDryRunWallet(String(s.dry_run_wallet))
        if (typeof s.eps === 'boolean') setWizardBacktestEps(s.eps)
        if (typeof s.enable_protections === 'boolean') setWizardBacktestEnableProtections(s.enable_protections)
        if (typeof s.enable_dynamic_pairlist === 'boolean') setWizardBacktestEnableDynamicPairlist(s.enable_dynamic_pairlist)
        if (typeof s.export === 'string') setWizardBacktestExport(s.export.trim())
        if (typeof s.breakdown === 'string') setWizardBacktestBreakdown(s.breakdown.trim())
        if (typeof s.cache === 'string') setWizardBacktestCache(s.cache.trim())
        if (typeof s.notes === 'string') setWizardBacktestNotes(s.notes.trim())
        if (typeof s.data_format_ohlcv === 'string') setWizardBacktestDataFormatOHLCV(s.data_format_ohlcv.trim())

        // Hyperopt
        if (Array.isArray(s.hyperopt_spaces)) {
            const allowed = new Set(['buy', 'sell', 'roi', 'stoploss', 'trailing', 'protection'])
            const next = s.hyperopt_spaces.map((x: any) => String(x).trim()).filter((x: string) => allowed.has(x))
            if (next.length) setWizardHyperoptSpaces(Array.from(new Set(next)))
        }
        if (s.hyperopt_epochs != null && Number.isFinite(parseInt(String(s.hyperopt_epochs), 10))) {
            const n = parseInt(String(s.hyperopt_epochs), 10)
            if (n > 0) setWizardHyperoptEpochs(n)
        }
        if (typeof s.hyperopt_loss === 'string') {
            const loss = s.hyperopt_loss.trim()
            if (loss) setWizardHyperoptLoss(loss)
        }
        if (typeof s.hyperopt_download_data === 'boolean') setWizardHyperoptDownloadData(s.hyperopt_download_data)
        if (s.hyperopt_job_workers != null && Number.isFinite(parseInt(String(s.hyperopt_job_workers), 10))) {
            setWizardHyperoptJobWorkers(parseInt(String(s.hyperopt_job_workers), 10))
        }

        // Pairs (optional)
        if (Array.isArray(s.pairs)) {
            const rawPairs = s.pairs
                .map((p: any) => String(p || '').trim())
                .filter((p: string) => !!p)
                .slice(0, 30)

            if (rawPairs.length) {
                const mode = String(s.pairs_mode || '').trim().toLowerCase()
                const doReplace = mode === 'replace'

                // If we have a loaded pairs catalog, intersect to avoid invalid names.
                const available = wizardPairsList && wizardPairsList.length
                    ? new Set((wizardPairsList || []).map((x: any) => String(x?.pair || '').trim()).filter(Boolean))
                    : null

                const filtered = available ? rawPairs.filter((p: string) => available.has(p)) : rawPairs
                if (!filtered.length) return

                setWizardPairs((prev) => {
                    const current = Array.isArray(prev) ? prev : []
                    if (doReplace || current.length === 0) {
                        return Array.from(new Set(filtered))
                    }
                    return Array.from(new Set([...current, ...filtered]))
                })
            }
        }

        // Pair selection rules (optional)
        if (s.pairs_rule && typeof s.pairs_rule === 'object') {
            const r: any = s.pairs_rule
            if (typeof r.method === 'string') {
                const method = r.method.trim().toLowerCase()
                if (method === 'top_volume') setWizardAiPairsMode('top_volume')
                if (method === 'none') setWizardAiPairsMode('none')
            }
            if (r.limit != null) setWizardAiPairsLimit(String(r.limit))
            if (r.min_volume_quote != null) setWizardAiPairsMinVolumeQuote(String(r.min_volume_quote))
            if (typeof r.include === 'string') setWizardAiPairsInclude(r.include)
            if (typeof r.exclude === 'string') setWizardAiPairsExclude(r.exclude)

            try {
                const suggested = applyPairsRuleToList(
                    {
                        method: String(r.method || 'top_volume'),
                        limit: r.limit,
                        min_volume_quote: r.min_volume_quote,
                        include: r.include,
                        exclude: r.exclude,
                    },
                    wizardPairsList,
                    wizardMarketKind,
                )
                const mode = String(r.mode || 'append').trim().toLowerCase()
                const doReplace = mode === 'replace'
                if (suggested.length) {
                    setWizardPairs((prev) => {
                        const current = Array.isArray(prev) ? prev : []
                        if (doReplace || current.length === 0) return Array.from(new Set(suggested))
                        return Array.from(new Set([...current, ...suggested]))
                    })
                }
            } catch {
                // ignore
            }
        }
    }

    function applyPairsRuleToList(
        rule: {
            method: string
            limit?: any
            min_volume_quote?: any
            include?: any
            exclude?: any
        },
        list: PairInfo[],
        marketKind: 'spot' | 'perp',
    ): string[] {
        const method = String(rule.method || '').trim().toLowerCase()
        if (method !== 'top_volume') return []

        const limitRaw = parseInt(String(rule.limit ?? wizardAiPairsLimit ?? '20').trim(), 10)
        const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 20

        const minVolRaw = parseFloat(String(rule.min_volume_quote ?? wizardAiPairsMinVolumeQuote ?? '').trim())
        const minVol = Number.isFinite(minVolRaw) ? Math.max(0, minVolRaw) : null

        const includeS = String(rule.include ?? '').trim()
        const excludeS = String(rule.exclude ?? '').trim()

        let includeRe: RegExp | null = null
        let excludeRe: RegExp | null = null
        try {
            if (includeS) includeRe = new RegExp(includeS, 'i')
        } catch {
            includeRe = null
        }
        try {
            if (excludeS) excludeRe = new RegExp(excludeS, 'i')
        } catch {
            excludeRe = null
        }

        const kind = marketKind
        const rows = (list || [])
            .filter((p) => {
                const pair = String(p?.pair || '').trim()
                if (!pair) return false
                if (includeRe && !includeRe.test(pair)) return false
                if (excludeRe && excludeRe.test(pair)) return false
                if (Array.isArray((p as any)?.kinds) && (p as any).kinds.length) {
                    if (!(p as any).kinds.includes(kind)) return false
                }
                if (minVol != null) {
                    const v = Number((p as any)?.volume24hQuote || 0)
                    if (!(v >= minVol)) return false
                }
                return true
            })
            .slice()
            .sort((a, b) => Number((b as any)?.volume24hQuote || 0) - Number((a as any)?.volume24hQuote || 0))

        return rows.slice(0, limit).map((p) => String(p?.pair || '').trim()).filter(Boolean)
    }

    function localHeuristicForProfile(profile: string): any {
        const p = (profile || '').trim()
        // Backward-compatible aliases
        if (p === 'long_scalping') {
            return {
                timerange: timerangeLastDays(90),
                timeframe: '5m',
                include_timeframes: ['5m', '15m', '1h'],
                timeframe_detail: '1m',
                eps: true,
                enable_protections: false,
                hyperopt_spaces: ['buy', 'sell', 'roi', 'stoploss'],
                hyperopt_epochs: 250,
                hyperopt_loss: 'SharpeHyperOptLoss',
                hyperopt_download_data: true,
                hyperopt_job_workers: 1,
                pairs_rule: { method: 'top_volume', limit: 20, mode: 'replace' },
            }
        }
        if (p === 'short_scalping') {
            return {
                timerange: timerangeLastDays(30),
                timeframe: '1m',
                include_timeframes: ['1m', '5m', '15m'],
                timeframe_detail: '1m',
                eps: true,
                enable_protections: false,
                hyperopt_spaces: ['buy', 'sell', 'roi', 'stoploss'],
                hyperopt_epochs: 200,
                hyperopt_loss: 'SharpeHyperOptLoss',
                hyperopt_download_data: true,
                hyperopt_job_workers: 1,
                pairs_rule: { method: 'top_volume', limit: 20, mode: 'replace' },
            }
        }
        if (p === 'mid_term') {
            return {
                timerange: timerangeLastDays(180),
                timeframe: '15m',
                include_timeframes: ['15m', '1h', '4h'],
                timeframe_detail: '5m',
                enable_protections: true,
                hyperopt_spaces: ['buy', 'sell', 'roi', 'stoploss', 'protection'],
                hyperopt_epochs: 300,
                hyperopt_loss: 'SharpeHyperOptLoss',
                hyperopt_download_data: true,
                hyperopt_job_workers: 1,
                pairs_rule: { method: 'top_volume', limit: 15, mode: 'replace' },
            }
        }
        if (p === 'long_term') {
            return {
                timerange: timerangeLastDays(365),
                timeframe: '1h',
                include_timeframes: ['1h', '4h', '1d'],
                timeframe_detail: '15m',
                enable_protections: true,
                hyperopt_spaces: ['buy', 'sell', 'roi', 'stoploss', 'protection'],
                hyperopt_epochs: 400,
                hyperopt_loss: 'SharpeHyperOptLoss',
                hyperopt_download_data: true,
                hyperopt_job_workers: 1,
                pairs_rule: { method: 'top_volume', limit: 10, mode: 'replace' },
            }
        }

        // Composite profile: direction_horizon_risk (e.g. long_scalp_balanced)
        const parts = p.split('_').map((x) => x.trim()).filter(Boolean)
        const direction = (parts[0] as any) || 'long'
        const horizon = (parts[1] as any) || 'scalp'
        const risk = (parts[2] as any) || 'balanced'

        const days = horizon === 'long' ? 365 : horizon === 'mid' ? 180 : 60
        const baseTf = horizon === 'long' ? '1h' : horizon === 'mid' ? '15m' : '5m'
        const detailTf = horizon === 'long' ? '15m' : horizon === 'mid' ? '5m' : '1m'
        const include = horizon === 'long' ? ['1h', '4h', '1d'] : horizon === 'mid' ? ['15m', '1h', '4h'] : ['5m', '15m', '1h']

        const pairsLimit = risk === 'low' ? 10 : risk === 'high' ? 25 : 20

        const out: any = {
            timerange: timerangeLastDays(days),
            timeframe: baseTf,
            include_timeframes: include,
            timeframe_detail: detailTf,
            enable_protections: risk !== 'high',
            hyperopt_spaces: ['buy', 'sell', 'roi', 'stoploss', ...(risk === 'low' ? ['protection'] : [])],
            hyperopt_epochs: horizon === 'long' ? 400 : horizon === 'mid' ? 300 : 250,
            hyperopt_loss: 'SharpeHyperOptLoss',
            hyperopt_download_data: true,
            hyperopt_job_workers: 1,
            pairs_rule: { method: 'top_volume', limit: pairsLimit, mode: 'replace' },
        }

        if (direction === 'short' && horizon === 'scalp') {
            out.timeframe = '1m'
            out.include_timeframes = ['1m', '5m', '15m']
            out.timeframe_detail = '1m'
            out.eps = true
        }

        return out
    }

    async function wizardAiAutofill() {
        if (wizardAiBusy) return
        setWizardAiBusy(true)
        setWizardAiMsg(null)
        try {
            let aiRawContent = ''
            const context = {
                profile: wizardAiProfile,
                characteristics: {
                    direction: wizardAiDirection,
                    horizon: wizardAiHorizon,
                    risk: wizardAiRisk,
                    pairs_mode: wizardAiPairsMode,
                    pairs_limit: wizardAiPairsLimit,
                    pairs_min_volume_quote: wizardAiPairsMinVolumeQuote,
                    pairs_include: wizardAiPairsInclude,
                    pairs_exclude: wizardAiPairsExclude,
                },
                pairs_count: wizardPairs.length,
                selected_pairs_sample: wizardPairs.slice(0, 12),
                available_pairs_sample: (wizardPairsList || []).slice(0, 80).map((p: any) => p?.pair).filter(Boolean),
                exchange: wizardExchange,
                market_kind: wizardMarketKind,
                exchanges: (wizardExchanges || []).slice(0, 20),
                current: {
                    timerange: wizardTimerange,
                    timeframe: wizardTimeframe,
                    include_timeframes: wizardIncludeTimeframes,
                    exchange: wizardExchange,
                    market_kind: wizardMarketKind,
                    margin_mode: wizardMarginMode,
                    leverage: wizardLeverage,
                    backtest: {
                        timeframe_detail: wizardBacktestTimeframeDetail,
                        stake_amount: wizardBacktestStakeAmount,
                        max_open_trades: wizardBacktestMaxOpenTrades,
                        fee: wizardBacktestFee,
                        dry_run_wallet: wizardBacktestDryRunWallet,
                        eps: wizardBacktestEps,
                        enable_protections: wizardBacktestEnableProtections,
                        enable_dynamic_pairlist: wizardBacktestEnableDynamicPairlist,
                        export: wizardBacktestExport,
                        breakdown: wizardBacktestBreakdown,
                        cache: wizardBacktestCache,
                        notes: wizardBacktestNotes,
                        data_format_ohlcv: wizardBacktestDataFormatOHLCV,
                    },
                    hyperopt: {
                        spaces: wizardHyperoptSpaces,
                        epochs: wizardHyperoptEpochs,
                        loss: wizardHyperoptLoss,
                        download_data: wizardHyperoptDownloadData,
                        job_workers: wizardHyperoptJobWorkers,
                    },
                },
            }

            const sys =
                'You are an expert Freqtrade/FreqAI tuning agent. Return ONLY a single JSON object (no markdown) with suggested run settings for StrategyLab Deploy Wizard step 3.' +
                ' The JSON schema:\n' +
                '{\n' +
                '  "exchange": optional exchange name (e.g. "binance", "bybit", "okx"),\n' +
                '  "market_kind": optional "spot" or "perp",\n' +
                '  "margin_mode": optional string (for futures, e.g. "isolated" or "cross"),\n' +
                '  "leverage": optional integer,\n' +
                '  "pairs": optional array of normalized pairs (e.g. "BTC/USDT"), max 30,\n' +
                '  "pairs_mode": optional "append" or "replace" (default: append),\n' +
                '  "pairs_rule": optional object {"method":"top_volume","limit":integer,"min_volume_quote":number,"include":string,"exclude":string,"mode":"append|replace"},\n' +
                '  "timerange": "YYYYMMDD-YYYYMMDD" or "YYYYMMDD-",\n' +
                '  "timeframe": one of ' + JSON.stringify(TIMEFRAME_OPTIONS) + ',\n' +
                '  "include_timeframes": array of timeframes from that list,\n' +
                '  "timeframe_detail": optional timeframe from list or "",\n' +
                '  "stake_amount": optional string/number,\n' +
                '  "max_open_trades": optional integer,\n' +
                '  "fee": optional float,\n' +
                '  "dry_run_wallet": optional float,\n' +
                '  "eps": optional boolean,\n' +
                '  "enable_protections": optional boolean,\n' +
                '  "enable_dynamic_pairlist": optional boolean,\n' +
                '  "export": optional string,\n' +
                '  "breakdown": optional string,\n' +
                '  "cache": optional string,\n' +
                '  "notes": optional string,\n' +
                '  "data_format_ohlcv": optional string,\n' +
                '  "hyperopt_spaces": array of ["buy","sell","roi","stoploss","trailing","protection"],\n' +
                '  "hyperopt_epochs": integer,\n' +
                '  "hyperopt_loss": string,\n' +
                '  "hyperopt_download_data": boolean,\n' +
                '  "hyperopt_job_workers": integer\n' +
                '}'

            const res = await http<{ content: string }>('/ai/chat', {
                method: 'POST',
                body: JSON.stringify({
                    provider: (aiSettings?.ai_provider || 'local') as any,
                    model: aiSettings?.ai_provider === 'openrouter' ? (aiSettings?.openrouter_model_id || null) : null,
                    ...(aiSettings?.ai_provider === 'openrouter' || aiSettings?.ai_provider === 'openai'
                        ? { response_format: { type: 'json_object' } }
                        : {}),
                    messages: [
                        { role: 'system', content: sys },
                        { role: 'user', content: JSON.stringify(context) },
                    ],
                    max_tokens: 700,
                    temperature: 0.2,
                }),
            })

            aiRawContent = String(res?.content || '')
            const obj = extractJsonObject(aiRawContent)
            if (!obj) {
                const preview = aiRawContent.replace(/\s+/g, ' ').trim().slice(0, 240)
                throw new Error(`AI returned invalid JSON. Preview: ${preview || '(empty)'}`)
            }
            applyWizardSuggestions(obj)
            setWizardAiMsg('✅ Applied AI suggestions')
        } catch (e: any) {
            // Fallback heuristic so the feature still works without a token/provider.
            const fallback = localHeuristicForProfile(wizardAiProfile)
            applyWizardSuggestions(fallback)
            const provider = (aiSettings?.ai_provider || 'local') as any
            const reason = (e && typeof e?.message === 'string' && e.message.trim()) ? e.message.trim() : 'unknown error'
            let hint = ''
            if (/Missing AI provider token/i.test(reason)) {
                hint = ' Set token in Settings → Account (AI Provider).'
            } else if (/Missing AI model/i.test(reason)) {
                hint = ' Select a model in Settings → Account.'
            } else if (/Local AI provider is not configured/i.test(reason)) {
                hint = ' Configure local AI in backend env or switch provider in Settings → Account.'
            } else if (/No cookie auth credentials found|Invalid (API )?key|Unauthorized|\b401\b/i.test(reason)) {
                hint = ' Check your OpenRouter API key in Settings → Account (paste the raw key, without "Bearer ").'
            }
            setWizardAiMsg(`⚠️ AI unavailable (${provider}): ${reason}. Applied preset: ${wizardAiProfile}.${hint}`)
        } finally {
            setWizardAiBusy(false)
        }
    }

    function gotoWizardHyperopt(runNow: boolean) {
        const s = wizardStrategy
        const name = (s?.strategy_class || s?.name || s?.slug || '').toString().trim()
        if (!name) {
            setWizardError('Select a strategy first')
            return
        }
        if (!wizardStrategyConfigId || !wizardModelConfigId) {
            setWizardError('Select strategy+model configs first')
            return
        }
        setWizardError(null)
        setWizardStrategyName(name)
        if (runNow) {
            void (async () => {
                try {
                    const aln = await prepareWizardAlignmentForRun()
                    setWizardHyperoptAlignmentId(aln.alignment_id)
                    await startHyperoptFromWizard({
                        spaces: wizardHyperoptSpaces,
                        epochs: wizardHyperoptEpochs,
                        timerange: wizardTimerange,
                        hyperopt_loss: wizardHyperoptLoss,
                        download_data: wizardHyperoptDownloadData,
                        job_workers: wizardHyperoptJobWorkers,
                    })
                } catch (e: any) {
                    setWizardError(e?.message || 'Failed to prepare alignment for hyperopt')
                }
            })()
        }
        setViewMode('hyperopt')
    }

    useEffect(() => {
        if (!pendingBacktest) return
        if (!activeFile) return
        if (activeFile.scope !== 'alignment') return
        if (activeFile.ownerId !== pendingBacktest.alignmentId) return
        if (viewMode !== 'backtest') return

        // Auto-run once after navigation into the alignment editor.
        const tr = (pendingBacktest.timerange || '').trim()
        const tfForRun = (pendingBacktest.timeframe || backtestTimeframe || '').trim()
        const wizardOpts = (pendingBacktest.opts && typeof pendingBacktest.opts === 'object') ? pendingBacktest.opts : null
        if (tr) setBacktestTimerange(tr)
        if (pendingBacktest.timeframe) setBacktestTimeframe(pendingBacktest.timeframe)
        if (pendingBacktest.includeTimeframes?.length) setBacktestIncludeTimeframes(pendingBacktest.includeTimeframes)
        if (wizardOpts) {
            if (typeof wizardOpts.timeframe_detail === 'string') setBacktestTimeframeDetail(wizardOpts.timeframe_detail)
            if (typeof wizardOpts.data_format_ohlcv === 'string') setBacktestDataFormatOHLCV(wizardOpts.data_format_ohlcv)
            if (wizardOpts.stake_amount != null) setBacktestStakeAmount(String(wizardOpts.stake_amount))
            if (wizardOpts.max_open_trades != null) setBacktestMaxOpenTrades(String(wizardOpts.max_open_trades))
            if (wizardOpts.fee != null) setBacktestFee(String(wizardOpts.fee))
            if (wizardOpts.dry_run_wallet != null) setBacktestDryRunWallet(String(wizardOpts.dry_run_wallet))
            setBacktestEps(!!wizardOpts.eps)
            setBacktestEnableProtections(!!wizardOpts.enable_protections)
            setBacktestEnableDynamicPairlist(!!wizardOpts.enable_dynamic_pairlist)
            if (typeof wizardOpts.export === 'string') setBacktestExport(wizardOpts.export)
            if (typeof wizardOpts.breakdown === 'string') setBacktestBreakdown(wizardOpts.breakdown)
            if (typeof wizardOpts.cache === 'string') setBacktestCache(wizardOpts.cache)
            if (typeof wizardOpts.notes === 'string') setBacktestNotes(wizardOpts.notes)
        }
        setPendingBacktest(null)
        void (async () => {
            try {
                setBacktestBusy(true)
                setBacktestError(null)
                setBacktestResult(null)

                const opts: any = wizardOpts ? { ...wizardOpts } : {}
                if (tfForRun) opts.timeframe = tfForRun
                // Note: wizard already configures pairs via alignment overrides; keep optional pairs override from Backtest tab.
                const pairs = (backtestPairsOverride || '')
                    .split(/[\s,]+/g)
                    .map((p) => p.trim())
                    .filter(Boolean)
                if (pairs.length) opts.pairs = pairs

                const qp = new URLSearchParams()
                if (tr) qp.set('timerange', tr)
                const url = `/strategylab/alignments/${encodeURIComponent(activeFile.ownerId)}/backtest?${qp.toString()}`
                const hasBody = Object.keys(opts).length > 0
                const res = await http<any>(url, { method: 'POST', ...(hasBody ? { body: JSON.stringify(opts) } : {}) })
                setBacktestResult(res)
            } catch (e: any) {
                setBacktestError(e?.message || 'Backtest failed')
            } finally {
                setBacktestBusy(false)
            }
        })()
    }, [pendingBacktest, activeFile, viewMode])

  // Handle params on mount or change
  useEffect(() => {
     if (paramId && paramScope) {
        if (paramScope === 'strategy') setActiveTab('strategies')
        if (paramScope === 'model') setActiveTab('models')
        if (paramScope === 'alignment') setActiveTab('alignments')
        
        if (paramPath) {
             const path = paramPath
             setActiveFile({
                 id: `${paramScope}-${paramId}-${path}`,
                 ownerId: paramId,
                 scope: paramScope as Scope,
                 path: path,
                 name: path.split('/').pop() || path,
                 type: path.endsWith('.json') ? 'json' : 'python'
             })
        }
     }
  }, [paramId, paramScope, paramPath]) 

  // --- LOAD EDITOR CONTENT ---
  useEffect(() => {
     if (!activeFile) {
         setEditorContent('')
         return
     }
     loadContent(activeFile)
  }, [activeFile])

  async function loadContent(file: typeof activeFile) {
      if (!file) return
      setEditorLoading(true)
      try {
          if (file.path.startsWith('virtual://')) {
             if (file.type === 'json') {
                const configs = await api.listConfigs(file.scope, file.ownerId)
                if (configs.length > 0) {
                     const active = configs.find(c => c.is_active) || configs[0]
                     setLoadedConfigId(active.config_id)
                     setEditorContent(JSON.stringify(active.content, null, 2))
                } else {
                     setLoadedConfigId(null)
                     setEditorContent('{\n  "note": "No config found, create new"\n}')
                }
             }
          } else {
             const url = `/strategylab/strategies/${file.ownerId}/source?repo_path=${encodeURIComponent(file.path)}`
             const res = await http<{ content: string }>(url)
             setEditorContent(res.content)
          }
          setEditorDirty(false)
          setConfigError(null)
          setConfigMessage(null)
      } catch (e) {
          console.error(e)
          setEditorContent('// Failed to load content or file not found.')
      } finally {
          setEditorLoading(false)
      }
  }

  // --- SAVE ---
  async function handleSave() {
     if (!activeFile) return
     setSaving(true)
     try {
         if (activeFile.type === 'python') {
            const url = `/strategylab/strategies/${activeFile.ownerId}/source?repo_path=${encodeURIComponent(activeFile.path)}`
            await http(url, { method: 'POST', body: JSON.stringify({ filename: activeFile.path, code: editorContent }) })
         }
         setEditorDirty(false)
     } catch(e: any) {
         alert('Save failed: ' + e.message)
     } finally {
         setSaving(false)
     }
  }

  async function handleGenerateConfig() {
      if (!activeFile || activeFile.type !== 'json') return
      setConfigBusy(true)
      setConfigError(null)
      setConfigMessage(null)
      try {
          if (activeFile.scope === 'alignment') {
              const res = await http<any>(`/strategylab/alignments/${encodeURIComponent(activeFile.ownerId)}/config-file`)
              const cfg = (res && (res.config || res)) || {}
              setEditorContent(JSON.stringify(cfg, null, 2))
              setEditorDirty(true)
              setConfigMessage('✅ Generated runnable config')
              return
          }

          if (activeFile.scope === 'strategy') {
              const res = await api.autotuneStrategy(activeFile.ownerId)
              setEditorContent(JSON.stringify(res.config.content || res.config, null, 2))
              setEditorDirty(true)
              setConfigMessage(`✅ Generated (source: ${res.source || 'autotune'})`)
              return
          }
          if (activeFile.scope === 'model') {
              const res = await api.autotuneModel(activeFile.ownerId)
              setEditorContent(JSON.stringify(res.config.content || res.config, null, 2))
              setEditorDirty(true)
              setConfigMessage(`✅ Generated (source: ${res.source || 'autotune'})`)
              return
          }

          setConfigError('Unsupported scope for generation')
      } catch (e: any) {
          setConfigError(e.message || 'Failed to generate config')
      } finally {
          setConfigBusy(false)
      }
  }

  async function handleSaveConfigToDb(makeActive: boolean) {
      if (!activeFile || activeFile.type !== 'json') return
      setConfigBusy(true)
      setConfigError(null)
      setConfigMessage(null)
      try {
          const parsed = editorContent.trim() ? (JSON.parse(editorContent) as Record<string, unknown>) : {}
          const saved = await api.createConfig({
              scope: activeFile.scope,
              owner_id: activeFile.ownerId,
              name: activeFile.name || 'config.json',
              content: parsed,
              make_active: makeActive,
          })
          setLoadedConfigId(saved.config_id)
          setEditorDirty(false)
          setConfigMessage(makeActive ? `✅ Saved & activated (${saved.config_id})` : `✅ Saved (${saved.config_id})`)
      } catch (e: any) {
          setConfigError(e.message || 'Failed to save config')
      } finally {
          setConfigBusy(false)
      }
  }

  async function handleActivateLoadedConfig() {
      const id = loadedConfigId
      if (!id) {
          setConfigError('No saved config to activate')
          return
      }
      setConfigBusy(true)
      setConfigError(null)
      setConfigMessage(null)
      try {
          await api.activateConfig(id)
          setConfigMessage(`✅ Activated (${id})`)
      } catch (e: any) {
          setConfigError(e.message || 'Failed to activate config')
      } finally {
          setConfigBusy(false)
      }
  }

  async function handleRunBacktest() {
      if (!activeFile) return
      setBacktestBusy(true)
      setBacktestError(null)
      setBacktestResult(null)
      try {
          if (activeFile.scope !== 'alignment') {
              throw new Error('Backtest is supported from alignment scope in ACE')
          }

          // Apply selected timeframes into the alignment overrides before running.
          try {
              const current = alignments.find((a) => a.alignment_id === activeFile.ownerId)
              if (current) {
                  const next = withTimeframeOverrides(current as any, backtestTimeframe, backtestIncludeTimeframes)
                  const updated = await api.updateStrategyAlignment(next as any)
                  setAlignments((prev) => prev.map((x) => (x.alignment_id === updated.alignment_id ? (updated as any) : x)))
              }
          } catch {
              // Non-fatal: backtest can still run with existing config.
          }

          const qp = new URLSearchParams()
          if (backtestTimerange.trim()) qp.set('timerange', backtestTimerange.trim())
          const url = `/strategylab/alignments/${encodeURIComponent(activeFile.ownerId)}/backtest?${qp.toString()}`

          const opts: any = {}
          if (backtestTimeframe.trim()) opts.timeframe = backtestTimeframe.trim()
          if (backtestTimeframeDetail.trim()) opts.timeframe_detail = backtestTimeframeDetail.trim()
          if (backtestDataFormatOHLCV.trim()) opts.data_format_ohlcv = backtestDataFormatOHLCV.trim()
          if (backtestStakeAmount.trim()) opts.stake_amount = backtestStakeAmount.trim()
          if (backtestMaxOpenTrades.trim() && Number.isFinite(parseInt(backtestMaxOpenTrades.trim(), 10))) {
              opts.max_open_trades = parseInt(backtestMaxOpenTrades.trim(), 10)
          }
          if (backtestFee.trim() && Number.isFinite(parseFloat(backtestFee.trim()))) opts.fee = parseFloat(backtestFee.trim())
          if (backtestDryRunWallet.trim() && Number.isFinite(parseFloat(backtestDryRunWallet.trim()))) opts.dry_run_wallet = parseFloat(backtestDryRunWallet.trim())
          if (backtestEps) opts.eps = true
          if (backtestEnableProtections) opts.enable_protections = true
          if (backtestEnableDynamicPairlist) opts.enable_dynamic_pairlist = true
          if (backtestExport.trim()) opts.export = backtestExport.trim()
          if (backtestBreakdown.trim()) opts.breakdown = backtestBreakdown.trim()
          if (backtestCache.trim()) opts.cache = backtestCache.trim()
          if (backtestFreqaiLiveModels) opts.freqai_backtest_live_models = true
          if (backtestNotes.trim()) opts.notes = backtestNotes.trim()
          const pairs = (backtestPairsOverride || '')
              .split(/[\s,]+/g)
              .map((p) => p.trim())
              .filter(Boolean)
          if (pairs.length) opts.pairs = pairs

          const hasBody = Object.keys(opts).length > 0
          const res = await http<any>(url, { method: 'POST', ...(hasBody ? { body: JSON.stringify(opts) } : {}) })
          setBacktestResult(res)
      } catch (e: any) {
          setBacktestError(e.message || 'Backtest failed')
      } finally {
          setBacktestBusy(false)
      }
  }

  async function handleDeploy() {
      if (!activeFile) return
      setDeployBusy(true)
      setDeployError(null)
      setDeployResult(null)
      try {
          if (activeFile.scope !== 'alignment') {
              throw new Error('Deploy is supported from alignment scope in ACE')
          }
          const bot = await http<any>(`/strategylab/alignments/${encodeURIComponent(activeFile.ownerId)}/generate-bot`, { method: 'POST' })
          const botId = bot?.bot_id
          if (!botId) throw new Error('Failed to generate bot (no bot_id)')
          const dep = await http<any>(`/trading/bots/${encodeURIComponent(botId)}/deploy`, { method: 'POST' })
          setDeployResult({ bot: bot, deploy: dep })
      } catch (e: any) {
          setDeployError(e.message || 'Deploy failed')
      } finally {
          setDeployBusy(false)
      }
  }

  // --- TREE BUILDING ---
  const treeNodes = useMemo(() => {
      const nodes: ExplorerNode[] = []

      if (activeTab === 'strategies') {
         strategies.forEach(s => {
             const isOpen = expandedIds.has(s.strategy_id)
             const children: ExplorerNode[] = []
             if (isOpen) {
                 children.push({
                     id: `file-${s.strategy_id}-main`,
                     label: `${s.name || s.slug}.py`,
                     type: 'file',
                     fileType: 'python',
                     data: { path: `${s.name || s.slug}.py`, ownerId: s.strategy_id, scope: 'strategy' }
                 })
                 children.push({
                     id: `file-${s.strategy_id}-config`,
                     label: 'config.json',
                     type: 'file',
                     fileType: 'json',
                     data: { path: 'virtual://config', ownerId: s.strategy_id, scope: 'strategy' }
                 })
             }

             nodes.push({
                 id: s.strategy_id,
                 label: s.name || s.slug,
                 type: 'folder',
                 isOpen,
                 children
             })
         })
      } else if (activeTab === 'models') {
          models.forEach(m => {
              const isOpen = expandedIds.has(m.model_id)
              const children: ExplorerNode[] = isOpen ? [{
                  id: `model-${m.model_id}-config`,
                  label: 'config.json',
                  type: 'file',
                  fileType: 'json', // @ts-ignore
                  data: { path: 'virtual://config', ownerId: m.model_id, scope: 'model' }
              }] : []
              
              nodes.push({ id: m.model_id, label: m.name, type: 'folder', isOpen, children })
          })
      } else {
          alignments.forEach(a => {
            const isOpen = expandedIds.has(a.alignment_id)
            const children: ExplorerNode[] = isOpen ? [{
                id: `aln-${a.alignment_id}-config`,
                label: 'config.json',
                type: 'file',
                fileType: 'json', // @ts-ignore
                data: { path: 'virtual://config', ownerId: a.alignment_id, scope: 'alignment' }
            }] : []
            nodes.push({ id: a.alignment_id, label: `Alignment ${a.alignment_id.slice(0,6)}`, type: 'folder', isOpen, children })
          })
      }

      return nodes
  }, [activeTab, strategies, models, alignments, expandedIds])


  function toggleFolder(id: string) {
      const next = new Set(expandedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      setExpandedIds(next)
  }

  function onNodeClick(node: ExplorerNode) {
      if (node.type === 'folder') {
          toggleFolder(node.id)
      } else {
          setActiveFile({
              id: node.id,
              ownerId: node.data.ownerId,
              scope: node.data.scope,
              path: node.data.path,
              name: node.label,
              type: node.fileType || 'python'
          })
      }
  }



  async function handleHyperopt() {
                if (!effectiveHyperoptStrategyName) {
            alert("Please open a strategy .py file, or open config.json that contains a 'strategy' field.")
            return
        }
    // Launch Wizard instead of direct run
    setShowHyperoptWizard(true)
  }

    async function startHyperoptFromWizard(cfg: {
        spaces: string | string[]
        epochs: number
        timerange?: string
        hyperopt_loss?: string
        download_data?: boolean
        job_workers?: number
        timeframe?: string
        timeframe_detail?: string
        data_format_ohlcv?: string
        max_open_trades?: number
        stake_amount?: string | number
        fee?: number
        pairs?: string[]
        eps?: boolean
        enable_protections?: boolean
        dry_run_wallet?: number
        random_state?: number
        min_trades?: number
        analyze_per_epoch?: boolean
        early_stop?: number
        print_all?: boolean
        print_json?: boolean
        disable_param_export?: boolean
        ignore_missing_spaces?: boolean
    }) {
        if (!effectiveHyperoptStrategyName) return
    setShowHyperoptWizard(false) // Close wizard

    try {
        const alignment_id = wizardHyperoptAlignmentId
        // Clear immediately to avoid leaking into non-wizard runs.
        if (alignment_id) setWizardHyperoptAlignmentId(null)
        const res = await http<{ message: string, job_id: string }>('/strategylab/hyperopt/start', {
            method: 'POST',
            body: JSON.stringify({ 
                strategy_name: effectiveHyperoptStrategyName, 
                epochs: cfg.epochs,
                spaces: Array.isArray(cfg.spaces) ? cfg.spaces.join(' ') : cfg.spaces,
                timerange: cfg.timerange ?? '20240101-',
                hyperopt_loss: cfg.hyperopt_loss ?? 'SharpeHyperOptLoss',
                alignment_id,
                download_data: typeof cfg.download_data === 'boolean' ? cfg.download_data : true,
                job_workers: typeof cfg.job_workers === 'number' ? cfg.job_workers : 1,
                timeframe: cfg.timeframe,
                timeframe_detail: cfg.timeframe_detail,
                data_format_ohlcv: cfg.data_format_ohlcv,
                max_open_trades: cfg.max_open_trades,
                stake_amount: cfg.stake_amount,
                fee: cfg.fee,
                pairs: cfg.pairs,
                eps: cfg.eps,
                enable_protections: cfg.enable_protections,
                dry_run_wallet: cfg.dry_run_wallet,
                random_state: cfg.random_state,
                min_trades: cfg.min_trades,
                analyze_per_epoch: cfg.analyze_per_epoch,
                early_stop: cfg.early_stop,
                print_all: cfg.print_all,
                print_json: cfg.print_json,
                disable_param_export: cfg.disable_param_export,
                ignore_missing_spaces: cfg.ignore_missing_spaces,
            })
        })
        if (res.job_id) {
          setHyperoptJobId(res.job_id)
        } else {
          setChatHistory(prev => [...prev, { 
              role: 'assistant', 
              content: `Hyperopt started. (No Job ID returned)` 
          }])
        }
    } catch (e: any) {
        alert("Failed to start Hyperopt: " + e.message)
    }
  }
  async function handleChat(overridePrompt?: string) {
      const text = overridePrompt || chatInput.trim()
      if (!text || chatBusy) return
      
      const provider = aiSettings?.ai_provider || 'local'
      const model = aiSettings?.ai_provider === 'openrouter' ? (aiSettings?.openrouter_model_id || '') : (provider === 'openai' ? 'gpt-4o-mini' : null)
      
      // Optimistic user update
      const userMsg = { role: 'user' as const, content: text }
      setChatHistory(prev => [...prev, userMsg])
      setChatInput('')
      setChatBusy(true)

      try {
          // Build context
          let context = ''
          if (activeFile) {
              if (activeFile.scope === 'strategy') {
                  context = buildStrategyChatContext({
                      strategyId: activeFile.ownerId,
                      filename: activeFile.name,
                      code: editorContent
                  })
              } else {
                  context = buildConfigChatContext({
                      scope: activeFile.scope,
                      ownerId: activeFile.ownerId,
                      filename: activeFile.name,
                      source: 'editor',
                      configText: editorContent
                  })
              }
          } else {
              context = "User is in the file explorer but hasn't selected a file yet."
          }

          const messages = [
              { role: 'user', content: context },
              ...chatHistory, 
              userMsg
          ]

          // @ts-ignore
          const res = await http<{ content: string }>('/ai/chat', {
              method: 'POST',
              body: JSON.stringify({
                  provider,
                  // Pass the token from aiSettings if available
                  // If "local" or empty, backend will try to use user's saved token
                  token: aiSettings?.has_ai_token ? null : null, // Backend handles saved token
                  model,
                  messages,
                  max_tokens: 1000,
                  temperature: 0.3
              })
          })

          setChatHistory(prev => [...prev, { role: 'assistant', content: res.content }])

      } catch (e: any) {
          setChatHistory(prev => [...prev, { role: 'assistant', content: 'Error: ' + e.message }])
      } finally {
          setChatBusy(false)
      }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: THEME.bg, color: THEME.text, fontFamily: 'Segoe UI, sans-serif' }}>
      
      {/* 1. TOP MENU */}
      <div style={{ 
                    minHeight: 40,
                    borderBottom: `1px solid ${THEME.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    rowGap: 8,
                    padding: '8px 12px',
                    background: THEME.activityBar,
                    justifyContent: 'space-between',
                    boxSizing: 'border-box',
      }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 auto' }}>
                            <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{paramScope || 'Global'}</span>
                            <div style={{ display: 'inline-flex', background: THEME.sidebar, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 2, gap: 2 }}>
                                    <button
                                        type="button"
                                        onClick={() => setViewMode('editor')}
                                        style={{
                                            padding: '6px 10px',
                                            borderRadius: 6,
                                            border: 'none',
                                            background: viewMode === 'editor' ? THEME.bg : 'transparent',
                                            color: viewMode === 'editor' ? THEME.text : THEME.textSecondary,
                                            cursor: 'pointer',
                                            fontSize: 12,
                                            fontWeight: 600,
                                            lineHeight: 1,
                                            whiteSpace: 'nowrap',
                                        }}
                                        aria-pressed={viewMode === 'editor'}
                                    >
                                        Editor
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setViewMode('hyperopt')}
                                                        disabled={!effectiveHyperoptStrategyName}
                                        style={{
                                            padding: '6px 10px',
                                            borderRadius: 6,
                                            border: 'none',
                                            background: viewMode === 'hyperopt' ? THEME.bg : 'transparent',
                                            color: viewMode === 'hyperopt' ? THEME.text : THEME.textSecondary,
                                            cursor: effectiveHyperoptStrategyName ? 'pointer' : 'not-allowed',
                                            fontSize: 12,
                                            fontWeight: 600,
                                            lineHeight: 1,
                                            whiteSpace: 'nowrap',
                                            opacity: effectiveHyperoptStrategyName ? 1 : 0.5,
                                        }}
                                        aria-pressed={viewMode === 'hyperopt'}
                                    >
                                        Hyperopt
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setViewMode('backtest')}
                                        disabled={paramScope !== 'alignment'}
                                        style={{
                                            padding: '6px 10px',
                                            borderRadius: 6,
                                            border: 'none',
                                            background: viewMode === 'backtest' ? THEME.bg : 'transparent',
                                            color: viewMode === 'backtest' ? THEME.text : THEME.textSecondary,
                                            cursor: paramScope === 'alignment' ? 'pointer' : 'not-allowed',
                                            fontSize: 12,
                                            fontWeight: 600,
                                            lineHeight: 1,
                                            whiteSpace: 'nowrap',
                                            opacity: paramScope === 'alignment' ? 1 : 0.5,
                                        }}
                                        aria-pressed={viewMode === 'backtest'}
                                    >
                                        Backtest
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setViewMode('deploy')}
                                        disabled={paramScope !== 'alignment'}
                                        style={{
                                            padding: '6px 10px',
                                            borderRadius: 6,
                                            border: 'none',
                                            background: viewMode === 'deploy' ? THEME.bg : 'transparent',
                                            color: viewMode === 'deploy' ? THEME.text : THEME.textSecondary,
                                            cursor: paramScope === 'alignment' ? 'pointer' : 'not-allowed',
                                            fontSize: 12,
                                            fontWeight: 600,
                                            lineHeight: 1,
                                            whiteSpace: 'nowrap',
                                            opacity: paramScope === 'alignment' ? 1 : 0.5,
                                        }}
                                        aria-pressed={viewMode === 'deploy'}
                                    >
                                        Deploy
                                    </button>
                            </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {!!effectiveHyperoptStrategyName && (
                                <button
                                    type="button"
                                    onClick={handleHyperopt}
                                    style={{ ...topMenuButtonStyle, color: THEME.accent, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                    title="Run Hyperopt Optimization"
                                >
                                    🚀 Hyperopt
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => loadData()}
                                style={topMenuButtonStyle}
                            >
                                Refresh
                            </button>
                            {showCloseButton ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (onClose) return onClose()
                                        if (!embedded) navigate(-1)
                                    }}
                                    style={{
                                        ...topMenuButtonStyle,
                                        background: THEME.error,
                                        border: 'none',
                                        color: 'white',
                                    }}
                                >
                                    Close
                                </button>
                            ) : null}
                    </div>
      </div>

      {/* 2. FILES & CONFIGS ACCORDION */}
      <div style={{ borderBottom: `1px solid ${THEME.border}` }}>
          <div 
             onClick={() => setFilesExpanded(!filesExpanded)}
             style={{ 
                 padding: '8px 16px', background: THEME.sidebar, cursor: 'pointer', 
                 display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 600
             }}>
             <span>Files & Configs</span>
             <span>{filesExpanded ? '▼' : '▶'}</span>
          </div>
          {filesExpanded && (
              <div style={{ height: 200, overflowY: 'auto', background: THEME.bg, borderTop: `1px solid ${THEME.border}` }}>
                   <div style={{ display: 'flex', gap: 10, padding: 8, borderBottom: `1px solid ${THEME.border}` }}>
                       <span onClick={() => setActiveTab('strategies')} style={{ cursor: 'pointer', color: activeTab === 'strategies' ? THEME.accent : THEME.textSecondary }}>Strategies</span>
                       <span onClick={() => setActiveTab('models')} style={{ cursor: 'pointer', color: activeTab === 'models' ? THEME.accent : THEME.textSecondary }}>Models</span>
                   </div>
                  {treeNodes.map(node => (
                      <div key={node.id}>
                          <div 
                            onClick={() => toggleFolder(node.id)}
                            style={{ padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                             <span>{node.isOpen ? '▼' : '▶'}</span>
                             <span>{node.label}</span>
                          </div>
                          {node.isOpen && node.children && node.children.map(child => (
                              <div key={child.id} onClick={() => onNodeClick(child)}
                                   style={{ 
                                       padding: '4px 8px 4px 28px', cursor: 'pointer',
                                       background: activeFile?.id === child.id ? THEME.selection : 'transparent',
                                       color: activeFile?.id === child.id ? '#fff' : THEME.text
                                   }}>
                                  {child.label}
                              </div>
                          ))}
                      </div>
                  ))}
              </div>
          )}
      </div>

      {/* 3. CHAT BOT ACCORDION */}
      <div style={{ borderBottom: `1px solid ${THEME.border}` }}>
          <div 
             onClick={() => setChatExpanded(!chatExpanded)}
             style={{ 
                 padding: '8px 16px', background: THEME.sidebar, cursor: 'pointer', 
                 display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 600
             }}>
             <span>Chat bot</span>
             <span>{chatExpanded ? '▼' : '▶'}</span>
          </div>
          {chatExpanded && (
              <div style={{ height: 200, display: 'flex', flexDirection: 'column', background: THEME.bg }}>
                   <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
                        {chatHistory.map((m, i) => (
                           <div key={i} style={{ padding: 4, color: m.role === 'user' ? THEME.accent : THEME.text }}>
                               <strong>{m.role}:</strong> {m.content}
                           </div>
                        ))}
                   </div>
                   <div style={{ padding: 8, borderTop: `1px solid ${THEME.border}` }}>
                       <input 
                                                    style={{
                                                        width: '100%',
                                                        background: THEME.sidebar,
                                                        border: `1px solid ${THEME.border}`,
                                                        borderRadius: 8,
                                                        color: THEME.text,
                                                        padding: '8px 10px',
                                                        boxSizing: 'border-box',
                                                    }}
                          placeholder="Ask AI..."
                          value={chatInput}
                          onChange={e => setChatInput(e.target.value)}
                          disabled={chatBusy}
                          onKeyDown={e => {
                               if (e.key === 'Enter') {
                                   void handleChat()
                               }
                          }}
                       />
                   </div>
              </div>
          )}
      </div>

      {/* 4. LOGS PANEL (Embedded) */}
      {hyperoptJobId && (
          <LogViewerPanel jobId={hyperoptJobId} />
      )}

      {/* 5. PROMPTS ACCORDION */}
      <div style={{ borderBottom: `1px solid ${THEME.border}` }}>
          <div 
             onClick={() => setPromptsExpanded(!promptsExpanded)}
             style={{ 
                 padding: '8px 16px', background: THEME.sidebar, cursor: 'pointer', 
                 display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 600
             }}>
             <span>Prompts</span>
             <span>{promptsExpanded ? '▼' : '▶'}</span>
          </div>
          {promptsExpanded && (
              <div style={{ padding: 10, background: THEME.bg, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {prompts.map(p => (
                      <button key={p} 
                         onClick={() => void handleChat(p)}
                         style={{
                           padding: '6px 10px',
                           borderRadius: 8,
                           border: `1px solid ${THEME.border}`,
                           background: THEME.sidebar,
                           color: THEME.text,
                           cursor: 'pointer',
                           fontSize: 12,
                         }}>
                         {p}
                      </button>
                  ))}
              </div>
          )}
      </div>

      {/* 5. MAIN PANEL */}
      {viewMode === 'hyperopt' ? (
        <div style={{flex: 1, minHeight: 0}}>
            <HyperoptDashboard 
                                                                strategyName={effectiveHyperoptStrategyName} 
                activeJobId={hyperoptJobId}
                onRun={startHyperoptFromWizard}
            />
        </div>
      ) : viewMode === 'backtest' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 12, borderBottom: `1px solid ${THEME.border}`, background: THEME.activityBar, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700 }}>Backtest</span>
                <div style={{ minWidth: 380, flex: '1 1 380px' }}>
                  <TimerangePicker value={backtestTimerange} onChange={setBacktestTimerange} />
                  <div style={{ marginTop: 8 }}>
                      <TimerangePresets onPick={setBacktestTimerange} />
                  </div>
                </div>

                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary, minWidth: 160 }}>
                    Timeframe
                    <select
                        value={backtestTimeframe}
                        onChange={(e) => setBacktestTimeframe(e.target.value)}
                        style={{
                            background: THEME.bg,
                            border: `1px solid ${THEME.border}`,
                            color: THEME.text,
                            padding: '8px',
                            borderRadius: 8,
                        }}
                    >
                        {TIMEFRAME_OPTIONS.map((t) => (
                            <option key={t} value={t}>
                                {t}
                            </option>
                        ))}
                    </select>
                </label>

                <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontSize: 12, color: THEME.textSecondary }}>FreqAI include_timeframes</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {TIMEFRAME_OPTIONS.map((t) => {
                            const checked = backtestIncludeTimeframes.includes(t)
                            return (
                                <label
                                    key={t}
                                    style={{
                                        display: 'flex',
                                        gap: 6,
                                        alignItems: 'center',
                                        cursor: 'pointer',
                                        background: checked ? THEME.selection : 'transparent',
                                        border: `1px solid ${checked ? THEME.accent : THEME.border}`,
                                        padding: '6px 10px',
                                        borderRadius: 8,
                                        fontSize: 12,
                                        color: THEME.text,
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) => {
                                            if (e.target.checked) setBacktestIncludeTimeframes((prev) => (prev.includes(t) ? prev : [...prev, t]))
                                            else setBacktestIncludeTimeframes((prev) => prev.filter((x) => x !== t))
                                        }}
                                        style={{ accentColor: THEME.accent }}
                                    />
                                    {t}
                                </label>
                            )
                        })}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => void handleRunBacktest()}
                    disabled={backtestBusy || paramScope !== 'alignment'}
                    style={{ ...topMenuButtonStyle, background: THEME.accent, border: 'none', color: 'white', opacity: (backtestBusy || paramScope !== 'alignment') ? 0.6 : 1 }}
                >
                    {backtestBusy ? 'Running...' : 'Run backtest'}
                </button>
                {backtestError && <span style={{ color: THEME.error, fontSize: 12 }}>{backtestError}</span>}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
                <div style={{ display: 'grid', gap: 12 }}>
                    <details open style={{ border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 12, background: THEME.sidebar }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 800, color: THEME.text, fontSize: 12 }}>Advanced options</summary>
                        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                    Timeframe detail
                                    <select
                                        value={backtestTimeframeDetail}
                                        onChange={(e) => setBacktestTimeframeDetail(e.target.value)}
                                        style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 8 }}
                                    >
                                        <option value="">(none)</option>
                                        {TIMEFRAME_OPTIONS.map((t) => (
                                            <option key={t} value={t}>
                                                {t}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                    OHLCV data format
                                    <input
                                        value={backtestDataFormatOHLCV}
                                        onChange={(e) => setBacktestDataFormatOHLCV(e.target.value)}
                                        placeholder="(default)"
                                        style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }}
                                    />
                                </label>
                            </div>

                            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                Pairs override (comma/space separated)
                                <input
                                    value={backtestPairsOverride}
                                    onChange={(e) => setBacktestPairsOverride(e.target.value)}
                                    placeholder="BTC/USDT ETH/USDT"
                                    style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }}
                                />
                            </label>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                    Stake amount
                                    <input
                                        value={backtestStakeAmount}
                                        onChange={(e) => setBacktestStakeAmount(e.target.value)}
                                        placeholder="(config)"
                                        style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 8, fontSize: 13 }}
                                    />
                                </label>
                                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                    Max open trades
                                    <input
                                        type="number"
                                        step={1}
                                        value={backtestMaxOpenTrades}
                                        onChange={(e) => setBacktestMaxOpenTrades(e.target.value)}
                                        placeholder="(config)"
                                        style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 8, fontSize: 13 }}
                                    />
                                </label>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                    Fee
                                    <input
                                        type="number"
                                        step="0.0001"
                                        value={backtestFee}
                                        onChange={(e) => setBacktestFee(e.target.value)}
                                        placeholder="(config)"
                                        style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 8, fontSize: 13 }}
                                    />
                                </label>
                                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                    Dry-run wallet
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={backtestDryRunWallet}
                                        onChange={(e) => setBacktestDryRunWallet(e.target.value)}
                                        placeholder="(config)"
                                        style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 8, fontSize: 13 }}
                                    />
                                </label>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: THEME.text }}>
                                    <input type="checkbox" checked={backtestEps} onChange={(e) => setBacktestEps(e.target.checked)} style={{ accentColor: THEME.accent }} />
                                    --eps
                                </label>
                                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: THEME.text }}>
                                    <input type="checkbox" checked={backtestEnableProtections} onChange={(e) => setBacktestEnableProtections(e.target.checked)} style={{ accentColor: THEME.accent }} />
                                    Enable protections
                                </label>
                            </div>

                            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: THEME.text }}>
                                <input
                                    type="checkbox"
                                    checked={backtestEnableDynamicPairlist}
                                    onChange={(e) => setBacktestEnableDynamicPairlist(e.target.checked)}
                                    style={{ accentColor: THEME.accent }}
                                />
                                Enable dynamic pairlist
                            </label>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                    Export
                                    <input
                                        value={backtestExport}
                                        onChange={(e) => setBacktestExport(e.target.value)}
                                        placeholder="(empty)"
                                        style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }}
                                    />
                                </label>
                                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                    Breakdown
                                    <input
                                        value={backtestBreakdown}
                                        onChange={(e) => setBacktestBreakdown(e.target.value)}
                                        placeholder="(empty)"
                                        style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }}
                                    />
                                </label>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                    Cache
                                    <input
                                        value={backtestCache}
                                        onChange={(e) => setBacktestCache(e.target.value)}
                                        placeholder="(empty)"
                                        style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }}
                                    />
                                </label>
                                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: THEME.text, paddingTop: 24 }}>
                                    <input type="checkbox" checked={backtestFreqaiLiveModels} onChange={(e) => setBacktestFreqaiLiveModels(e.target.checked)} style={{ accentColor: THEME.accent }} />
                                    FreqAI: backtest live models
                                </label>
                            </div>

                            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                Notes
                                <input
                                    value={backtestNotes}
                                    onChange={(e) => setBacktestNotes(e.target.value)}
                                    placeholder="(optional)"
                                    style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text, padding: '8px', borderRadius: 8, fontSize: 13 }}
                                />
                            </label>
                        </div>
                    </details>

                    {!backtestResult ? (
                        <div style={{ color: THEME.textSecondary }}>Select an alignment and run backtest to see results.</div>
                    ) : (
                        <BacktestResultTable data={backtestResult} />
                    )}
                </div>
            </div>
        </div>
      ) : viewMode === 'deploy' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 12, borderBottom: `1px solid ${THEME.border}`, background: THEME.activityBar, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700 }}>Deploy</span>
                <button
                    type="button"
                    onClick={() => void handleDeploy()}
                    disabled={deployBusy || paramScope !== 'alignment'}
                    style={{ ...topMenuButtonStyle, background: THEME.accent, border: 'none', color: 'white', opacity: (deployBusy || paramScope !== 'alignment') ? 0.6 : 1 }}
                >
                    {deployBusy ? 'Deploying...' : 'Generate bot + deploy'}
                </button>
                {deployError && <span style={{ color: THEME.error, fontSize: 12 }}>{deployError}</span>}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
                {!deployResult ? (
                    <div style={{ color: THEME.textSecondary }}>Select an alignment and deploy to start a container.</div>
                ) : (
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontSize: 12, color: THEME.text }}>
                        {JSON.stringify(deployResult, null, 2)}
                    </pre>
                )}
            </div>
        </div>
      ) : (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {showDeployWizard ? (
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16 }}>
                  <div style={{
                      maxWidth: 820,
                      margin: '0 auto',
                      background: THEME.sidebar,
                      border: `1px solid ${THEME.border}`,
                      borderRadius: 12,
                      padding: 16,
                      display: 'grid',
                      gap: 12,
                  }}>
                      <div style={{ display: 'grid', gap: 4 }}>
                          <div style={{ fontWeight: 800, color: THEME.text }}>Deploy wizard</div>
                          <div style={{ fontSize: 12, color: THEME.textSecondary }}>
                              Step {deployWizardStep} of 3: choose strategy → choose model → run Backtest/Hyperopt.
                          </div>
                      </div>

                      {deployWizardStep === 1 ? (
                          <div style={{ display: 'grid', gap: 10 }}>
                              <label style={{ display: 'grid', gap: 6 }}>
                                  <span style={{ fontSize: 12, color: THEME.textSecondary }}>Strategy</span>
                                                                    <input
                                                                        value={wizardStrategyQuery}
                                                                        onChange={(e) => setWizardStrategyQuery(e.target.value)}
                                                                        placeholder="Search strategy (slug/name/class/url)…"
                                                                        disabled={wizardBusy}
                                                                        style={{
                                                                            background: THEME.bg,
                                                                            color: THEME.text,
                                                                            border: `1px solid ${THEME.border}`,
                                                                            borderRadius: 10,
                                                                            padding: '10px 12px',
                                                                        }}
                                                                    />

                                                                    <div
                                                                        style={{
                                                                            border: `1px solid ${THEME.border}`,
                                                                            borderRadius: 10,
                                                                            overflow: 'hidden',
                                                                            background: THEME.bg,
                                                                            maxHeight: '55vh',
                                                                            overflowY: 'auto',
                                                                        }}
                                                                    >
                                                                        {strategies
                                                                            .filter((s) => {
                                                                                const q = wizardStrategyQuery.trim().toLowerCase()
                                                                                if (!q) return true
                                                                                const hay = `${s.slug || ''} ${s.name || ''} ${s.strategy_class || ''} ${s.source_url || ''}`.toLowerCase()
                                                                                return hay.includes(q)
                                                                            })
                                                                            .map((s) => {
                                                                                const selected = s.strategy_id === wizardStrategyId
                                                                                return (
                                                                                    <button
                                                                                        key={s.strategy_id}
                                                                                        type="button"
                                                                                        onClick={() => setWizardStrategyId(s.strategy_id)}
                                                                                        disabled={wizardBusy}
                                                                                        style={{
                                                                                            width: '100%',
                                                                                            textAlign: 'left',
                                                                                            padding: '10px 12px',
                                                                                            border: 'none',
                                                                                            background: selected ? THEME.selection : 'transparent',
                                                                                            color: THEME.text,
                                                                                            cursor: wizardBusy ? 'not-allowed' : 'pointer',
                                                                                            display: 'grid',
                                                                                            gap: 4,
                                                                                        }}
                                                                                    >
                                                                                        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                                                                                            <span style={{ fontWeight: 800 }}>{s.slug || s.name || s.strategy_id}</span>
                                                                                            {s.strategy_class ? (
                                                                                                <span style={{ fontFamily: 'monospace', fontSize: 12, color: THEME.textSecondary }}>{s.strategy_class}</span>
                                                                                            ) : null}
                                                                                        </div>
                                                                                        <div style={{ fontSize: 12, color: THEME.textSecondary, wordBreak: 'break-word' }}>
                                                                                            {s.source_type ? `${s.source_type}` : 'strategy'}{s.source_url ? ` · ${s.source_url}` : ''}
                                                                                        </div>
                                                                                    </button>
                                                                                )
                                                                            })}
                                                                    </div>
                              </label>

                              <div style={{ display: 'grid', gap: 8 }}>
                                  <div style={{ fontSize: 12, color: THEME.textSecondary }}>Strategy config</div>
                                  <div
                                      style={{
                                          border: `1px solid ${THEME.border}`,
                                          borderRadius: 10,
                                          overflow: 'hidden',
                                          background: THEME.bg,
                                          maxHeight: 220,
                                          overflowY: 'auto',
                                      }}
                                  >
                                      {!wizardStrategyId ? (
                                          <div style={{ padding: '10px 12px', fontSize: 12, color: THEME.textSecondary }}>
                                              Select a strategy to load configs.
                                          </div>
                                      ) : wizardStrategyConfigs.length ? (
                                          wizardStrategyConfigs.map((c) => {
                                              const selected = c.config_id === wizardStrategyConfigId
                                              return (
                                                  <button
                                                      key={c.config_id}
                                                      type="button"
                                                      onClick={() => {
                                                          setWizardStrategyConfigId(c.config_id)
                                                          void activateWizardConfig(c.config_id)
                                                      }}
                                                      disabled={wizardBusy}
                                                      style={{
                                                          width: '100%',
                                                          textAlign: 'left',
                                                          padding: '10px 12px',
                                                          border: 'none',
                                                          background: selected ? THEME.selection : 'transparent',
                                                          color: THEME.text,
                                                          cursor: wizardBusy ? 'not-allowed' : 'pointer',
                                                          display: 'flex',
                                                          alignItems: 'baseline',
                                                          justifyContent: 'space-between',
                                                          gap: 10,
                                                      }}
                                                  >
                                                      <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.name || c.config_id}</span>
                                                      {c.is_active ? (
                                                          <span style={{ fontSize: 11, color: THEME.success, fontWeight: 800 }}>ACTIVE</span>
                                                      ) : (
                                                          <span style={{ fontSize: 11, color: THEME.textSecondary }}>inactive</span>
                                                      )}
                                                  </button>
                                              )
                                          })
                                      ) : (
                                          <div style={{ padding: '10px 12px', display: 'grid', gap: 10 }}>
                                              <div style={{ fontSize: 12, color: THEME.textSecondary }}>
                                                  No configs found for this strategy.
                                              </div>
                                              <button
                                                  type="button"
                                                  onClick={() => void createDefaultStrategyConfig()}
                                                  disabled={wizardBusy || !wizardStrategyId}
                                                  style={{
                                                      padding: '10px 12px',
                                                      borderRadius: 10,
                                                      border: `1px solid ${THEME.border}`,
                                                      background: THEME.sidebar,
                                                      color: THEME.text,
                                                      cursor: wizardBusy || !wizardStrategyId ? 'not-allowed' : 'pointer',
                                                      opacity: wizardBusy || !wizardStrategyId ? 0.6 : 1,
                                                      fontWeight: 700,
                                                  }}
                                              >
                                                  Create default strategy config
                                              </button>
                                          </div>
                                      )}
                                  </div>
                                  <div style={{ fontSize: 11, color: THEME.textSecondary }}>
                                      Required: the Combined config builder uses ACTIVE strategy+model configs.
                                  </div>
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                                  <div style={{ fontSize: 12, color: THEME.textSecondary }}>
                                      Selected: <span style={{ fontFamily: 'monospace', color: THEME.text }}>{wizardStrategy?.strategy_class || wizardStrategy?.slug || '—'}</span>
                                  </div>
                                  <button
                                      type="button"
                                      disabled={!wizardStrategyId || !wizardStrategyConfigId || wizardBusy}
                                      onClick={() => {
                                          setWizardError(null)
                                          setDeployWizardStep(2)
                                      }}
                                      style={{
                                          padding: '10px 12px',
                                          borderRadius: 10,
                                          border: `1px solid ${THEME.border}`,
                                          background: THEME.accent,
                                          color: THEME.text,
                                          cursor: !wizardStrategyId || !wizardStrategyConfigId || wizardBusy ? 'not-allowed' : 'pointer',
                                          opacity: !wizardStrategyId || !wizardStrategyConfigId || wizardBusy ? 0.6 : 1,
                                          fontWeight: 700,
                                      }}
                                  >
                                      Confirm → Step 2
                                  </button>
                              </div>
                          </div>
                      ) : null}

                      {deployWizardStep === 2 ? (
                          <div style={{ display: 'grid', gap: 10 }}>
                              <label style={{ display: 'grid', gap: 6 }}>
                                  <span style={{ fontSize: 12, color: THEME.textSecondary }}>Model</span>
                                                                    <input
                                                                        value={wizardModelQuery}
                                                                        onChange={(e) => setWizardModelQuery(e.target.value)}
                                                                        placeholder="Search model (name/slug/id)…"
                                                                        disabled={wizardBusy}
                                                                        style={{
                                                                            background: THEME.bg,
                                                                            color: THEME.text,
                                                                            border: `1px solid ${THEME.border}`,
                                                                            borderRadius: 10,
                                                                            padding: '10px 12px',
                                                                        }}
                                                                    />

                                                                    <div
                                                                        style={{
                                                                            border: `1px solid ${THEME.border}`,
                                                                            borderRadius: 10,
                                                                            overflow: 'hidden',
                                                                            background: THEME.bg,
                                                                            maxHeight: '55vh',
                                                                            overflowY: 'auto',
                                                                        }}
                                                                    >
                                                                        {models
                                                                            .filter((m) => {
                                                                                const q = wizardModelQuery.trim().toLowerCase()
                                                                                if (!q) return true
                                                                                const hay = `${m.name || ''} ${(m as any).slug || ''} ${m.model_id || ''}`.toLowerCase()
                                                                                return hay.includes(q)
                                                                            })
                                                                            .map((m) => {
                                                                                const selected = m.model_id === wizardModelId
                                                                                return (
                                                                                    <button
                                                                                        key={m.model_id}
                                                                                        type="button"
                                                                                        onClick={() => setWizardModelId(m.model_id)}
                                                                                        disabled={wizardBusy}
                                                                                        style={{
                                                                                            width: '100%',
                                                                                            textAlign: 'left',
                                                                                            padding: '10px 12px',
                                                                                            border: 'none',
                                                                                            background: selected ? THEME.selection : 'transparent',
                                                                                            color: THEME.text,
                                                                                            cursor: wizardBusy ? 'not-allowed' : 'pointer',
                                                                                            display: 'grid',
                                                                                            gap: 4,
                                                                                        }}
                                                                                    >
                                                                                        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                                                                                            <span style={{ fontWeight: 800 }}>{m.name || (m as any).slug || m.model_id}</span>
                                                                                            <span style={{ fontFamily: 'monospace', fontSize: 12, color: THEME.textSecondary }}>{m.model_id}</span>
                                                                                        </div>
                                                                                    </button>
                                                                                )
                                                                            })}
                                                                    </div>
                              </label>

                              <div style={{ display: 'grid', gap: 8 }}>
                                  <div style={{ fontSize: 12, color: THEME.textSecondary }}>Model config</div>
                                  <div
                                      style={{
                                          border: `1px solid ${THEME.border}`,
                                          borderRadius: 10,
                                          overflow: 'hidden',
                                          background: THEME.bg,
                                          maxHeight: 220,
                                          overflowY: 'auto',
                                      }}
                                  >
                                      {!wizardModelId ? (
                                          <div style={{ padding: '10px 12px', fontSize: 12, color: THEME.textSecondary }}>
                                              Select a model to load configs.
                                          </div>
                                      ) : wizardModelConfigs.length ? (
                                          wizardModelConfigs.map((c) => {
                                              const selected = c.config_id === wizardModelConfigId
                                              return (
                                                  <button
                                                      key={c.config_id}
                                                      type="button"
                                                      onClick={() => {
                                                          setWizardModelConfigId(c.config_id)
                                                          void activateWizardConfig(c.config_id)
                                                      }}
                                                      disabled={wizardBusy}
                                                      style={{
                                                          width: '100%',
                                                          textAlign: 'left',
                                                          padding: '10px 12px',
                                                          border: 'none',
                                                          background: selected ? THEME.selection : 'transparent',
                                                          color: THEME.text,
                                                          cursor: wizardBusy ? 'not-allowed' : 'pointer',
                                                          display: 'flex',
                                                          alignItems: 'baseline',
                                                          justifyContent: 'space-between',
                                                          gap: 10,
                                                      }}
                                                  >
                                                      <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.name || c.config_id}</span>
                                                      {c.is_active ? (
                                                          <span style={{ fontSize: 11, color: THEME.success, fontWeight: 800 }}>ACTIVE</span>
                                                      ) : (
                                                          <span style={{ fontSize: 11, color: THEME.textSecondary }}>inactive</span>
                                                      )}
                                                  </button>
                                              )
                                          })
                                      ) : (
                                          <div style={{ padding: '10px 12px', display: 'grid', gap: 10 }}>
                                              <div style={{ fontSize: 12, color: THEME.textSecondary }}>
                                                  No configs found for this model.
                                              </div>
                                              <button
                                                  type="button"
                                                  onClick={() => void createDefaultModelConfig()}
                                                  disabled={wizardBusy || !wizardModelId}
                                                  style={{
                                                      padding: '10px 12px',
                                                      borderRadius: 10,
                                                      border: `1px solid ${THEME.border}`,
                                                      background: THEME.sidebar,
                                                      color: THEME.text,
                                                      cursor: wizardBusy || !wizardModelId ? 'not-allowed' : 'pointer',
                                                      opacity: wizardBusy || !wizardModelId ? 0.6 : 1,
                                                      fontWeight: 700,
                                                  }}
                                              >
                                                  Create default model config
                                              </button>
                                          </div>
                                      )}
                                  </div>
                                  <div style={{ fontSize: 11, color: THEME.textSecondary }}>
                                      Required: the Combined config builder uses ACTIVE strategy+model configs.
                                  </div>
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                                  <button
                                      type="button"
                                      disabled={wizardBusy}
                                      onClick={() => setDeployWizardStep(1)}
                                      style={{
                                          padding: '10px 12px',
                                          borderRadius: 10,
                                          border: `1px solid ${THEME.border}`,
                                          background: THEME.sidebar,
                                          color: THEME.text,
                                          cursor: wizardBusy ? 'not-allowed' : 'pointer',
                                          opacity: wizardBusy ? 0.6 : 1,
                                      }}
                                  >
                                      ← Back
                                  </button>
                                  <button
                                      type="button"
                                      disabled={!wizardModelId || !wizardModelConfigId || wizardBusy}
                                      onClick={() => {
                                          setWizardError(null)
                                          setDeployWizardStep(3)
                                      }}
                                      style={{
                                          padding: '10px 12px',
                                          borderRadius: 10,
                                          border: `1px solid ${THEME.border}`,
                                          background: THEME.accent,
                                          color: THEME.text,
                                          cursor: !wizardModelId || !wizardModelConfigId || wizardBusy ? 'not-allowed' : 'pointer',
                                          opacity: !wizardModelId || !wizardModelConfigId || wizardBusy ? 0.6 : 1,
                                          fontWeight: 700,
                                      }}
                                  >
                                      Confirm → Backtest / Hyperopt
                                  </button>
                              </div>
                          </div>
                      ) : null}

                      {deployWizardStep === 3 ? (
                          <div style={{ display: 'grid', gap: 10 }}>
                              <div style={{ fontSize: 12, color: THEME.textSecondary }}>
                                                                    Strategy: <span style={{ fontFamily: 'monospace', color: THEME.text }}>{wizardStrategy?.strategy_class || wizardStrategy?.slug || '—'}</span>
                                  {' · '}
                                  Model: <span style={{ fontFamily: 'monospace', color: THEME.text }}>{wizardModel?.name || wizardModel?.slug || '—'}</span>
                              </div>

                              <div style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 12, display: 'grid', gap: 10 }}>
                                  <div style={{ fontWeight: 800 }}>Pairs</div>

                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                          Source
                                          <select
                                              value={wizardPairsSource}
                                              onChange={(e) => setWizardPairsSource(e.target.value as any)}
                                              disabled={wizardPairsBusy || wizardBusy}
                                              style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px' }}
                                          >
                                              <option value="discover">From exchange (live)</option>
                                              <option value="map">Curated list</option>
                                          </select>
                                      </label>

                                      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                          Exchange
                                          <select
                                              value={wizardExchange}
                                              onChange={(e) => setWizardExchange(e.target.value)}
                                              disabled={wizardPairsBusy || wizardBusy || wizardPairsSource !== 'discover'}
                                              style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px' }}
                                          >
                                              {(wizardExchanges.length ? wizardExchanges : [{ exchange: 'binance', kinds: ['spot', 'perp'] }]).map((x) => (
                                                  <option key={x.exchange} value={x.exchange}>
                                                      {x.exchange}
                                                  </option>
                                              ))}
                                          </select>
                                      </label>

                                      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                          Market
                                          <select
                                              value={wizardMarketKind}
                                              onChange={(e) => setWizardMarketKind(e.target.value as any)}
                                              disabled={wizardPairsBusy || wizardBusy || wizardPairsSource !== 'discover'}
                                              style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px' }}
                                          >
                                              <option value="spot">Spot</option>
                                              <option value="perp">Futures (perp)</option>
                                          </select>
                                      </label>

                                      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                          Quote
                                          <input
                                              value={wizardQuote}
                                              onChange={(e) => setWizardQuote(e.target.value)}
                                              placeholder="USDT"
                                              disabled={wizardPairsBusy || wizardBusy || wizardPairsSource !== 'discover'}
                                              style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px', fontFamily: 'monospace' }}
                                          />
                                      </label>
                                  </div>

                                  <input
                                      value={wizardPairsQuery}
                                      onChange={(e) => setWizardPairsQuery(e.target.value)}
                                      placeholder="Search pairs (e.g. BTC/USDT)…"
                                      disabled={wizardPairsBusy || wizardBusy}
                                      style={{
                                          background: THEME.bg,
                                          color: THEME.text,
                                          border: `1px solid ${THEME.border}`,
                                          borderRadius: 10,
                                          padding: '10px 12px',
                                          fontFamily: 'monospace',
                                      }}
                                  />
                                  <div style={{ fontSize: 12, color: THEME.textSecondary }}>
                                      Selected: <span style={{ fontFamily: 'monospace', color: THEME.text }}>{wizardPairs.length}</span>
                                  </div>
                                  <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 10, overflow: 'hidden', background: THEME.bg, maxHeight: 280, overflowY: 'auto' }}>
                                      {wizardPairsBusy ? (
                                          <div style={{ padding: '10px 12px', fontSize: 12, color: THEME.textSecondary }}>Loading pairs…</div>
                                      ) : (
                                          wizardPairsList
                                              .filter((p) => {
                                                  const q = wizardPairsQuery.trim().toLowerCase()
                                                  if (!q) return true
                                                  return (p.pair || '').toLowerCase().includes(q)
                                              })
                                              .slice(0, 250)
                                              .map((p) => {
                                                  const checked = wizardPairs.includes(p.pair)
                                                  return (
                                                      <button
                                                          key={p.pair}
                                                          type="button"
                                                          onClick={() => {
                                                              setWizardPairs((prev) => {
                                                                  if (prev.includes(p.pair)) return prev.filter((x) => x !== p.pair)
                                                                  return [...prev, p.pair]
                                                              })
                                                          }}
                                                          disabled={wizardBusy}
                                                          style={{
                                                              width: '100%',
                                                              textAlign: 'left',
                                                              padding: '10px 12px',
                                                              border: 'none',
                                                              background: checked ? THEME.selection : 'transparent',
                                                              color: THEME.text,
                                                              cursor: wizardBusy ? 'not-allowed' : 'pointer',
                                                              display: 'flex',
                                                              justifyContent: 'space-between',
                                                              gap: 10,
                                                          }}
                                                      >
                                                          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.pair}</span>
                                                          {checked ? <span style={{ fontSize: 11, color: THEME.success, fontWeight: 800 }}>SELECTED</span> : null}
                                                      </button>
                                                  )
                                              })
                                      )}
                                  </div>
                                  <div style={{ fontSize: 11, color: THEME.textSecondary }}>
                                      These pairs are applied into alignment overrides: freqtrade.exchange.pair_whitelist + StaticPairList.
                                  </div>
                              </div>

                              <div style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 12, display: 'grid', gap: 10 }}>
                                  <div style={{ fontWeight: 800 }}>AI Agent (auto-pick settings)</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                          Direction
                                          <select
                                              value={wizardAiDirection}
                                              onChange={(e) => setWizardAiDirection(e.target.value as any)}
                                              disabled={wizardAiBusy || wizardBusy}
                                              style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px' }}
                                          >
                                              <option value="long">Long</option>
                                              <option value="short">Short</option>
                                              <option value="both">Both</option>
                                          </select>
                                      </label>
                                      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                          Horizon
                                          <select
                                              value={wizardAiHorizon}
                                              onChange={(e) => setWizardAiHorizon(e.target.value as any)}
                                              disabled={wizardAiBusy || wizardBusy}
                                              style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px' }}
                                          >
                                              <option value="scalp">Scalp</option>
                                              <option value="mid">Mid</option>
                                              <option value="long">Long</option>
                                          </select>
                                      </label>
                                      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                          Risk
                                          <select
                                              value={wizardAiRisk}
                                              onChange={(e) => setWizardAiRisk(e.target.value as any)}
                                              disabled={wizardAiBusy || wizardBusy}
                                              style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px' }}
                                          >
                                              <option value="low">Low</option>
                                              <option value="balanced">Balanced</option>
                                              <option value="high">High</option>
                                          </select>
                                      </label>
                                  </div>

                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                          Pairs rule
                                          <select
                                              value={wizardAiPairsMode}
                                              onChange={(e) => setWizardAiPairsMode(e.target.value as any)}
                                              disabled={wizardAiBusy || wizardBusy}
                                              style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px' }}
                                          >
                                              <option value="none">None</option>
                                              <option value="top_volume">Top volume (24h)</option>
                                          </select>
                                      </label>
                                      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                          Limit
                                          <input
                                              value={wizardAiPairsLimit}
                                              onChange={(e) => setWizardAiPairsLimit(e.target.value)}
                                              disabled={wizardAiBusy || wizardBusy || wizardAiPairsMode !== 'top_volume'}
                                              placeholder="20"
                                              style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px', opacity: wizardAiPairsMode !== 'top_volume' ? 0.6 : 1 }}
                                          />
                                      </label>
                                  </div>

                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                          Min volume (quote, 24h)
                                          <input
                                              value={wizardAiPairsMinVolumeQuote}
                                              onChange={(e) => setWizardAiPairsMinVolumeQuote(e.target.value)}
                                              disabled={wizardAiBusy || wizardBusy || wizardAiPairsMode !== 'top_volume'}
                                              placeholder="e.g. 1000000"
                                              style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px', opacity: wizardAiPairsMode !== 'top_volume' ? 0.6 : 1 }}
                                          />
                                      </label>
                                      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                          Include (regex)
                                          <input
                                              value={wizardAiPairsInclude}
                                              onChange={(e) => setWizardAiPairsInclude(e.target.value)}
                                              disabled={wizardAiBusy || wizardBusy || wizardAiPairsMode !== 'top_volume'}
                                              placeholder="e.g. USDT$"
                                              style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px', fontFamily: 'monospace', opacity: wizardAiPairsMode !== 'top_volume' ? 0.6 : 1 }}
                                          />
                                      </label>
                                  </div>

                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                          Exclude (regex)
                                          <input
                                              value={wizardAiPairsExclude}
                                              onChange={(e) => setWizardAiPairsExclude(e.target.value)}
                                              disabled={wizardAiBusy || wizardBusy || wizardAiPairsMode !== 'top_volume'}
                                              placeholder="e.g. ^(BTC|ETH)/"
                                              style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px', fontFamily: 'monospace', opacity: wizardAiPairsMode !== 'top_volume' ? 0.6 : 1 }}
                                          />
                                      </label>

                                      <div style={{ display: 'grid', gap: 6 }}>
                                          <div style={{ fontSize: 12, color: THEME.textSecondary }}>Action</div>
                                          <button
                                              type="button"
                                              onClick={() => {
                                                  try {
                                                      if (wizardAiPairsMode !== 'top_volume') return
                                                      const suggested = applyPairsRuleToList(
                                                          {
                                                              method: 'top_volume',
                                                              limit: wizardAiPairsLimit,
                                                              min_volume_quote: wizardAiPairsMinVolumeQuote,
                                                              include: wizardAiPairsInclude,
                                                              exclude: wizardAiPairsExclude,
                                                          },
                                                          wizardPairsList,
                                                          wizardMarketKind,
                                                      )
                                                      if (suggested.length) {
                                                          setWizardPairs(Array.from(new Set(suggested)))
                                                          setWizardAiMsg(`Applied pairs rule: ${suggested.length} pairs`)
                                                      } else {
                                                          setWizardAiMsg('Pairs rule produced 0 pairs (check filters / volume / kind)')
                                                      }
                                                  } catch {
                                                      setWizardAiMsg('Failed to apply pairs rule (invalid regex?)')
                                                  }
                                              }}
                                              disabled={
                                                  wizardAiBusy ||
                                                  wizardBusy ||
                                                  wizardAiPairsMode !== 'top_volume' ||
                                                  !wizardPairsList ||
                                                  wizardPairsList.length === 0
                                              }
                                              style={{
                                                  padding: '10px 12px',
                                                  borderRadius: 10,
                                                  border: `1px solid ${THEME.border}`,
                                                  background: THEME.bg,
                                                  color: THEME.text,
                                                  cursor: wizardAiBusy || wizardBusy ? 'not-allowed' : 'pointer',
                                                  opacity: wizardAiBusy || wizardBusy ? 0.6 : 1,
                                                  fontWeight: 800,
                                              }}
                                          >
                                              Apply rule to pairs
                                          </button>
                                      </div>
                                  </div>

                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                      <div style={{ fontSize: 12, color: THEME.textSecondary }}>
                                          Profile id: <span style={{ fontFamily: 'monospace', color: THEME.text }}>{wizardAiProfile}</span>
                                      </div>
                                      <button
                                          type="button"
                                          onClick={() => void wizardAiAutofill()}
                                          disabled={wizardAiBusy || wizardBusy}
                                          style={{
                                              padding: '10px 12px',
                                              borderRadius: 10,
                                              border: `1px solid ${THEME.border}`,
                                              background: THEME.accent,
                                              color: THEME.text,
                                              cursor: wizardAiBusy || wizardBusy ? 'not-allowed' : 'pointer',
                                              opacity: wizardAiBusy || wizardBusy ? 0.6 : 1,
                                              fontWeight: 800,
                                          }}
                                      >
                                          {wizardAiBusy ? 'Thinking…' : 'AI подобрать настройки'}
                                      </button>
                                  </div>
                                  <div style={{ fontSize: 11, color: THEME.textSecondary }}>
                                      Fills timerange/timeframe/include_timeframes + Backtest advanced + Hyperopt params for this wizard step.
                                  </div>
                                  {wizardAiMsg ? <div style={{ fontSize: 12, color: THEME.text }}>{wizardAiMsg}</div> : null}
                              </div>

                                                            <div style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 12 }}>
                                                                <div style={{ fontWeight: 800, marginBottom: 10 }}>Run parameters</div>
                                                                <TimerangePicker value={wizardTimerange} onChange={setWizardTimerange} label="TIMERANGE" />
                                                                <div style={{ marginTop: 10 }}>
                                                                    <TimerangePresets onPick={setWizardTimerange} />
                                                                </div>

                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                                                                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                        Exchange
                                                                        <input
                                                                            value={wizardExchange}
                                                                            readOnly
                                                                            style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px', fontFamily: 'monospace', opacity: 0.9 }}
                                                                        />
                                                                    </label>
                                                                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                        Trading mode
                                                                        <input
                                                                            value={wizardTradingMode}
                                                                            readOnly
                                                                            style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px', fontFamily: 'monospace', opacity: 0.9 }}
                                                                        />
                                                                    </label>
                                                                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                        Margin mode
                                                                        <select
                                                                            value={wizardMarginMode}
                                                                            onChange={(e) => setWizardMarginMode(e.target.value)}
                                                                            disabled={wizardTradingMode !== 'futures' || wizardBusy}
                                                                            style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px', opacity: wizardTradingMode !== 'futures' ? 0.6 : 1 }}
                                                                        >
                                                                            <option value="">(auto)</option>
                                                                            <option value="isolated">isolated</option>
                                                                            <option value="cross">cross</option>
                                                                        </select>
                                                                    </label>
                                                                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                        Leverage
                                                                        <input
                                                                            value={wizardLeverage}
                                                                            onChange={(e) => setWizardLeverage(e.target.value)}
                                                                            placeholder="5"
                                                                            disabled={wizardTradingMode !== 'futures' || wizardBusy}
                                                                            style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px', fontFamily: 'monospace', opacity: wizardTradingMode !== 'futures' ? 0.6 : 1 }}
                                                                        />
                                                                    </label>
                                                                </div>

                                                                <div style={{ fontSize: 11, color: THEME.textSecondary }}>
                                                                    Spot/Futures selection is driven by the Pairs market (Spot vs Futures/perp). Deposit is controlled by dry_run_wallet / stake_amount in Backtest advanced options.
                                                                </div>

                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                                                                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                        Base timeframe
                                                                        <select
                                                                            value={wizardTimeframe}
                                                                            onChange={(e) => setWizardTimeframe(e.target.value)}
                                                                            style={{
                                                                                background: THEME.bg,
                                                                                color: THEME.text,
                                                                                border: `1px solid ${THEME.border}`,
                                                                                borderRadius: 10,
                                                                                padding: '10px 12px',
                                                                            }}
                                                                        >
                                                                            {TIMEFRAME_OPTIONS.map((t) => (
                                                                                <option key={t} value={t}>
                                                                                    {t}
                                                                                </option>
                                                                            ))}
                                                                        </select>
                                                                    </label>
                                                                    <div style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                        FreqAI include_timeframes
                                                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                                            {TIMEFRAME_OPTIONS.map((t) => {
                                                                                const checked = wizardIncludeTimeframes.includes(t)
                                                                                return (
                                                                                    <label
                                                                                        key={t}
                                                                                        style={{
                                                                                            display: 'flex',
                                                                                            gap: 6,
                                                                                            alignItems: 'center',
                                                                                            cursor: 'pointer',
                                                                                            background: checked ? THEME.selection : 'transparent',
                                                                                            border: `1px solid ${checked ? THEME.accent : THEME.border}`,
                                                                                            padding: '6px 10px',
                                                                                            borderRadius: 8,
                                                                                            fontSize: 12,
                                                                                            color: THEME.text,
                                                                                        }}
                                                                                    >
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={checked}
                                                                                            onChange={(e) => {
                                                                                                if (e.target.checked) setWizardIncludeTimeframes((prev) => (prev.includes(t) ? prev : [...prev, t]))
                                                                                                else setWizardIncludeTimeframes((prev) => prev.filter((x) => x !== t))
                                                                                            }}
                                                                                            style={{ accentColor: THEME.accent }}
                                                                                        />
                                                                                        {t}
                                                                                    </label>
                                                                                )
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <details open style={{ marginTop: 12, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 12, background: THEME.sidebar }}>
                                                                    <summary style={{ cursor: 'pointer', fontWeight: 800, color: THEME.text, fontSize: 12 }}>Backtest advanced options</summary>
                                                                    <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                                            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                                Timeframe detail
                                                                                <select
                                                                                    value={wizardBacktestTimeframeDetail}
                                                                                    onChange={(e) => setWizardBacktestTimeframeDetail(e.target.value)}
                                                                                    style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px' }}
                                                                                >
                                                                                    <option value="">(none)</option>
                                                                                    {TIMEFRAME_OPTIONS.map((t) => (
                                                                                        <option key={t} value={t}>
                                                                                            {t}
                                                                                        </option>
                                                                                    ))}
                                                                                </select>
                                                                            </label>

                                                                            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                                OHLCV data format
                                                                                <input
                                                                                    value={wizardBacktestDataFormatOHLCV}
                                                                                    onChange={(e) => setWizardBacktestDataFormatOHLCV(e.target.value)}
                                                                                    placeholder="(default)"
                                                                                    style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px', fontFamily: 'monospace' }}
                                                                                />
                                                                            </label>
                                                                        </div>

                                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                                            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                                Stake amount
                                                                                <input
                                                                                    value={wizardBacktestStakeAmount}
                                                                                    onChange={(e) => setWizardBacktestStakeAmount(e.target.value)}
                                                                                    placeholder="(config)"
                                                                                    style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px' }}
                                                                                />
                                                                            </label>
                                                                            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                                Max open trades
                                                                                <input
                                                                                    type="number"
                                                                                    step={1}
                                                                                    value={wizardBacktestMaxOpenTrades}
                                                                                    onChange={(e) => setWizardBacktestMaxOpenTrades(e.target.value)}
                                                                                    placeholder="(config)"
                                                                                    style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px' }}
                                                                                />
                                                                            </label>
                                                                        </div>

                                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                                            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                                Fee
                                                                                <input
                                                                                    type="number"
                                                                                    step="0.0001"
                                                                                    value={wizardBacktestFee}
                                                                                    onChange={(e) => setWizardBacktestFee(e.target.value)}
                                                                                    placeholder="(config)"
                                                                                    style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px' }}
                                                                                />
                                                                            </label>
                                                                            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                                Dry-run wallet
                                                                                <input
                                                                                    type="number"
                                                                                    step="0.01"
                                                                                    value={wizardBacktestDryRunWallet}
                                                                                    onChange={(e) => setWizardBacktestDryRunWallet(e.target.value)}
                                                                                    placeholder="(config)"
                                                                                    style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px' }}
                                                                                />
                                                                            </label>
                                                                        </div>

                                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                                            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: THEME.text }}>
                                                                                <input type="checkbox" checked={wizardBacktestEps} onChange={(e) => setWizardBacktestEps(e.target.checked)} style={{ accentColor: THEME.accent }} />
                                                                                --eps
                                                                            </label>
                                                                            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: THEME.text }}>
                                                                                <input type="checkbox" checked={wizardBacktestEnableProtections} onChange={(e) => setWizardBacktestEnableProtections(e.target.checked)} style={{ accentColor: THEME.accent }} />
                                                                                Enable protections
                                                                            </label>
                                                                        </div>

                                                                        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: THEME.text }}>
                                                                            <input type="checkbox" checked={wizardBacktestEnableDynamicPairlist} onChange={(e) => setWizardBacktestEnableDynamicPairlist(e.target.checked)} style={{ accentColor: THEME.accent }} />
                                                                            Enable dynamic pairlist
                                                                        </label>

                                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                                            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                                Export
                                                                                <input
                                                                                    value={wizardBacktestExport}
                                                                                    onChange={(e) => setWizardBacktestExport(e.target.value)}
                                                                                    placeholder="(empty)"
                                                                                    style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px', fontFamily: 'monospace' }}
                                                                                />
                                                                            </label>
                                                                            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                                Breakdown
                                                                                <input
                                                                                    value={wizardBacktestBreakdown}
                                                                                    onChange={(e) => setWizardBacktestBreakdown(e.target.value)}
                                                                                    placeholder="(empty)"
                                                                                    style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px', fontFamily: 'monospace' }}
                                                                                />
                                                                            </label>
                                                                        </div>

                                                                        <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                            Cache
                                                                            <input
                                                                                value={wizardBacktestCache}
                                                                                onChange={(e) => setWizardBacktestCache(e.target.value)}
                                                                                placeholder="(empty)"
                                                                                style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px', fontFamily: 'monospace' }}
                                                                            />
                                                                        </label>

                                                                        <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                            Notes
                                                                            <input
                                                                                value={wizardBacktestNotes}
                                                                                onChange={(e) => setWizardBacktestNotes(e.target.value)}
                                                                                placeholder="(optional)"
                                                                                style={{ background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px' }}
                                                                            />
                                                                        </label>
                                                                    </div>
                                                                </details>
                                                            </div>

                                                            <div style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 12, display: 'grid', gap: 10 }}>
                                                                <div style={{ fontWeight: 800 }}>Hyperopt parameters</div>
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                        Epochs
                                                                        <input
                                                                            type="number"
                                                                            min={1}
                                                                            step={1}
                                                                            value={wizardHyperoptEpochs}
                                                                            onChange={(e) => {
                                                                                const n = parseInt(e.target.value, 10)
                                                                                setWizardHyperoptEpochs(Number.isFinite(n) && n > 0 ? n : 1)
                                                                            }}
                                                                            style={{
                                                                                background: THEME.bg,
                                                                                color: THEME.text,
                                                                                border: `1px solid ${THEME.border}`,
                                                                                borderRadius: 10,
                                                                                padding: '10px 12px',
                                                                            }}
                                                                        />
                                                                    </label>
                                                                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                        Loss
                                                                        <input
                                                                            value={wizardHyperoptLoss}
                                                                            onChange={(e) => setWizardHyperoptLoss(e.target.value)}
                                                                            placeholder="SharpeHyperOptLoss"
                                                                            style={{
                                                                                background: THEME.bg,
                                                                                color: THEME.text,
                                                                                border: `1px solid ${THEME.border}`,
                                                                                borderRadius: 10,
                                                                                padding: '10px 12px',
                                                                                fontFamily: 'monospace',
                                                                            }}
                                                                        />
                                                                    </label>
                                                                </div>

                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: THEME.textSecondary }}>
                                                                        Job workers
                                                                        <input
                                                                            type="number"
                                                                            min={-1}
                                                                            max={32}
                                                                            step={1}
                                                                            value={wizardHyperoptJobWorkers}
                                                                            onChange={(e) => {
                                                                                const n = parseInt(e.target.value, 10)
                                                                                setWizardHyperoptJobWorkers(Number.isFinite(n) ? n : 1)
                                                                            }}
                                                                            style={{
                                                                                background: THEME.bg,
                                                                                color: THEME.text,
                                                                                border: `1px solid ${THEME.border}`,
                                                                                borderRadius: 10,
                                                                                padding: '10px 12px',
                                                                            }}
                                                                        />
                                                                        <div style={{ fontSize: 11, color: THEME.textSecondary }}>
                                                                            1..32 or -1 (auto)
                                                                        </div>
                                                                    </label>
                                                                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: THEME.text, paddingTop: 22 }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={wizardHyperoptDownloadData}
                                                                            onChange={(e) => setWizardHyperoptDownloadData(e.target.checked)}
                                                                            style={{ accentColor: THEME.accent }}
                                                                        />
                                                                        Download missing data before run
                                                                    </label>
                                                                </div>

                                                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                                    {['buy', 'sell', 'roi', 'stoploss', 'trailing', 'protection'].map((s) => {
                                                                        const checked = wizardHyperoptSpaces.includes(s)
                                                                        return (
                                                                            <label
                                                                                key={s}
                                                                                style={{
                                                                                    display: 'flex',
                                                                                    gap: 6,
                                                                                    alignItems: 'center',
                                                                                    cursor: 'pointer',
                                                                                    background: checked ? THEME.selection : 'transparent',
                                                                                    border: `1px solid ${checked ? THEME.accent : THEME.border}`,
                                                                                    padding: '6px 10px',
                                                                                    borderRadius: 8,
                                                                                    fontSize: 13,
                                                                                    color: THEME.text,
                                                                                }}
                                                                            >
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={checked}
                                                                                    onChange={(e) => {
                                                                                        if (e.target.checked) setWizardHyperoptSpaces((prev) => (prev.includes(s) ? prev : [...prev, s]))
                                                                                        else setWizardHyperoptSpaces((prev) => prev.filter((x) => x !== s))
                                                                                    }}
                                                                                    style={{ accentColor: THEME.accent }}
                                                                                />
                                                                                {s}
                                                                            </label>
                                                                        )
                                                                    })}
                                                                </div>
                                                            </div>

                              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                  <button
                                      type="button"
                                      disabled={wizardBusy || !wizardStrategyId || !wizardModelId || !wizardStrategyConfigId || !wizardModelConfigId}
                                                                            onClick={() => void gotoWizardBacktest(true)}
                                      style={{
                                          padding: '10px 12px',
                                          borderRadius: 10,
                                          border: `1px solid ${THEME.border}`,
                                          background: THEME.accent,
                                          color: THEME.text,
                                          cursor: wizardBusy ? 'not-allowed' : 'pointer',
                                          opacity: wizardBusy ? 0.6 : 1,
                                          fontWeight: 700,
                                      }}
                                  >
                                                                            Start Backtest
                                  </button>
                                  <button
                                      type="button"
                                      disabled={wizardBusy || !wizardStrategyId || !wizardModelId || !wizardStrategyConfigId || !wizardModelConfigId}
                                                                            onClick={() => gotoWizardHyperopt(true)}
                                      style={{
                                          padding: '10px 12px',
                                          borderRadius: 10,
                                          border: `1px solid ${THEME.border}`,
                                          background: THEME.sidebar,
                                          color: THEME.text,
                                          cursor: wizardBusy ? 'not-allowed' : 'pointer',
                                          opacity: wizardBusy ? 0.6 : 1,
                                          fontWeight: 700,
                                      }}
                                  >
                                      Start Hyperopt
                                  </button>
                                  <button
                                      type="button"
                                      disabled={wizardBusy}
                                      onClick={() => setDeployWizardStep(2)}
                                      style={{
                                          padding: '10px 12px',
                                          borderRadius: 10,
                                          border: `1px solid ${THEME.border}`,
                                          background: THEME.sidebar,
                                          color: THEME.text,
                                          cursor: wizardBusy ? 'not-allowed' : 'pointer',
                                          opacity: wizardBusy ? 0.6 : 1,
                                      }}
                                  >
                                      ← Back
                                  </button>
                              </div>
                          </div>
                      ) : null}

                      {wizardError ? (
                          <div style={{ fontSize: 12, color: THEME.error }}>{wizardError}</div>
                      ) : null}

                      <div style={{ fontSize: 12, color: THEME.textSecondary }}>
                          Tip: after Backtest/Hyperopt, use the Deploy tab to generate bot + deploy.
                      </div>
                  </div>
              </div>
          ) : null}

          <div style={{ 
              padding: '6px 16px', background: THEME.activityBar, borderBottom: `1px solid ${THEME.border}`,
              fontSize: 12, fontWeight: 'bold', color: THEME.textSecondary, textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap'
          }}>
              <div style={{ minWidth: 0 }}>
                Config ({activeFile?.type === 'json' ? 'JSON' : 'py'})
                {activeFile && ` - ${activeFile.name}`}
                {editorDirty && ' *'}
              </div>
              {activeFile?.type === 'json' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => void handleGenerateConfig()}
                        disabled={configBusy || editorLoading}
                        style={{ ...topMenuButtonStyle, opacity: (configBusy || editorLoading) ? 0.7 : 1 }}
                        title="Generate config.json"
                    >
                        {configBusy ? 'Working...' : 'Generate'}
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleSaveConfigToDb(false)}
                        disabled={configBusy || editorLoading}
                        style={{ ...topMenuButtonStyle, opacity: (configBusy || editorLoading) ? 0.7 : 1 }}
                        title="Save config version to DB"
                    >
                        Save
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleSaveConfigToDb(true)}
                        disabled={configBusy || editorLoading}
                        style={{ ...topMenuButtonStyle, opacity: (configBusy || editorLoading) ? 0.7 : 1 }}
                        title="Save and activate"
                    >
                        Save+Activate
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleActivateLoadedConfig()}
                        disabled={configBusy || editorLoading || !loadedConfigId}
                        style={{ ...topMenuButtonStyle, opacity: (configBusy || editorLoading || !loadedConfigId) ? 0.7 : 1 }}
                        title="Activate last loaded/saved config"
                    >
                        Activate
                    </button>
                    {configError && <span style={{ color: THEME.error, fontSize: 12 }}>{configError}</span>}
                    {configMessage && !configError && <span style={{ color: THEME.success, fontSize: 12 }}>{configMessage}</span>}
                </div>
              )}
          </div>
          
          <div style={{ flex: 1, position: 'relative' }}>
              <textarea 
                  value={editorContent}
                  onChange={e => { setEditorContent(e.target.value); setEditorDirty(true); }}
                  spellCheck={false}
                  style={{
                      width: '100%', height: '100%',
                      background: THEME.bg,
                      color: THEME.text,
                      border: 'none',
                      resize: 'none',
                      padding: 20,
                      fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                      fontSize: 14,
                      lineHeight: 1.5,
                      outline: 'none'
                  }}
               />
               
               {activeFile && editorDirty && activeFile.type === 'python' && (
                   <div style={{ position: 'absolute', top: 10, right: 20 }}>
                       <button onClick={handleSave} style={{ background: THEME.accent, color: 'white', border: 'none', padding: '6px 12px', cursor: 'pointer' }}>
                           {saving ? 'Saving...' : 'Save'}
                       </button>
                   </div>
               )}
          </div>
      </div>
      )}
      
      {/* 
      {hyperoptJobId && (
        <LogViewerModal jobId={hyperoptJobId} onClose={() => setHyperoptJobId(null)} />
      )} 
      */}

      {showHyperoptWizard && activeFile && (
          <HyperoptWizard 
            strategyName={activeFile.name.replace('.py', '')} 
            onClose={() => setShowHyperoptWizard(false)}
            onRun={startHyperoptFromWizard}
          />
      )}
    </div>
  )
}

export default function UniversalEditorPage() {
  const { scope, id, encodedPath } = useParams<{ scope: string, id: string, encodedPath: string }>()
  return <UniversalEditor scope={scope} id={id} initialPath={encodedPath ? decodeURIComponent(encodedPath) : undefined} />
}
