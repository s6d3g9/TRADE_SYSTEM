/**
 * Terminal Page - Refactored
 * Professional trading terminal with charts, indicators, and live market data
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import PageHeader from '../../shared/ui/PageHeader'
import Card from '../../shared/ui/Card'
import { Candle, PairInfo, getAggregateCandles, getCandles, listPairs } from '../../services/api/marketApi'
import ChartControls from './components/ChartControls'
import MarketSidebar from './components/MarketSidebar'
import CandleChart from './components/CandleChart'

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
  const intervals: Record<string, number> = {
    '1s': 1000,
    '5s': 1000,
    '1m': 5000,
    '5m': 10000,
    '15m': 15000,
    '30m': 15000,
    '1h': 30000,
    '2h': 30000,
    '4h': 30000,
    '1d': 60000,
  }
  return intervals[tf] || 10000
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

function computeIndicators(candles: Candle[]): IndicatorBundle {
  if (!candles.length) {
    return { emaFast: [], emaSlow: [], macd: [], macdSignal: [], rsi: [], signals: [] }
  }

  const closes = candles.map((c) => c.close)

  const ema = (period: number, values: number[]) => {
    const alpha = 2 / (period + 1)
    const out: number[] = []
    values.forEach((v, idx) => {
      out.push(idx === 0 ? v : v * alpha + out[idx - 1] * (1 - alpha))
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
    if (crossedUp && rsi[i] < 65) signals.push({ idx: i, side: 'buy', reason: 'MACD cross + RSI' })
    if (crossedDown && rsi[i] > 35) signals.push({ idx: i, side: 'sell', reason: 'MACD cross down' })
  }

  return { emaFast, emaSlow, macd: macdLine, macdSignal, rsi, signals }
}

function binanceSymbolFromPair(pair: string) {
  return pair.replace('/', '').toLowerCase()
}

function pickKrakenWsSymbolFromNative(nativeSymbol: string) {
  const upper = nativeSymbol.toUpperCase()
  const quote = upper.endsWith('USDT') ? 'USDT' : upper.endsWith('USD') ? 'USD' : upper.endsWith('USDC') ? 'USDC' : null
  if (!quote) return null
  const base = upper.slice(0, -quote.length)
  if (!base) return null
  return `${base}/${quote}`
}

export default function TerminalPage() {
  // UI State
  const [mode, setMode] = useState<'live' | 'backtest' | 'training'>('live')
  const [marketType, setMarketType] = useState<'perp' | 'spot'>('perp')
  const [volumeFilter, setVolumeFilter] = useState<'all' | 'top' | 'bottom'>('all')
  const [changeFilter, setChangeFilter] = useState<'all' | 'up' | 'down'>('all')

  // Chart State
  const [pair, setPair] = useState(DEFAULT_PAIR)
  const [timeframe, setTimeframe] = useState('1m')
  const [showEma, setShowEma] = useState(true)
  const [showMacd, setShowMacd] = useState(true)
  const [showRsi, setShowRsi] = useState(true)

  // Pairs Data
  const [pairs, setPairs] = useState<PairInfo[]>([])
  const [pairsLoading, setPairsLoading] = useState(false)
  const [pairsError, setPairsError] = useState<string | null>(null)

  // Exchange & Aggregation
  const [exchange, setExchange] = useState<typeof EXCHANGES[number]>('binance')
  const [aggEnabled, setAggEnabled] = useState(false)
  const [aggExchanges, setAggExchanges] = useState<string[]>([...DEFAULT_EXCHANGES])

  // History & View
  const [historyDays, setHistoryDays] = useState(3)
  const [fetchLimit, setFetchLimit] = useState(500)
  const [visibleDays, setVisibleDays] = useState(2)
  const [viewEndIndex, setViewEndIndex] = useState(0)
  const [pinnedToEnd, setPinnedToEnd] = useState(true)

  // Candles & Loading
  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Live Prices
  const [livePrices, setLivePrices] = useState<Record<string, number>>({})
  const livePricesByExchangeRef = useRef<Record<string, Record<string, number>>>({})
  const wsRefs = useRef<Record<string, WebSocket | null>>({})
  const [wsStatusByExchange, setWsStatusByExchange] = useState<Record<string, 'connected' | 'disconnected' | 'connecting'>>({})

  // Chart Dimensions
  const [width, setWidth] = useState(960)
  const chartContainerRef = useRef<HTMLDivElement>(null)

  const maxBackendLimit = useMemo(
    () => (timeframe === '1s' || timeframe === '5s' ? MAX_BACKEND_LIMIT_SUBMINUTE : MAX_BACKEND_LIMIT),
    [timeframe],
  )

  // Load Pairs
  useEffect(() => {
    let active = true
    const loadPairs = async () => {
      setPairsLoading(true)
      setPairsError(null)
      try {
        const res = await listPairs({ source: 'map' })
        if (!active) return
        setPairs(res)
        if (res.length && !res.find((p) => p.pair === pair)) {
          setPair(res[0].pair)
        }
      } catch (e) {
        if (!active) return
        setPairsError('Failed to load pairs')
      } finally {
        if (active) setPairsLoading(false)
      }
    }
    void loadPairs()

    const id = window.setInterval(() => void loadPairs(), 120_000)
    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [])

  // Available Exchanges for Current Pair
  const availableExchanges = useMemo(() => {
    const found = pairs.find((p) => p.pair === pair)
    if (found?.exchanges && found.exchanges.length) return found.exchanges
    return [...EXCHANGES]
  }, [pairs, pair])

  // Adjust Exchange Selection
  useEffect(() => {
    if (!availableExchanges.includes(exchange)) {
      setExchange(availableExchanges[0] as typeof exchange)
    }
    setAggExchanges((prev) => {
      const next = prev.filter((ex) => availableExchanges.includes(ex))
      return next.length ? next : [availableExchanges[0]]
    })
  }, [availableExchanges, exchange])

  // Load Candles
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
      const id = window.setInterval(() => void load(), pollMsForTimeframe(timeframe))
      return () => {
        active = false
        window.clearInterval(id)
      }
    }
    return () => {
      active = false
    }
  }, [exchange, aggEnabled, aggExchanges, pair, timeframe, fetchLimit, mode])

  // Bars Per Day
  const barsPerDay = useMemo(() => {
    const bars: Record<string, number> = {
      '1s': 86400,
      '5s': 17280,
      '1m': 1440,
      '5m': 288,
      '15m': 96,
      '30m': 48,
      '1h': 24,
      '2h': 12,
      '4h': 6,
      '1d': 1,
    }
    return bars[timeframe] || 1440
  }, [timeframe])

  // History Day Options
  const historyDayOptions = useMemo(() => {
    const maxDays = Math.max(1, Math.min(MAX_HISTORY_DAYS, Math.floor(maxBackendLimit / barsPerDay)))
    const base = [1, 3, 7, 14, 30, 60, 90, 180, 365, 730, 1825, 3650, 7300]
    return base.filter((d) => d <= maxDays)
  }, [barsPerDay, maxBackendLimit])

  // Adjust History Days
  useEffect(() => {
    const maxDays = Math.max(1, Math.min(MAX_HISTORY_DAYS, Math.floor(maxBackendLimit / barsPerDay)))
    if (historyDays > maxDays) {
      setHistoryDays(maxDays)
    }
  }, [barsPerDay, historyDays, maxBackendLimit])

  // Update Fetch Limit
  useEffect(() => {
    const limitFromDays = Math.min(maxBackendLimit, Math.max(barsPerDay, historyDays * barsPerDay))
    setFetchLimit(limitFromDays)
  }, [historyDays, barsPerDay, maxBackendLimit])

  // Slider Max Days
  const sliderMaxDays = useMemo(() => {
    const maxBars = Math.min(fetchLimit, candles.length || fetchLimit)
    const days = Math.max(1, Math.floor(maxBars / barsPerDay) || 1)
    return clamp(days, 1, MAX_HISTORY_DAYS)
  }, [fetchLimit, candles, barsPerDay])

  // Visible Day Options
  const visibleDayOptions = useMemo(() => {
    const base = [1, 2, 3, 5, 7, 14, 30, 60, 90, 180, 365, 730, 1825, 3650, 7300]
    const opts = base.filter((d) => d <= sliderMaxDays)
    if (sliderMaxDays > 0 && !opts.includes(sliderMaxDays)) opts.push(sliderMaxDays)
    opts.sort((a, b) => a - b)
    return opts
  }, [sliderMaxDays])

  // Adjust Visible Days
  useEffect(() => {
    if (visibleDays > sliderMaxDays) {
      setVisibleDays(sliderMaxDays)
    }
  }, [visibleDays, sliderMaxDays])

  // Pin to End
  useEffect(() => {
    if (pinnedToEnd) {
      setViewEndIndex(0)
    }
  }, [candles, pinnedToEnd])

  // Chart Width Resize Observer
  useEffect(() => {
    if (!chartContainerRef.current) return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    observer.observe(chartContainerRef.current)
    return () => observer.disconnect()
  }, [])

  // Compute Indicators
  const indicators = useMemo(() => computeIndicators(candles), [candles])

  // Visible Candles
  const visibleBars = useMemo(() => visibleDays * barsPerDay, [visibleDays, barsPerDay])
  const viewStart = useMemo(() => {
    if (!candles.length) return 0
    return Math.max(0, candles.length - visibleBars - viewEndIndex)
  }, [candles, visibleBars, viewEndIndex])
  const viewEnd = useMemo(() => Math.min(candles.length, viewStart + visibleBars), [candles, viewStart, visibleBars])
  const visible = useMemo(() => candles.slice(viewStart, viewEnd), [candles, viewStart, viewEnd])
  const last = candles[candles.length - 1]

  const maxViewEndIndex = useMemo(() => Math.max(0, candles.length - visibleBars), [candles, visibleBars])

  // WebSocket Live Prices (placeholder logic)
  useEffect(() => {
    // WebSocket connection logic would go here
    // For now, using REST polling via candles endpoint
  }, [pair, exchange, aggExchanges, aggEnabled])

  // Chart Interaction Handlers
  const chartDragRef = useRef<{
    active: boolean
    startX: number
    startY: number
    startViewEnd: number
    mode: 'pan' | 'zoom' | 'unset'
  }>({ active: false, startX: 0, startY: 0, startViewEnd: 0, mode: 'unset' })

  const onChartWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (e.deltaY === 0) return

    const direction = e.deltaY > 0 ? 1 : -1
    const visibleOpts = visibleDayOptions
    const currentIdx = visibleOpts.indexOf(visibleDays)
    if (currentIdx < 0) return

    const nextIdx = clamp(currentIdx + direction, 0, visibleOpts.length - 1)
    setVisibleDays(visibleOpts[nextIdx])
  }

  const onChartPointerDown = (e: React.PointerEvent) => {
    chartDragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startViewEnd: viewEndIndex,
      mode: 'unset',
    }
    setPinnedToEnd(false)
  }

  const onChartPointerMove = (e: React.PointerEvent) => {
    const drag = chartDragRef.current
    if (!drag.active) return

    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY

    if (drag.mode === 'unset') {
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        drag.mode = Math.abs(dx) > Math.abs(dy) ? 'pan' : 'zoom'
      }
    }

    if (drag.mode === 'pan') {
      const pixelPerCandle = width / visibleBars
      const deltaCandles = Math.round(-dx / pixelPerCandle)
      const newViewEnd = clamp(drag.startViewEnd + deltaCandles, 0, maxViewEndIndex)
      setViewEndIndex(newViewEnd)
      setPinnedToEnd(newViewEnd === 0)
    } else if (drag.mode === 'zoom') {
      const zoomSensitivity = 0.01
      const deltaZoom = dy * zoomSensitivity
      const newVisibleDays = clamp(visibleDays + deltaZoom, visibleDayOptions[0], sliderMaxDays)
      const closestOption = visibleDayOptions.reduce((prev, curr) =>
        Math.abs(curr - newVisibleDays) < Math.abs(prev - newVisibleDays) ? curr : prev
      )
      setVisibleDays(closestOption)
    }
  }

  const endDrag = () => {
    chartDragRef.current.active = false
  }

  const onChartDoubleClick = () => {
    setPinnedToEnd(true)
    setViewEndIndex(0)
  }

  return (
    <div>
      <PageHeader
        title="Terminal"
        description="Live trading terminal with real-time charts and market data"
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
        {/* Main Chart Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Controls */}
          <Card>
            <ChartControls
              exchange={exchange}
              availableExchanges={availableExchanges}
              onExchangeChange={(ex) => setExchange(ex as typeof EXCHANGES[number])}
              aggEnabled={aggEnabled}
              onAggEnabledChange={setAggEnabled}
              aggExchanges={aggExchanges}
              onAggExchangesChange={setAggExchanges}
              timeframe={timeframe}
              timeframes={TIMEFRAMES}
              onTimeframeChange={setTimeframe}
              historyDays={historyDays}
              historyDayOptions={historyDayOptions}
              onHistoryDaysChange={setHistoryDays}
              visibleDays={visibleDays}
              visibleDayOptions={visibleDayOptions}
              onVisibleDaysChange={setVisibleDays}
              viewEndIndex={viewEndIndex}
              maxViewEndIndex={maxViewEndIndex}
              pinnedToEnd={pinnedToEnd}
              onViewEndIndexChange={setViewEndIndex}
              onPinnedToEndChange={setPinnedToEnd}
              onSliderDrag={(dragging) => {
                if (dragging) setPinnedToEnd(false)
              }}
              mode={mode}
              loading={loading}
              error={error}
              showEma={showEma}
              showMacd={showMacd}
              showRsi={showRsi}
              onShowEmaChange={setShowEma}
              onShowMacdChange={setShowMacd}
              onShowRsiChange={setShowRsi}
            />
          </Card>

          {/* Chart */}
          <Card>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                Loading chart data...
              </div>
            ) : error ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--error)' }}>
                Error: {error}
              </div>
            ) : (
              <CandleChart
                candles={visible}
                indicators={indicators}
                showEma={showEma}
                showMacd={showMacd}
                showRsi={showRsi}
                onWheel={onChartWheel}
                onPointerDown={onChartPointerDown}
                onPointerMove={onChartPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onPointerLeave={endDrag}
                onDoubleClick={onChartDoubleClick}
              />
            )}
          </Card>

          {/* Indicators Panel */}
          {last && (
            <Card>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Last Price</div>
                  <div style={{ fontSize: 20, fontWeight: 600 }}>${last.close.toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Volume</div>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>{last.volume.toFixed(2)}</div>
                </div>
                {showRsi && indicators.rsi.length && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>RSI(14)</div>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>{indicators.rsi[indicators.rsi.length - 1]?.toFixed(1)}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Signals</div>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>{indicators.signals.length}</div>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Market Sidebar */}
        <Card>
          <MarketSidebar
            pairs={pairs}
            selectedPair={pair}
            onPairSelect={setPair}
            marketType={marketType}
            onMarketTypeChange={setMarketType}
            volumeFilter={volumeFilter}
            onVolumeFilterChange={setVolumeFilter}
            changeFilter={changeFilter}
            onChangeFilterChange={setChangeFilter}
            livePrices={livePrices}
            lastCandle={last}
            pairsLoading={pairsLoading}
            pairsError={pairsError}
          />
        </Card>
      </div>
    </div>
  )
}
