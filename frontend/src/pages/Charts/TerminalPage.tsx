import { useEffect, useMemo, useRef, useState } from 'react'

import PageHeader from '../../shared/ui/PageHeader'
import Card from '../../shared/ui/Card'
import { Candle, PairInfo, getAggregateCandles, getCandles, listPairs } from '../../services/api/marketApi'

type IndicatorBundle = {
  emaFast: number[]
  emaSlow: number[]
  macd: number[]
  macdSignal: number[]
  rsi: number[]
  signals: Array<{ idx: number; side: 'buy' | 'sell'; reason: string }>
}

const EXCHANGES = ['binance', 'okx', 'bybit', 'kraken', 'coinbase'] as const
const TIMEFRAMES = ['1s', '5s', '1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d']
const DEFAULT_PAIR = 'BTC/USDT'
const DEFAULT_EXCHANGES = ['binance', 'okx', 'bybit'] as const
const MAX_BACKEND_LIMIT = 200000
const MAX_BACKEND_LIMIT_SUBMINUTE = 5000
const MAX_HISTORY_DAYS = 7300

function pollMsForTimeframe(tf: string) {
  switch (tf) {
    case '1s':
    case '5s':
      return 1000
    case '1m':
      return 5000
    case '5m':
      return 10000
    case '15m':
    case '30m':
      return 15000
    case '1h':
    case '2h':
    case '4h':
      return 30000
    case '1d':
      return 60000
    default:
      return 10000
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

function computeIndicators(candles: Candle[]): IndicatorBundle {
  const closes = candles.map((c) => c.close)

  const ema = (period: number, values: number[]) => {
    const alpha = 2 / (period + 1)
    const out: number[] = []
    values.forEach((v, idx) => {
      if (idx === 0) {
        out.push(v)
      } else {
        out.push(v * alpha + out[idx - 1] * (1 - alpha))
      }
    })
    return out
  }

  const emaFast = ema(8, closes)
  const emaSlow = ema(21, closes)
  const macdLine = emaFast.map((v, idx) => v - emaSlow[idx])
  const macdSignal = ema(9, macdLine)

  const rsi: number[] = []
  let gains = 0
  let losses = 0
  const period = 14
  closes.forEach((v, idx) => {
    if (idx === 0) {
      rsi.push(50)
      return
    }
    const diff = v - closes[idx - 1]
    gains = (gains * (period - 1) + Math.max(diff, 0)) / period
    losses = (losses * (period - 1) + Math.max(-diff, 0)) / period
    const rs = losses === 0 ? 100 : gains / losses
    rsi.push(100 - 100 / (1 + rs))
  })

  const signals: IndicatorBundle['signals'] = []
  for (let i = 2; i < candles.length; i += 1) {
    const crossedUp = macdLine[i - 1] <= macdSignal[i - 1] && macdLine[i] > macdSignal[i]
    const crossedDown = macdLine[i - 1] >= macdSignal[i - 1] && macdLine[i] < macdSignal[i]
    if (crossedUp && rsi[i] < 65) signals.push({ idx: i, side: 'buy', reason: 'MACD cross + RSI relief' })
    if (crossedDown && rsi[i] > 35) signals.push({ idx: i, side: 'sell', reason: 'MACD crossdown + RSI fade' })
  }

  return { emaFast, emaSlow, macd: macdLine, macdSignal, rsi, signals }
}

function formatPrice(v: number) {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatCompact(v?: number | null) {
  if (v === undefined || v === null) return '—'
  const abs = Math.abs(v)
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return v.toFixed(0)
}

function pct(a: number, b: number) {
  return ((a - b) / b) * 100
}

function pctFromHistory(candles: Candle[], stepsBack: number): number {
  if (candles.length <= stepsBack) return 0
  return pct(candles[candles.length - 1].close, candles[candles.length - 1 - stepsBack].close)
}

function binanceSymbolFromPair(pair: string) {
  return pair.replace('/', '').toLowerCase()
}

function pickKrakenWsSymbolFromNative(nativeSymbol: string) {
  // Backend uses kraken REST symbols like XBTUSDT; Kraken WS expects XBT/USDT.
  const upper = nativeSymbol.toUpperCase()
  const quote = upper.endsWith('USDT') ? 'USDT' : upper.endsWith('USD') ? 'USD' : upper.endsWith('USDC') ? 'USDC' : null
  if (!quote) return null
  const base = upper.slice(0, -quote.length)
  if (!base) return null
  return `${base}/${quote}`
}

export default function TerminalPage() {
  const [mode, setMode] = useState<'live' | 'backtest' | 'training'>('live')
  const [marketType, setMarketType] = useState<'perp' | 'spot'>('perp')
  const [volumeFilter, setVolumeFilter] = useState<'all' | 'top' | 'bottom'>('all')
  const [changeFilter, setChangeFilter] = useState<'all' | 'up' | 'down'>('all')
  const [pair, setPair] = useState(DEFAULT_PAIR)
  const [timeframe, setTimeframe] = useState('1m')
  const [showEma, setShowEma] = useState(true)
  const [showMacd, setShowMacd] = useState(true)
  const [showRsi, setShowRsi] = useState(true)

  const [pairs, setPairs] = useState<PairInfo[]>([
    { pair: 'BTC/USDT' },
    { pair: 'ETH/USDT' },
    { pair: 'SOL/USDT' },
  ])
  const [pairsLoading, setPairsLoading] = useState(false)
  const [pairsError, setPairsError] = useState<string | null>(null)

  const [exchange, setExchange] = useState<typeof EXCHANGES[number]>('binance')
  const [aggEnabled, setAggEnabled] = useState(false)
  const [aggExchanges, setAggExchanges] = useState<string[]>([...DEFAULT_EXCHANGES])
  const [historyDays, setHistoryDays] = useState(3)
  const [fetchLimit, setFetchLimit] = useState(500)
  const [visibleDays, setVisibleDays] = useState(2)
  const [viewEndIndex, setViewEndIndex] = useState(0)
  const [pinnedToEnd, setPinnedToEnd] = useState(true)
  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [livePrices, setLivePrices] = useState<Record<string, number>>({})
  const livePricesByExchangeRef = useRef<Record<string, Record<string, number>>>({})
  const wsRefs = useRef<Record<string, WebSocket | null>>({})

  const [wsStatusByExchange, setWsStatusByExchange] = useState<
    Record<string, 'connected' | 'disconnected' | 'connecting'>
  >({})

  const maxBackendLimit = useMemo(
    () => (timeframe === '1s' || timeframe === '5s' ? MAX_BACKEND_LIMIT_SUBMINUTE : MAX_BACKEND_LIMIT),
    [timeframe],
  )

  useEffect(() => {
    let active = true
    const loadPairs = async () => {
      setPairsLoading(true)
      setPairsError(null)
      try {
        const res = await listPairs()
        if (!active) return
        setPairs(res)
        if (res.length && !res.find((p) => p.pair === pair)) {
          setPair(res[0].pair)
        }
      } catch (e) {
        if (!active) return
        setPairsError('Не удалось загрузить пары, использую базовый список')
      } finally {
        if (active) setPairsLoading(false)
      }
    }
    void loadPairs()

    const id = window.setInterval(() => {
      void loadPairs()
    }, 120_000)
    return () => {
      active = false
      window.clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const availableExchanges = useMemo(() => {
    const found = pairs.find((p) => p.pair === pair)
    if (found?.exchanges && found.exchanges.length) return found.exchanges
    return [...EXCHANGES]
  }, [pairs, pair])

  useEffect(() => {
    if (!availableExchanges.includes(exchange)) {
      setExchange(availableExchanges[0] as typeof exchange)
    }
    setAggExchanges((prev) => {
      const next = prev.filter((ex) => availableExchanges.includes(ex))
      if (!next.length) return [availableExchanges[0]]
      return next
    })
  }, [availableExchanges, exchange])

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        if (aggEnabled) {
          const ex = aggExchanges.length > 0 ? aggExchanges : [exchange]
          const res = await getAggregateCandles({ exchanges: ex, pair, timeframe, limit: fetchLimit })
          if (!active) return
          setCandles(res.candles)
        } else {
          const res = await getCandles({ exchange, pair, timeframe, limit: fetchLimit })
          if (!active) return
          setCandles(res.candles)
        }
      } catch (e) {
        if (!active) return
        setError(e instanceof Error ? e.message : 'Failed to load candles')
        setCandles([])
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    if (mode === 'live') {
      const id = window.setInterval(() => {
        void load()
      }, pollMsForTimeframe(timeframe))
      return () => {
        active = false
        window.clearInterval(id)
      }
    }
    return () => {
      active = false
    }
  }, [exchange, aggEnabled, aggExchanges, pair, timeframe, fetchLimit, mode])

  const barsPerDay = useMemo(() => {
    switch (timeframe) {
      case '1s':
        return 86400
      case '5s':
        return 17280
      case '1m':
        return 1440
      case '5m':
        return 288
      case '15m':
        return 96
      case '30m':
        return 48
      case '1h':
        return 24
      case '2h':
        return 12
      case '4h':
        return 6
      case '1d':
        return 1
      default:
        return 1440
    }
  }, [timeframe])

  const historyDayOptions = useMemo(() => {
    const maxDays = Math.max(1, Math.min(MAX_HISTORY_DAYS, Math.floor(maxBackendLimit / barsPerDay)))
    const base = [1, 3, 7, 14, 30, 60, 90, 180, 365, 730, 1825, 3650, 7300]
    return base.filter((d) => d <= maxDays)
  }, [barsPerDay, maxBackendLimit])

  useEffect(() => {
    const maxDays = Math.max(1, Math.min(MAX_HISTORY_DAYS, Math.floor(maxBackendLimit / barsPerDay)))
    if (historyDays > maxDays) {
      setHistoryDays(maxDays)
    }
  }, [barsPerDay, historyDays, maxBackendLimit])

  useEffect(() => {
    const limitFromDays = Math.min(maxBackendLimit, Math.max(barsPerDay, historyDays * barsPerDay))
    setFetchLimit(limitFromDays)
  }, [historyDays, barsPerDay, maxBackendLimit])

  const sliderMaxDays = useMemo(() => {
    const maxBars = Math.min(fetchLimit, candles.length || fetchLimit)
    const days = Math.max(1, Math.floor(maxBars / barsPerDay) || 1)
    return clamp(days, 1, MAX_HISTORY_DAYS)
  }, [fetchLimit, candles, barsPerDay])

  const visibleDayOptions = useMemo(() => {
    const base = [1, 2, 3, 5, 7, 14, 30, 60, 90, 180, 365, 730, 1825, 3650, 7300]
    const opts = base.filter((d) => d <= sliderMaxDays)
    if (sliderMaxDays > 0 && !opts.includes(sliderMaxDays)) opts.push(sliderMaxDays)
    opts.sort((a, b) => a - b)
    return opts
  }, [sliderMaxDays])

  const visibleCount = useMemo(() => {
    const bars = visibleDays * barsPerDay
    return Math.max(1, Math.min(bars, candles.length || bars))
  }, [visibleDays, barsPerDay, candles])

  useEffect(() => {
    setViewEndIndex((prev) => {
      const safePrev = Number.isFinite(prev) ? prev : 0
      if (pinnedToEnd) return candles.length
      return clamp(safePrev, 0, candles.length)
    })
  }, [candles.length, pinnedToEnd])

  useEffect(() => {
    if (visibleDays > sliderMaxDays) {
      setVisibleDays(sliderMaxDays)
    }
  }, [sliderMaxDays, visibleDays])

  const visibleCandles = useMemo(() => {
    if (!candles.length) return []
    const count = Math.max(1, Math.min(visibleCount, candles.length))
    const end = clamp(viewEndIndex || candles.length, count, candles.length)
    const start = Math.max(0, end - count)
    return candles.slice(start, end)
  }, [candles, visibleCount, viewEndIndex])

  const chartDragRef = useRef<{
    active: boolean
    startX: number
    startEnd: number
    startCount: number
  }>({ active: false, startX: 0, startEnd: 0, startCount: 0 })

  const stepOption = (opts: number[], current: number, dir: -1 | 1) => {
    if (!opts.length) return current
    let idx = opts.indexOf(current)
    if (idx < 0) {
      // pick nearest
      let bestIdx = 0
      let bestDist = Infinity
      opts.forEach((v, i) => {
        const dist = Math.abs(v - current)
        if (dist < bestDist) {
          bestDist = dist
          bestIdx = i
        }
      })
      idx = bestIdx
    }
    const nextIdx = clamp(idx + dir, 0, opts.length - 1)
    return opts[nextIdx]
  }

  const onChartWheel = (e: React.WheelEvent) => {
    // Wheel = zoom time scale (days/months/years) by changing Visible days.
    // Keep it simple: zoom in/out steps through Visible day options.
    e.preventDefault()
    const dir: -1 | 1 = e.deltaY < 0 ? -1 : 1
    const next = stepOption(visibleDayOptions, visibleDays, dir)
    if (next !== visibleDays) setVisibleDays(clamp(next, 1, sliderMaxDays))
  }

  const onChartPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const target = e.currentTarget as HTMLElement
    try {
      target.setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    chartDragRef.current = {
      active: true,
      startX: e.clientX,
      startEnd: clamp(viewEndIndex || candles.length, 0, candles.length),
      startCount: Math.max(1, visibleCount),
    }
    setPinnedToEnd(false)
  }

  const onChartPointerMove = (e: React.PointerEvent) => {
    const drag = chartDragRef.current
    if (!drag.active) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const pxPerBar = rect.width > 0 ? rect.width / Math.max(1, drag.startCount) : 1
    const barsDelta = Math.round((e.clientX - drag.startX) / pxPerBar)
    const nextEnd = clamp(drag.startEnd - barsDelta, drag.startCount, candles.length)
    setViewEndIndex(nextEnd)
    setPinnedToEnd(nextEnd >= candles.length)
  }

  const endDrag = (e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement
    try {
      target.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    chartDragRef.current.active = false
  }

  const onChartDoubleClick = () => {
    setPinnedToEnd(true)
    setViewEndIndex(candles.length)
  }

  const width = 960
  const mapX = (idx: number) => (idx / (visibleCandles.length - 1 || 1)) * width

  const timeTicks = useMemo(() => {
    const yearTicks: Array<{ x: number; label: string }> = []
    const monthTicks: Array<{ x: number; label: string }> = []
    const dayTicks: Array<{ x: number; label: string }> = []
    if (!visibleCandles.length) return { yearTicks, monthTicks, dayTicks }
    const minGap = 50
    let lastYearX = -Infinity
    let lastMonthX = -Infinity
    let lastDayX = -Infinity
    visibleCandles.forEach((c, idx) => {
      const x = mapX(idx)
      const d = new Date(c.ts)
      const yearLabel = String(d.getUTCFullYear())
      const monthLabel = `${d.toLocaleString('en-US', { month: 'short' })}`
      const dayLabel = `${String(d.getUTCDate()).padStart(2, '0')} ${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getUTCDay()]}`
      if (idx === 0 || d.getUTCMonth() === 0 && d.getUTCDate() === 1) {
        if (x - lastYearX >= minGap) {
          yearTicks.push({ x, label: yearLabel })
          lastYearX = x
        }
      } else if (d.getUTCMonth() === 0 && x - lastYearX >= minGap) {
        yearTicks.push({ x, label: yearLabel })
        lastYearX = x
      }
      if (idx === 0 || d.getUTCDate() === 1) {
        if (x - lastMonthX >= minGap) {
          monthTicks.push({ x, label: monthLabel })
          lastMonthX = x
        }
      }
      if (x - lastDayX >= minGap) {
        dayTicks.push({ x, label: dayLabel })
        lastDayX = x
      }
    })
    return { yearTicks, monthTicks, dayTicks }
  }, [visibleCandles])

  const indicators = useMemo(
    () =>
      visibleCandles.length
        ? computeIndicators(visibleCandles)
        : { emaFast: [], emaSlow: [], macd: [], macdSignal: [], rsi: [], signals: [] },
    [visibleCandles],
  )
  const last = visibleCandles[visibleCandles.length - 1]
  const visibleStartTs = visibleCandles[0]?.ts
  const visibleEndTs = visibleCandles[visibleCandles.length - 1]?.ts
  const visibleRangeLabel = visibleStartTs && visibleEndTs
    ? `${new Date(visibleStartTs).toISOString().slice(0, 10)} → ${new Date(visibleEndTs).toISOString().slice(0, 10)}`
    : '—'

  const sortedPairs = useMemo(() => [...pairs].sort((a, b) => a.pair.localeCompare(b.pair)), [pairs])
  const filteredPairs = useMemo(() => {
    let filtered = sortedPairs.filter((p) => (p.kinds ?? ['perp', 'spot']).includes(marketType))
    if (!filtered.length) filtered = sortedPairs

    if (changeFilter !== 'all') {
      const withChange = filtered.filter((p) => p.change24hPct !== undefined && p.change24hPct !== null)
      const sortedByChange = [...withChange].sort((a, b) => (b.change24hPct ?? 0) - (a.change24hPct ?? 0))
      const sliceCount = Math.max(10, Math.min(20, sortedByChange.length))
      filtered = changeFilter === 'up'
        ? sortedByChange.slice(0, sliceCount)
        : [...sortedByChange].reverse().slice(0, sliceCount)
    }

    if (volumeFilter !== 'all') {
      const withVol = filtered.filter((p) => p.volume24hQuote !== undefined && p.volume24hQuote !== null)
      const sortedByVolDesc = [...withVol].sort((a, b) => (b.volume24hQuote ?? 0) - (a.volume24hQuote ?? 0))
      const sliceCount = Math.max(10, Math.min(20, sortedByVolDesc.length))
      if (volumeFilter === 'top') {
        filtered = sortedByVolDesc.slice(0, sliceCount)
      } else {
        const sortedByVolAsc = [...sortedByVolDesc].reverse()
        filtered = sortedByVolAsc.slice(0, sliceCount)
      }
    }

    return filtered
  }, [sortedPairs, marketType, changeFilter, volumeFilter])

  // Direct exchange price streams (WebSocket) to reduce backend load.
  // Falls back to backend-provided prices when an exchange doesn't support browser streaming.
  useEffect(() => {
    const activeExchanges = (aggEnabled ? (aggExchanges.length ? aggExchanges : [exchange]) : [exchange])
      .map((e) => String(e).toLowerCase())
      .filter(Boolean)

    const enabled = mode === 'live'
    const pairsToStream = filteredPairs.slice(0, 60)

    // close all existing
    Object.values(wsRefs.current).forEach((ws) => {
      if (!ws) return
      try {
        ws.close()
      } catch {
        // ignore
      }
    })
    wsRefs.current = {}
    livePricesByExchangeRef.current = {}
    setLivePrices({})

    setWsStatusByExchange({})

    if (!enabled || !activeExchanges.length) return

    setWsStatusByExchange(Object.fromEntries(activeExchanges.map((ex) => [ex, 'connecting' as const])))

    const setExStatus = (ex: string, next: 'connected' | 'disconnected' | 'connecting') => {
      setWsStatusByExchange((prev) => {
        if (prev[ex] === next) return prev
        return { ...prev, [ex]: next }
      })
    }

    const publishMerged = () => {
      const merged: Record<string, number> = {}
      pairsToStream.forEach((p) => {
        const prices: number[] = []
        activeExchanges.forEach((ex) => {
          const exMap = livePricesByExchangeRef.current[ex]
          const v = exMap?.[p.pair]
          if (typeof v === 'number' && Number.isFinite(v)) prices.push(v)
        })
        if (!prices.length) return
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length
        merged[p.pair] = avg
      })
      setLivePrices(merged)
    }

    const upsertPrice = (ex: string, normalizedPair: string, price: number) => {
      if (!Number.isFinite(price)) return
      const cur = livePricesByExchangeRef.current
      const exMap = cur[ex] ?? {}
      if (exMap[normalizedPair] === price) return
      livePricesByExchangeRef.current = {
        ...cur,
        [ex]: {
          ...exMap,
          [normalizedPair]: price,
        },
      }
      publishMerged()
    }

    const connectBinance = () => {
      const ex = 'binance'
      if (!activeExchanges.includes(ex)) return
      const symbolToPair: Record<string, string> = {}
      const streams = Array.from(
        new Set(
          pairsToStream
            .map((p) => p.symbols?.[ex] || p.pair.replace('/', ''))
            .map((native) => {
              const sym = String(native).toLowerCase()
              symbolToPair[String(native).toUpperCase()] = pairsToStream.find((p) => (p.symbols?.[ex] || p.pair.replace('/', '')) === native)?.pair ?? ''
              return `${sym}@miniTicker`
            })
            .filter(Boolean),
        ),
      )
      const ws = new WebSocket('wss://stream.binance.com:9443/ws')
      wsRefs.current[ex] = ws
      ws.onopen = () => {
        setExStatus(ex, 'connected')
        ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: streams, id: 1 }))
      }
      ws.onclose = () => setExStatus(ex, 'disconnected')
      ws.onerror = () => setExStatus(ex, 'disconnected')
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as any
          const symbol = typeof msg?.s === 'string' ? msg.s : null
          const closeStr = typeof msg?.c === 'string' ? msg.c : null
          if (!symbol || !closeStr) return
          const normalizedPair = symbolToPair[symbol]
          if (!normalizedPair) return
          upsertPrice(ex, normalizedPair, Number(closeStr))
        } catch {
          // ignore
        }
      }
    }

    const connectOkx = () => {
      const ex = 'okx'
      if (!activeExchanges.includes(ex)) return
      const instToPair: Record<string, string> = {}
      const args = pairsToStream
        .map((p) => p.symbols?.[ex])
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
        .map((instId) => ({ channel: 'tickers', instId }))

      if (!args.length) {
        setExStatus(ex, 'disconnected')
        return
      }
      args.forEach((a) => {
        const pair = pairsToStream.find((p) => p.symbols?.[ex] === a.instId)?.pair
        if (pair) instToPair[a.instId] = pair
      })
      const ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/public')
      wsRefs.current[ex] = ws
      ws.onopen = () => {
        setExStatus(ex, 'connected')
        ws.send(JSON.stringify({ op: 'subscribe', args }))
      }
      ws.onclose = () => setExStatus(ex, 'disconnected')
      ws.onerror = () => setExStatus(ex, 'disconnected')
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as any
          const instId = msg?.arg?.instId
          const lastStr = msg?.data?.[0]?.last
          if (typeof instId !== 'string' || typeof lastStr !== 'string') return
          const normalizedPair = instToPair[instId]
          if (!normalizedPair) return
          upsertPrice(ex, normalizedPair, Number(lastStr))
        } catch {
          // ignore
        }
      }
    }

    const connectBybit = () => {
      const ex = 'bybit'
      if (!activeExchanges.includes(ex)) return
      const symbolToPair: Record<string, string> = {}
      const symbols = pairsToStream
        .map((p) => p.symbols?.[ex])
        .filter((v): v is string => typeof v === 'string' && v.length > 0)

      if (!symbols.length) {
        setExStatus(ex, 'disconnected')
        return
      }
      symbols.forEach((s) => {
        const pair = pairsToStream.find((p) => p.symbols?.[ex] === s)?.pair
        if (pair) symbolToPair[s] = pair
      })
      const args = symbols.map((s) => `tickers.${s}`)
      const url = marketType === 'spot'
        ? 'wss://stream.bybit.com/v5/public/spot'
        : 'wss://stream.bybit.com/v5/public/linear'
      const ws = new WebSocket(url)
      wsRefs.current[ex] = ws
      ws.onopen = () => {
        setExStatus(ex, 'connected')
        ws.send(JSON.stringify({ op: 'subscribe', args }))
      }
      ws.onclose = () => setExStatus(ex, 'disconnected')
      ws.onerror = () => setExStatus(ex, 'disconnected')
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as any
          const topic = typeof msg?.topic === 'string' ? msg.topic : null
          const data = msg?.data
          if (!topic || !data) return
          const sym = topic.startsWith('tickers.') ? topic.slice('tickers.'.length) : null
          if (!sym) return
          const normalizedPair = symbolToPair[sym]
          const lastStr = typeof data?.lastPrice === 'string' ? data.lastPrice : typeof data?.last === 'string' ? data.last : null
          if (!normalizedPair || !lastStr) return
          upsertPrice(ex, normalizedPair, Number(lastStr))
        } catch {
          // ignore
        }
      }
    }

    const connectCoinbase = () => {
      const ex = 'coinbase'
      if (!activeExchanges.includes(ex)) return
      const prodToPair: Record<string, string> = {}
      const productIds = pairsToStream
        .map((p) => p.symbols?.[ex])
        .filter((v): v is string => typeof v === 'string' && v.length > 0)

      if (!productIds.length) {
        setExStatus(ex, 'disconnected')
        return
      }
      productIds.forEach((id) => {
        const pair = pairsToStream.find((p) => p.symbols?.[ex] === id)?.pair
        if (pair) prodToPair[id] = pair
      })
      const ws = new WebSocket('wss://ws-feed.exchange.coinbase.com')
      wsRefs.current[ex] = ws
      ws.onopen = () => {
        setExStatus(ex, 'connected')
        ws.send(
          JSON.stringify({
            type: 'subscribe',
            channels: [{ name: 'ticker', product_ids: productIds }],
          }),
        )
      }
      ws.onclose = () => setExStatus(ex, 'disconnected')
      ws.onerror = () => setExStatus(ex, 'disconnected')
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as any
          if (msg?.type !== 'ticker') return
          const productId = typeof msg?.product_id === 'string' ? msg.product_id : null
          const priceStr = typeof msg?.price === 'string' ? msg.price : null
          if (!productId || !priceStr) return
          const normalizedPair = prodToPair[productId]
          if (!normalizedPair) return
          upsertPrice(ex, normalizedPair, Number(priceStr))
        } catch {
          // ignore
        }
      }
    }

    const connectKraken = () => {
      const ex = 'kraken'
      if (!activeExchanges.includes(ex)) return
      const symToPair: Record<string, string> = {}
      const symbols = pairsToStream
        .map((p) => p.symbols?.[ex])
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
        .map((native) => pickKrakenWsSymbolFromNative(native))
        .filter((v): v is string => typeof v === 'string' && v.length > 0)

      if (!symbols.length) {
        setExStatus(ex, 'disconnected')
        return
      }
      // map ws symbol to normalized pair
      pairsToStream.forEach((p) => {
        const native = p.symbols?.[ex]
        if (!native) return
        const wsSym = pickKrakenWsSymbolFromNative(native)
        if (wsSym) symToPair[wsSym] = p.pair
      })
      const ws = new WebSocket('wss://ws.kraken.com/v2')
      wsRefs.current[ex] = ws
      ws.onopen = () => {
        setExStatus(ex, 'connected')
        ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: symbols } }))
      }
      ws.onclose = () => setExStatus(ex, 'disconnected')
      ws.onerror = () => setExStatus(ex, 'disconnected')
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as any
          if (msg?.channel !== 'ticker' || msg?.type !== 'update') return
          const row = msg?.data?.[0]
          const sym = typeof row?.symbol === 'string' ? row.symbol : null
          const lastStr = typeof row?.last === 'string' ? row.last : null
          if (!sym || !lastStr) return
          const normalizedPair = symToPair[sym]
          if (!normalizedPair) return
          upsertPrice(ex, normalizedPair, Number(lastStr))
        } catch {
          // ignore
        }
      }
    }

    connectBinance()
    connectOkx()
    connectBybit()
    connectCoinbase()
    connectKraken()

    if (!Object.keys(wsRefs.current).length) {
      setWsStatusByExchange({})
    }

    return () => {
      Object.values(wsRefs.current).forEach((ws) => {
        if (!ws) return
        try {
          ws.close()
        } catch {
          // ignore
        }
      })
      wsRefs.current = {}
      livePricesByExchangeRef.current = {}
      setLivePrices({})

      setWsStatusByExchange({})
    }
  }, [mode, exchange, aggEnabled, aggExchanges, filteredPairs, marketType])

  useEffect(() => {
    if (!filteredPairs.find((p) => p.pair === pair) && filteredPairs.length) {
      setPair(filteredPairs[0].pair)
    }
  }, [filteredPairs, pair])

  if (!last) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <PageHeader
          title="Charts · Terminal"
          description="Торговый терминал с сигналами (EMA, MACD, RSI) и панелью для live/бектест/тренировки"
        />
        <Card>
          {error ? `Error: ${error}` : 'Нет данных, выберите параметры'}
        </Card>
      </div>
    )
  }

  const priceMin = Math.min(...visibleCandles.map((c) => c.low))
  const priceMax = Math.max(...visibleCandles.map((c) => c.high))
  const rsiMin = 0
  const rsiMax = 100

  const priceRange = priceMax - priceMin || 1

  const priceHeight = 280
  const macdHeight = 140
  const rsiHeight = 110

  const mapPriceY = (p: number) => priceHeight - ((p - priceMin) / priceRange) * priceHeight
  const mapMacdY = (v: number) => macdHeight / 2 - v * 4
  const mapRsiY = (v: number) => rsiHeight - ((v - rsiMin) / (rsiMax - rsiMin)) * rsiHeight

  const macdRange = indicators.macd.length ? Math.max(...indicators.macd.map((m) => Math.abs(m))) || 1 : 1
  const macdScale = 1 / macdRange
  const candleWidth = Math.max(2, ((width - 40) / Math.max(visibleCandles.length, 1)) * 0.6)

  return (
    <div style={{ display: 'grid', gap: 12, color: 'var(--text)' }}>
      <PageHeader
        title="Charts · Terminal"
        description="Торговый терминал с сигналами (EMA, MACD, RSI) и панелью для live/бектест/тренировки"
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 260px', gap: 12, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Card>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['live', 'backtest', 'training'].map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m as typeof mode)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: mode === m ? 'var(--selected)' : 'var(--surface)',
                        color: 'var(--text)',
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                  {!aggEnabled && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {EXCHANGES.map((ex) => {
                        const supported = availableExchanges.includes(ex)
                        const status = wsStatusByExchange[ex]
                        const dot =
                          mode !== 'live' || !supported
                            ? 'var(--muted)'
                            : status === 'connected'
                              ? 'var(--pos)'
                              : status === 'connecting'
                                ? 'var(--muted)'
                                : 'var(--neg)'
                        return (
                          <button
                            key={ex}
                            onClick={() => supported && setExchange(ex as typeof exchange)}
                            disabled={!supported}
                            style={{
                              padding: '8px 10px',
                              borderRadius: 8,
                              border: '1px solid var(--border)',
                              background: exchange === ex ? 'var(--selected)' : supported ? 'var(--surface)' : 'var(--surface-muted)',
                              color: supported ? 'var(--text)' : 'var(--text-muted-2)',
                              opacity: exchange === ex ? 0.8 : 1,
                              cursor: supported ? 'pointer' : 'not-allowed',
                              position: 'relative',
                            }}
                          >
                            <span
                              title={mode === 'live' && supported ? (status || 'disconnected') : 'offline'}
                              style={{
                                position: 'absolute',
                                top: 6,
                                right: 6,
                                width: 7,
                                height: 7,
                                borderRadius: 99,
                                background: dot,
                                border: '1px solid var(--border)',
                              }}
                            />
                            {ex}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {aggEnabled && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {EXCHANGES.map((ex) => {
                        const supported = availableExchanges.includes(ex)
                        const active = aggExchanges.includes(ex)
                        const status = wsStatusByExchange[ex]
                        const dot =
                          mode !== 'live' || !supported
                            ? 'var(--muted)'
                            : status === 'connected'
                              ? 'var(--pos)'
                              : status === 'connecting'
                                ? 'var(--muted)'
                                : 'var(--neg)'
                        return (
                          <button
                            key={ex}
                            onClick={() =>
                              supported &&
                              setAggExchanges((prev) =>
                                active ? prev.filter((p) => p !== ex) : [...new Set([...prev, ex])],
                              )
                            }
                            disabled={!supported}
                            style={{
                              padding: '8px 10px',
                              borderRadius: 8,
                              border: '1px solid var(--border)',
                              background: !supported ? 'var(--surface-muted)' : active ? 'var(--selected)' : 'var(--surface)',
                              color: !supported ? 'var(--text-muted-2)' : 'var(--text)',
                              opacity: active ? 0.8 : 1,
                              cursor: supported ? 'pointer' : 'not-allowed',
                              position: 'relative',
                            }}
                          >
                            <span
                              title={mode === 'live' && supported ? (status || 'disconnected') : 'offline'}
                              style={{
                                position: 'absolute',
                                top: 6,
                                right: 6,
                                width: 7,
                                height: 7,
                                borderRadius: 99,
                                background: dot,
                                border: '1px solid var(--border)',
                              }}
                            />
                            {ex}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setAggEnabled((v) => !v)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: aggEnabled ? 'var(--selected)' : 'var(--surface)',
                    color: 'var(--text)',
                    opacity: aggEnabled ? 0.85 : 1,
                  }}
                >
                  Aggregate
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{pair}</div>

              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 12, opacity: 0.7 }}>TF</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{timeframe}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {TIMEFRAMES.map((tf) => {
                      const activeEx = aggEnabled ? (aggExchanges.length ? aggExchanges : [exchange]) : [exchange]
                      const subMinute = tf === '1s' || tf === '5s'
                      const binanceOnly = activeEx.length > 0 && activeEx.every((ex) => ex === 'binance')
                      const supported = (!subMinute || binanceOnly) && !(activeEx.includes('coinbase') && (tf === '30m' || tf === '2h'))
                      const active = timeframe === tf
                      return (
                        <button
                          key={tf}
                          onClick={() => supported && setTimeframe(tf)}
                          disabled={!supported}
                          style={{
                            padding: '6px 9px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: !supported ? 'var(--surface-muted)' : active ? 'var(--selected)' : 'var(--surface)',
                            color: !supported ? 'var(--text-muted-2)' : 'var(--text)',
                            opacity: active ? 0.9 : 1,
                            fontSize: 12,
                            cursor: supported ? 'pointer' : 'not-allowed',
                          }}
                          title={!supported ? (subMinute ? '1s/5s доступны только для binance' : 'Не поддерживается для coinbase') : undefined}
                        >
                          {tf}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 12, opacity: 0.7 }}>History</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{historyDays}d</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {historyDayOptions.map((d) => (
                      <button
                        key={d}
                        onClick={() => setHistoryDays(d)}
                        style={{
                          padding: '6px 9px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: historyDays === d ? 'var(--selected)' : 'var(--surface)',
                          color: 'var(--text)',
                          opacity: historyDays === d ? 0.9 : 1,
                          fontSize: 12,
                        }}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 12, opacity: 0.7 }}>Visible</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{visibleDays}d</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {visibleDayOptions.map((d) => (
                      <button
                        key={d}
                        onClick={() => setVisibleDays(clamp(d, 1, sliderMaxDays))}
                        style={{
                          padding: '6px 9px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: visibleDays === d ? 'var(--selected)' : 'var(--surface)',
                          color: 'var(--text)',
                          opacity: visibleDays === d ? 0.9 : 1,
                          fontSize: 12,
                        }}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
                <div style={{ fontWeight: 700, color: 'var(--pos)' }}>${formatPrice(last.close)}</div>
                <div style={{ color: pctFromHistory(visibleCandles, 6) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                  {pctFromHistory(visibleCandles, 6).toFixed(2)}%
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {aggEnabled ? `Agg: ${aggExchanges.join(', ') || exchange}` : `Ex: ${exchange}`}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Range: {visibleRangeLabel}</div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12 }}>
                {(error || pairsError) && <div style={{ color: 'var(--neg)' }}>{error ?? pairsError}</div>}
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ display: 'grid', gap: 12 }}>
              <div
                style={{ overflow: 'hidden', touchAction: 'none' }}
                onWheel={onChartWheel}
                onPointerDown={onChartPointerDown}
                onPointerMove={onChartPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onPointerLeave={endDrag}
                onDoubleClick={onChartDoubleClick}
                title="Wheel = zoom time scale, drag = pan, double click = latest"
              >
                <svg width="100%" viewBox={`0 0 ${width} ${priceHeight + 70}`} style={{ background: 'var(--chart-bg)', borderRadius: 12, padding: 12 }}>
                  <g transform="translate(20 10)">
                    <rect x="0" y="0" width={width - 40} height={priceHeight} fill="url(#grad)" opacity={0.2} />

                    <defs>
                      <linearGradient id="grad" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#1e88e5" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="var(--chart-bg)" stopOpacity="0" />
                      </linearGradient>
                    </defs>

                    <g>
                      {visibleCandles.map((c, idx) => {
                        const x = mapX(idx)
                        const color = c.close >= c.open ? 'var(--up)' : 'var(--down)'
                        const bodyTop = mapPriceY(Math.max(c.open, c.close))
                        const bodyBottom = mapPriceY(Math.min(c.open, c.close))
                        const wickHigh = mapPriceY(c.high)
                        const wickLow = mapPriceY(c.low)
                        return (
                          <g key={c.ts}>
                            <line x1={x} x2={x} y1={wickHigh} y2={wickLow} stroke={color} strokeWidth={1.2} opacity={0.9} />
                            <rect
                              x={x - candleWidth / 2}
                              y={bodyTop}
                              width={candleWidth}
                              height={Math.max(1.5, bodyBottom - bodyTop)}
                              fill={color}
                              opacity={0.9}
                              rx={1}
                            />
                          </g>
                        )
                      })}
                    </g>

                    {showEma && indicators.emaFast.length > 1 && (
                      <polyline
                        fill="none"
                        stroke="#4fc3f7"
                        strokeWidth={1.4}
                        opacity={0.9}
                        points={indicators.emaFast.map((v, idx) => `${mapX(idx)},${mapPriceY(v)}`).join(' ')}
                      />
                    )}
                    {showEma && indicators.emaSlow.length > 1 && (
                      <polyline
                        fill="none"
                        stroke="#f5c16c"
                        strokeWidth={1.4}
                        opacity={0.9}
                        points={indicators.emaSlow.map((v, idx) => `${mapX(idx)},${mapPriceY(v)}`).join(' ')}
                      />
                    )}

                    {indicators.signals.map((s, i) => (
                      <g key={`${s.idx}-${i}`}>
                        <circle cx={mapX(s.idx)} cy={mapPriceY(visibleCandles[s.idx].close)} r={6} fill={s.side === 'buy' ? 'var(--up)' : 'var(--down)'} opacity={0.9} />
                        <text
                          x={mapX(s.idx)}
                          y={mapPriceY(visibleCandles[s.idx].close) - 10}
                          fill="#fff"
                          fontSize={9}
                          textAnchor="middle"
                          opacity={0.85}
                        >
                          {s.side === 'buy' ? 'B' : 'S'}
                        </text>
                      </g>
                    ))}

                    <g transform={`translate(0 ${priceHeight + 20})`}>
                      <line x1="0" x2={width - 40} y1={0} y2={0} stroke="#30415d" strokeWidth={1} />
                      <text x={0} y={-6} fill="#bfcbe5" fontSize={10} textAnchor="start" opacity={0.9}>
                        {visibleStartTs ? new Date(visibleStartTs).toISOString().slice(0, 10) : ''}
                      </text>
                      <text x={width - 40} y={-6} fill="#bfcbe5" fontSize={10} textAnchor="end" opacity={0.9}>
                        {visibleEndTs ? new Date(visibleEndTs).toISOString().slice(0, 10) : ''}
                      </text>
                      {timeTicks.yearTicks.map((t) => (
                        <g key={`y-${t.x}`}>
                          <line x1={t.x} x2={t.x} y1={0} y2={10} stroke="#7e8fb2" strokeWidth={1} opacity={0.9} />
                          <text x={t.x} y={22} fill="#bfcbe5" fontSize={10} textAnchor="middle" opacity={0.95}>
                            {t.label}
                          </text>
                        </g>
                      ))}
                      <g transform="translate(0 24)">
                        <line x1="0" x2={width - 40} y1={0} y2={0} stroke="#30415d" strokeWidth={1} />
                        {timeTicks.monthTicks.map((t) => (
                          <g key={`m-${t.x}`}>
                            <line x1={t.x} x2={t.x} y1={0} y2={8} stroke="#7e8fb2" strokeWidth={1} opacity={0.9} />
                            <text x={t.x} y={18} fill="#bfcbe5" fontSize={10} textAnchor="middle" opacity={0.95}>
                              {t.label}
                            </text>
                          </g>
                        ))}
                      </g>
                      <g transform="translate(0 46)">
                        <line x1="0" x2={width - 40} y1={0} y2={0} stroke="#30415d" strokeWidth={1} />
                        {timeTicks.dayTicks.map((t) => (
                          <g key={`d-${t.x}`}>
                            <line x1={t.x} x2={t.x} y1={0} y2={8} stroke="#7e8fb2" strokeWidth={1} opacity={0.9} />
                            <text x={t.x} y={18} fill="#bfcbe5" fontSize={10} textAnchor="middle" opacity={0.95}>
                              {t.label}
                            </text>
                          </g>
                        ))}
                      </g>
                    </g>
                  </g>
                </svg>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 4px' }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Indicators</span>
                {[{ key: 'EMA 8/21', active: showEma, toggle: () => setShowEma((v) => !v) }, { key: 'MACD', active: showMacd, toggle: () => setShowMacd((v) => !v) }, { key: 'RSI', active: showRsi, toggle: () => setShowRsi((v) => !v) }].map((item) => (
                  <button
                    key={item.key}
                    onClick={item.toggle}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: item.active ? 'var(--selected)' : 'var(--surface)',
                      color: 'var(--text)',
                      opacity: item.active ? 0.9 : 1,
                    }}
                  >
                    {item.key}
                  </button>
                ))}
              </div>

              <Card>
                <div style={{ display: 'grid', gap: 12 }}>
                  <svg width="100%" viewBox={`0 0 ${width} ${macdHeight + rsiHeight + 50}`} style={{ background: 'var(--chart-bg)', borderRadius: 12, padding: 12 }}>
                    <g transform="translate(20 10)">
                      <g>
                        <rect x="0" y="0" width={width - 40} height={macdHeight} fill="#0f1a2c" opacity={0.8} />
                        <text x={6} y={14} fill="#8ea2c8" fontSize={10} opacity={0.8}>
                          MACD
                        </text>
                        {showMacd && (
                          <>
                            <polyline
                              fill="none"
                              stroke="#4fc3f7"
                              strokeWidth={1.5}
                              points={indicators.macd
                                .map((v, idx) => `${mapX(idx)},${mapMacdY(v * macdScale)}`)
                                .join(' ')}
                            />
                            <polyline
                              fill="none"
                              stroke="#ffcc80"
                              strokeWidth={1.2}
                              points={indicators.macdSignal
                                .map((v, idx) => `${mapX(idx)},${mapMacdY(v * macdScale)}`)
                                .join(' ')}
                            />
                          </>
                        )}
                      </g>

                      <g transform={`translate(0 ${macdHeight + 12})`}>
                        <rect x="0" y="0" width={width - 40} height={rsiHeight} fill="#0f1a2c" opacity={0.8} />
                        <text x={6} y={14} fill="#8ea2c8" fontSize={10} opacity={0.8}>
                          RSI
                        </text>
                        {showRsi && (
                          <polyline
                            fill="none"
                            stroke="#81c784"
                            strokeWidth={1.5}
                            points={indicators.rsi.map((v, idx) => `${mapX(idx)},${mapRsiY(v)}`).join(' ')}
                          />
                        )}
                        <line x1="0" x2={width - 40} y1={mapRsiY(70)} y2={mapRsiY(70)} stroke="#ff8a65" strokeDasharray="4 4" strokeWidth={0.8} opacity={0.8} />
                        <line x1="0" x2={width - 40} y1={mapRsiY(30)} y2={mapRsiY(30)} stroke="#4fc3f7" strokeDasharray="4 4" strokeWidth={0.8} opacity={0.8} />
                      </g>

                      <g transform={`translate(0 ${macdHeight + rsiHeight + 26})`}>
                        <line x1="0" x2={width - 40} y1={0} y2={0} stroke="#30415d" strokeWidth={1} />
                        {timeTicks.yearTicks.map((t) => (
                          <g key={`y2-${t.x}`}>
                            <line x1={t.x} x2={t.x} y1={0} y2={8} stroke="#7e8fb2" strokeWidth={1} opacity={0.9} />
                          </g>
                        ))}
                      </g>
                    </g>
                  </svg>
                </div>
              </Card>
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, alignItems: 'start' }}>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontWeight: 700 }}>Signals</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>MACD/RSI derived demo stream</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: 8 }}>Time</th>
                      <th style={{ textAlign: 'left', padding: 8 }}>Side</th>
                      <th style={{ textAlign: 'left', padding: 8 }}>Price</th>
                      <th style={{ textAlign: 'left', padding: 8 }}>Reason</th>
                      <th style={{ textAlign: 'left', padding: 8 }}>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indicators.signals.slice(-14).reverse().map((s, idx) => {
                      const candle = candles[s.idx]
                      return (
                        <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: 8 }}>{new Date(candle.ts).toLocaleTimeString()}</td>
                          <td style={{ padding: 8, color: s.side === 'buy' ? 'var(--pos)' : 'var(--neg)', fontWeight: 600 }}>{s.side}</td>
                          <td style={{ padding: 8 }}>${formatPrice(candle.close)}</td>
                          <td style={{ padding: 8 }}>{s.reason}</td>
                          <td style={{ padding: 8 }}>{Math.max(0.55, Math.random() * 0.9).toFixed(2)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <div style={{ display: 'grid', gap: 12 }}>
              <Card>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{mode === 'backtest' ? 'Backtest snapshot' : mode === 'training' ? 'Training run' : 'Live position'}</div>
                {mode === 'live' && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div>Position: Long {pair}</div>
                    <div>Size: 0.6 BTC</div>
                    <div>Entry: ${formatPrice(last.close * 0.992)}</div>
                    <div>Unrealized PnL: +2.4%</div>
                  </div>
                )}
                {mode === 'backtest' && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div>Period: 30d · {timeframe}</div>
                    <div>Trades: 124 · Winrate 54%</div>
                    <div>Net PnL: +7.8% · Max DD 4.2%</div>
                    <div>PF: 1.62 · Sharpe 1.8</div>
                  </div>
                )}
                {mode === 'training' && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div>Dataset: 180k bars · {timeframe}</div>
                    <div>Loss: 0.124 → 0.087</div>
                    <div>Metric: F1-macro 0.71</div>
                    <div>Checkpoint: model_epoch_14.bin</div>
                  </div>
                )}
              </Card>

              <Card>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Risk & controls</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div>Max position: 1.2 BTC</div>
                  <div>Per-trade risk: 0.6%</div>
                  <div>Slippage model: 2 bps</div>
                  <div>Latency budget: 180 ms</div>
                  <div>Stop/TP: dynamic ATR bands</div>
                </div>
              </Card>
            </div>
          </div>
        </div>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 700 }}>Pairs</div>
            <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {([
                  { key: 'perp', label: 'Perpetual' },
                  { key: 'spot', label: 'Spot' },
                ] as const).map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setMarketType(item.key)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: marketType === item.key ? 'var(--selected)' : 'var(--surface)',
                      color: 'var(--text)',
                      opacity: marketType === item.key ? 0.85 : 1,
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {([
                  { key: 'all', label: 'Vol all' },
                  { key: 'top', label: 'Vol top' },
                  { key: 'bottom', label: 'Vol low' },
                ] as const).map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setVolumeFilter(item.key)}
                    style={{
                      padding: '6px 9px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: volumeFilter === item.key ? 'var(--selected)' : 'var(--surface)',
                      color: 'var(--text)',
                      opacity: volumeFilter === item.key ? 0.85 : 1,
                      fontSize: 11,
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {([
                  { key: 'all', label: 'Δ all' },
                  { key: 'up', label: 'Gainers' },
                  { key: 'down', label: 'Losers' },
                ] as const).map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setChangeFilter(item.key)}
                    style={{
                      padding: '6px 9px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: changeFilter === item.key ? 'var(--selected)' : 'var(--surface)',
                      color: 'var(--text)',
                      opacity: changeFilter === item.key ? 0.85 : 1,
                      fontSize: 11,
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 6, maxHeight: 'calc(100vh - 220px)', overflowY: 'auto', paddingRight: 4 }}>
            {filteredPairs.map((p) => {
              const isActive = p.pair === pair
              let availableForPair: string[]
              if (Array.isArray(p.exchanges)) {
                availableForPair = p.exchanges
              } else if (p.exchanges && typeof p.exchanges === 'object') {
                availableForPair = Object.keys(p.exchanges as Record<string, string>)
              } else {
                availableForPair = [...EXCHANGES]
              }
              const price = livePrices[p.pair] ?? p.last ?? (isActive ? last?.close : undefined)
              const change = p.change24hPct
              const vol = p.volume24hQuote
              return (
                <button
                  key={p.pair}
                  onClick={() => setPair(p.pair)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: isActive ? 'var(--selected)' : 'var(--surface)',
                    color: 'var(--text)',
                    opacity: isActive ? 0.85 : 1,
                  }}
                >
                  <span style={{ display: 'grid', gap: 2, textAlign: 'left' }}>
                    <span>{p.pair}</span>
                    <span style={{ fontSize: 11, opacity: isActive ? 0.9 : 0.75, color: 'var(--muted)' }}>
                      {availableForPair.slice(0, 3).join(' · ')}
                    </span>
                  </span>
                  <span style={{ display: 'grid', justifyItems: 'end' }}>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>
                      {price !== undefined ? `$${price.toFixed(2)}` : '—'}
                    </span>
                    <span style={{ fontSize: 11, color: change ? (change > 0 ? 'var(--pos)' : 'var(--neg)') : 'var(--muted)' }}>
                      {change !== undefined && change !== null ? `${change.toFixed(1)}%` : ''}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Vol {formatCompact(vol)} USDT</span>
                  </span>
                </button>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
