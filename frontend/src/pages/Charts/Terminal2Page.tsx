/**
 * Terminal 2 Page - Advanced Trading Terminal
 * Chart always visible, pairs sidebar on right, bots/backtests below
 */

import { useEffect, useState, useMemo } from 'react'
import Card from '../../shared/ui/Card'
import PageHeader from '../../shared/ui/PageHeader'
import { BacktestResult, getBacktestDetail, listBacktests } from '../../services/api/strategylabApi'
import { Candle, getCandles } from '../../services/api/marketApi'
import { fetchExchangePairs } from '../../services/exchangeClients'
import CandleChart from './components/CandleChart'

interface Strategy {
  strategy_id: string
  name: string
  slug: string
  strategy_class: string
  source_url: string
  tags: string[]
  created_at: string
}

interface Alignment {
  alignment_id: string
  strategy_id: string
  model_id: string
  profile: string
  status: string
  created_at: string
  updated_at: string
}

interface Bot {
  bot_id: string
  name: string
  config_path: string
  created_at: string
}

interface Trade {
  open_date: string
  close_date: string
  pair: string
  open_rate: number
  close_rate: number
  profit_abs: number
  profit_ratio: number
  is_short: boolean
  enter_tag?: string
  exit_reason?: string
}

interface BacktestData {
  strategy: Record<string, unknown>
  results_per_pair: Array<{ key: string; trades: number }>
  trades: Trade[]
}

interface PairInfo {
  pair: string
  symbol: string
  baseAsset: string
  quoteAsset: string
  kinds: Array<'perp' | 'spot'>
  lastPrice?: number
  volume24h?: number
  change24hPct?: number
}

const TOP_EXCHANGES = ['binance', 'okx', 'bybit', 'coinbase', 'kraken']

export default function Terminal2Page() {
  // Strategies, Alignments, Bots & Backtests
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [alignments, setAlignments] = useState<Alignment[]>([])
  const [bots, setBots] = useState<Bot[]>([])
  const [backtests, setBacktests] = useState<BacktestResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Selected items
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null)
  const [selectedAlignment, setSelectedAlignment] = useState<Alignment | null>(null)
  const [selectedBacktest, setSelectedBacktest] = useState<BacktestResult | null>(null)
  const [backtestData, setBacktestData] = useState<BacktestData | null>(null)

  // Chart data
  const [candles, setCandles] = useState<Candle[]>([])
  const [candlesLoading, setCandlesLoading] = useState(false)
  const [exchange, setExchange] = useState('binance')
  const [pair, setPair] = useState('BTC/USDT')
  const [timeframe, setTimeframe] = useState('1h')

  // Pairs list
  const [pairs, setPairs] = useState<PairInfo[]>([])
  const [pairsLoading, setPairsLoading] = useState(false)
  const [marketType, setMarketType] = useState<'spot' | 'perp'>('perp')

  // UI state
  const [showEma, setShowEma] = useState(true)
  const [showMacd, setShowMacd] = useState(false)
  const [showRsi, setShowRsi] = useState(false)
  const [activeTab, setActiveTab] = useState<'strategies' | 'alignments' | 'bots' | 'backtests'>('backtests')
  
  // Bot deployment
  const [deployingBot, setDeployingBot] = useState<string | null>(null)
  const [botStatuses, setBotStatuses] = useState<Record<string, any>>({})
  const [togglingBot, setTogglingBot] = useState<string | null>(null)

  // Load strategies, alignments and backtests
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [strategiesRes, alignmentsRes, botsRes, backtestsRes] = await Promise.all([
          fetch('/api/strategylab/strategies?lite=1&limit=200'),
          fetch('/api/strategylab/alignments'),
          fetch('/api/bots'),
          listBacktests({ limit: 100 }),
        ])

        if (!strategiesRes.ok) throw new Error('Failed to load strategies')
        if (!alignmentsRes.ok) throw new Error('Failed to load alignments')
        if (!botsRes.ok) throw new Error('Failed to load bots')
        
        const strategiesData = await strategiesRes.json()
        const alignmentsData = await alignmentsRes.json()
        const botsData = await botsRes.json()

        if (cancelled) return

        setStrategies(strategiesData)
        setAlignments(alignmentsData)
        setBots(botsData)
        setBacktests(backtestsRes.backtests || [])
        
        console.log('Loaded:', strategiesData.length, 'strategies,', alignmentsData.length, 'alignments,', botsData.length, 'bots,', backtestsRes.backtests?.length || 0, 'backtests')
        
        // Load bot statuses
        for (const bot of botsData) {
          try {
            const statusRes = await fetch(`/api/bots/${bot.bot_id}/status`)
            if (statusRes.ok) {
              const statusData = await statusRes.json()
              setBotStatuses(prev => ({ ...prev, [bot.bot_id]: statusData }))
            }
          } catch (e) {
            console.warn(`Failed to load status for bot ${bot.bot_id}:`, e)
          }
        }
      } catch (e) {
        if (cancelled) return
        console.error('Load error:', e)
        setError(e instanceof Error ? e.message : 'Failed to load data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Generate and deploy bot from alignment
  async function generateAndDeployBot(alignmentId: string) {
    setDeployingBot(alignmentId)
    try {
      // Step 1: Generate bot
      const generateRes = await fetch(`/api/strategylab/alignments/${alignmentId}/generate-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      
      if (!generateRes.ok) {
        const error = await generateRes.text()
        throw new Error(`Failed to generate bot: ${error}`)
      }
      
      const { bot_id } = await generateRes.json()
      console.log('Bot generated:', bot_id)
      
      // Step 2: Deploy to docker
      const deployRes = await fetch(`/api/bots/${bot_id}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      
      if (!deployRes.ok) {
        const error = await deployRes.text()
        throw new Error(`Failed to deploy bot: ${error}`)
      }
      
      const deployData = await deployRes.json()
      console.log('Bot deployed:', deployData)
      
      // Update status
      setBotStatuses(prev => ({
        ...prev,
        [alignmentId]: { bot_id, ...deployData },
        [bot_id]: deployData
      }))
      
      // Reload bots list
      const botsRes = await fetch('/api/bots')
      if (botsRes.ok) {
        const botsData = await botsRes.json()
        setBots(botsData)
      }
      
      alert(`✅ Bot deployed successfully!\nContainer: ${deployData.container_name}\nStatus: ${deployData.status}\n\nCheck "Bots" tab to manage it.`)
    } catch (e) {
      console.error('Deploy error:', e)
      alert(`❌ ${e instanceof Error ? e.message : 'Failed to deploy bot'}`)
    } finally {
      setDeployingBot(null)
    }
  }

  // Check bot status
  async function checkBotStatus(alignmentId: string, botId: string) {
    try {
      const res = await fetch(`/api/bots/${botId}/status`)
      if (!res.ok) throw new Error('Failed to get status')
      const data = await res.json()
      
      setBotStatuses(prev => ({
        ...prev,
        [alignmentId]: { bot_id: botId, ...data }
      }))
      
      alert(`📊 Bot Status:\nContainer: ${data.container_name}\nStatus: ${data.status}\n\nLast logs:\n${data.logs?.split('\n').slice(-5).join('\n') || 'No logs'}`)
    } catch (e) {
      alert(`❌ ${e instanceof Error ? e.message : 'Failed to check status'}`)
    }
  }

  // Stop bot
  async function stopBot(alignmentId: string, botId: string) {
    try {
      const res = await fetch(`/api/bots/${botId}/stop`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to stop bot')
      const data = await res.json()
      
      setBotStatuses(prev => ({
        ...prev,
        [alignmentId]: { ...prev[alignmentId], status: 'stopped' }
      }))
      
      alert(`✅ Bot stopped: ${data.status}`)
    } catch (e) {
      alert(`❌ ${e instanceof Error ? e.message : 'Failed to stop bot'}`)
    }
  }

  // Toggle bot (start/stop)
  async function toggleBot(botId: string, currentStatus: string) {
    setTogglingBot(botId)
    try {
      if (currentStatus === 'running') {
        // Stop bot
        const res = await fetch(`/api/bots/${botId}/stop`, { method: 'POST' })
        if (!res.ok) throw new Error('Failed to stop bot')
        
        setBotStatuses(prev => ({
          ...prev,
          [botId]: { ...prev[botId], status: 'stopped' }
        }))
      } else {
        // Deploy/Start bot
        const res = await fetch(`/api/bots/${botId}/deploy`, { method: 'POST' })
        if (!res.ok) {
          const error = await res.text()
          throw new Error(`Failed to deploy bot: ${error}`)
        }
        
        const deployData = await res.json()
        setBotStatuses(prev => ({
          ...prev,
          [botId]: deployData
        }))
      }
    } catch (e) {
      console.error('Toggle error:', e)
      alert(`❌ ${e instanceof Error ? e.message : 'Failed to toggle bot'}`)
    } finally {
      setTogglingBot(null)
    }
  }

  // Load pairs directly from exchange
  useEffect(() => {
    let cancelled = false

    async function loadPairs() {
      setPairsLoading(true)
      try {
        const pairsData = await fetchExchangePairs(exchange, 'USDT')
        if (cancelled) return
        console.log(`Loaded ${pairsData.length} pairs from ${exchange}`)
        setPairs(pairsData)
      } catch (e) {
        console.error('Failed to load pairs:', e)
        if (!cancelled) setPairs([])
      } finally {
        if (!cancelled) setPairsLoading(false)
      }
    }

    loadPairs()
    return () => {
      cancelled = true
    }
  }, [exchange])

  // Load default chart data (always show chart)
  useEffect(() => {
    let cancelled = false

    async function loadDefaultChart() {
      if (selectedBacktest) return

      setCandlesLoading(true)
      try {
        const candlesRes = await getCandles({
          exchange,
          pair,
          timeframe,
          limit: 500,
        })
        if (!cancelled) {
          setCandles(candlesRes.candles)
        }
      } catch (e) {
        console.error('Failed to load default candles:', e)
      } finally {
        if (!cancelled) setCandlesLoading(false)
      }
    }

    loadDefaultChart()

    const interval = setInterval(loadDefaultChart, 30000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [pair, timeframe, exchange, selectedBacktest])

  // Load backtest detail when selected
  useEffect(() => {
    if (!selectedBacktest) {
      setBacktestData(null)
      return
    }

    let cancelled = false

    async function loadDetail() {
      if (!selectedBacktest) return

      try {
        const detail = await getBacktestDetail(selectedBacktest.id)
        if (cancelled) return

        const data = detail.data as unknown as BacktestData
        setBacktestData(data)

        if (data.trades && data.trades.length > 0) {
          const btPair = selectedBacktest.pair || data.trades[0].pair
          setCandlesLoading(true)

          try {
            const candlesRes = await getCandles({
              exchange,
              pair: btPair,
              timeframe: selectedBacktest.timeframe || timeframe,
              limit: 1000,
            })
            if (!cancelled) {
              setCandles(candlesRes.candles)
            }
          } catch (e) {
            console.error('Failed to load candles:', e)
          } finally {
            if (!cancelled) setCandlesLoading(false)
          }
        }
      } catch (e) {
        if (cancelled) return
        console.error('Failed to load backtest detail:', e)
      }
    }

    loadDetail()
    return () => {
      cancelled = true
    }
  }, [selectedBacktest, exchange, timeframe])

  // Generate entry/exit signals from trades
  const tradeSignals = useMemo(() => {
    if (!backtestData?.trades || !candles.length) return []

    const signals: Array<{ idx: number; side: 'buy' | 'sell'; reason: string; time: number }> = []

    backtestData.trades.forEach((trade) => {
      const openTime = new Date(trade.open_date).getTime()
      const closeTime = new Date(trade.close_date).getTime()

      const openIdx = candles.findIndex((c) => c.ts >= openTime)
      const closeIdx = candles.findIndex((c) => c.ts >= closeTime)

      if (openIdx >= 0) {
        signals.push({
          idx: openIdx,
          side: trade.is_short ? 'sell' : 'buy',
          reason: trade.enter_tag || 'Entry',
          time: openTime,
        })
      }

      if (closeIdx >= 0) {
        signals.push({
          idx: closeIdx,
          side: trade.is_short ? 'buy' : 'sell',
          reason: trade.exit_reason || 'Exit',
          time: closeTime,
        })
      }
    })

    return signals.sort((a, b) => a.time - b.time)
  }, [backtestData, candles])

  // Compute indicators
  const indicators = useMemo(() => {
    if (!candles.length) {
      return {
        emaFast: [],
        emaSlow: [],
        macd: [],
        macdSignal: [],
        rsi: [],
        signals: tradeSignals,
      }
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

    return {
      emaFast,
      emaSlow,
      macd: macdLine,
      macdSignal,
      rsi,
      signals: tradeSignals,
    }
  }, [candles, tradeSignals])

  // Filter pairs by market type
  const filteredPairs = useMemo(() => {
    return pairs.filter((p) => p.kinds.includes(marketType))
  }, [pairs, marketType])

  const statsDisplay = useMemo(() => {
    if (!selectedBacktest) return null

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Strategy</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedBacktest.strategy_name}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Trades</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedBacktest.total_trades}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Win Rate</div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: selectedBacktest.win_rate > 50 ? 'var(--up)' : 'var(--down)',
            }}
          >
            {selectedBacktest.win_rate.toFixed(1)}%
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Return</div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: selectedBacktest.total_return > 0 ? 'var(--up)' : 'var(--down)',
            }}
          >
            {selectedBacktest.total_return > 0 ? '+' : ''}
            {selectedBacktest.total_return.toFixed(2)}%
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>PF</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedBacktest.profit_factor.toFixed(2)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Sharpe</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedBacktest.sharpe_ratio.toFixed(2)}</div>
        </div>
      </div>
    )
  }, [selectedBacktest])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader title="Trading Terminal" description="Live charts with backtest visualization" />

      {/* Main Layout: Chart + Pairs Sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 12 }}>
        {/* Left: Chart Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Chart Controls */}
          <Card>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Timeframe selector */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: 11, color: 'var(--muted)' }}>Timeframe:</label>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  disabled={!!selectedBacktest}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: 11,
                  }}
                >
                  <option value="1m">1m</option>
                  <option value="5m">5m</option>
                  <option value="15m">15m</option>
                  <option value="1h">1h</option>
                  <option value="4h">4h</option>
                  <option value="1d">1d</option>
                </select>
              </div>

              {/* Indicators */}
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  alignItems: 'center',
                  paddingLeft: 12,
                  borderLeft: '1px solid var(--border)',
                }}
              >
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Indicators:</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
                  <input type="checkbox" checked={showEma} onChange={(e) => setShowEma(e.target.checked)} />
                  EMA
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
                  <input type="checkbox" checked={showMacd} onChange={(e) => setShowMacd(e.target.checked)} />
                  MACD
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
                  <input type="checkbox" checked={showRsi} onChange={(e) => setShowRsi(e.target.checked)} />
                  RSI
                </label>
              </div>

              {/* Status */}
              <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
                {selectedBacktest ? (
                  <span>📊 Backtest: {tradeSignals.length} signals</span>
                ) : selectedStrategy ? (
                  <span>⚡ Strategy: {selectedStrategy.name}</span>
                ) : selectedAlignment ? (
                  <span>🔗 Alignment: {selectedAlignment.profile}</span>
                ) : (
                  <span>
                    📈 Live: {pair} on {exchange}
                  </span>
                )}
              </div>
            </div>
          </Card>

          {/* Stats */}
          {statsDisplay && <Card>{statsDisplay}</Card>}

          {/* Chart - Always visible */}
          <Card>
            {candlesLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading chart...</div>
            ) : candles.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                <p>No chart data available</p>
              </div>
            ) : (
              <CandleChart
                candles={candles}
                indicators={indicators}
                showEma={showEma}
                showMacd={showMacd}
                showRsi={showRsi}
              />
            )}
          </Card>
        </div>

        {/* Right: Pairs Sidebar */}
        <Card>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Market</div>

          {/* Exchange selector */}
          <select
            value={exchange}
            onChange={(e) => setExchange(e.target.value)}
            disabled={!!selectedBacktest}
            style={{
              width: '100%',
              padding: '8px 10px',
              marginBottom: 8,
              borderRadius: 4,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {TOP_EXCHANGES.map((ex) => (
              <option key={ex} value={ex}>
                {ex.charAt(0).toUpperCase() + ex.slice(1)}
              </option>
            ))}
          </select>

          {/* Market type filter */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            <button
              onClick={() => setMarketType('spot')}
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: 4,
                border: `1px solid ${marketType === 'spot' ? 'var(--primary)' : 'var(--border)'}`,
                background: marketType === 'spot' ? 'var(--selected)' : 'var(--surface)',
                color: 'var(--text)',
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Spot
            </button>
            <button
              onClick={() => setMarketType('perp')}
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: 4,
                border: `1px solid ${marketType === 'perp' ? 'var(--primary)' : 'var(--border)'}`,
                background: marketType === 'perp' ? 'var(--selected)' : 'var(--surface)',
                color: 'var(--text)',
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Perp
            </button>
          </div>

          {/* Pairs list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 600, overflowY: 'auto' }}>
            {pairsLoading && <div style={{ fontSize: 11, color: 'var(--muted)', padding: 8 }}>Loading pairs...</div>}

            {!pairsLoading && filteredPairs.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--muted)', padding: 8 }}>No pairs found</div>
            )}

            {!pairsLoading &&
              filteredPairs.map((p) => (
                <div
                  key={p.pair}
                  onClick={() => {
                    if (!selectedBacktest) {
                      setPair(p.pair)
                    }
                  }}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 4,
                    border: `1px solid ${pair === p.pair ? 'var(--primary)' : 'transparent'}`,
                    background: pair === p.pair ? 'var(--selected)' : 'transparent',
                    cursor: selectedBacktest ? 'not-allowed' : 'pointer',
                    opacity: selectedBacktest ? 0.5 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>{p.pair}</div>
                    {p.lastPrice && (
                      <div style={{ fontSize: 10, color: 'var(--text)' }}>
                        ${p.lastPrice >= 1 ? p.lastPrice.toFixed(2) : p.lastPrice.toFixed(6)}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 9, color: 'var(--muted)' }}>
                      {p.kinds.join(', ')}
                    </div>
                    {p.volume24h && (
                      <div style={{ fontSize: 9, color: 'var(--muted)' }}>
                        {p.volume24h >= 1e9
                          ? `$${(p.volume24h / 1e9).toFixed(1)}B`
                          : p.volume24h >= 1e6
                          ? `$${(p.volume24h / 1e6).toFixed(1)}M`
                          : `$${(p.volume24h / 1e3).toFixed(0)}K`}
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </Card>
      </div>

      {/* Bottom: Strategies, Alignments & Backtests */}
      <Card>
        <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>
          Strategy Lab
        </div>
        
        {/* Tab Selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => setActiveTab('strategies')}
            style={{
              padding: '10px 20px',
              borderRadius: 6,
              border: `1px solid ${activeTab === 'strategies' ? 'var(--primary)' : 'var(--border)'}`,
              background: activeTab === 'strategies' ? 'var(--selected)' : 'var(--surface)',
              color: 'var(--text)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ⚡ Strategies ({strategies.length})
          </button>
          <button
            onClick={() => setActiveTab('alignments')}
            style={{
              padding: '10px 20px',
              borderRadius: 6,
              border: `1px solid ${activeTab === 'alignments' ? 'var(--primary)' : 'var(--border)'}`,
              background: activeTab === 'alignments' ? 'var(--selected)' : 'var(--surface)',
              color: 'var(--text)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            🔗 Alignments ({alignments.length})
          </button>
          <button
            onClick={() => setActiveTab('bots')}
            style={{
              padding: '10px 20px',
              borderRadius: 6,
              border: `1px solid ${activeTab === 'bots' ? 'var(--primary)' : 'var(--border)'}`,
              background: activeTab === 'bots' ? 'var(--selected)' : 'var(--surface)',
              color: 'var(--text)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            🤖 Bots ({bots.length})
          </button>
          <button
            onClick={() => setActiveTab('backtests')}
            style={{
              padding: '10px 20px',
              borderRadius: 6,
              border: `1px solid ${activeTab === 'backtests' ? 'var(--primary)' : 'var(--border)'}`,
              background: activeTab === 'backtests' ? 'var(--selected)' : 'var(--surface)',
              color: 'var(--text)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            📊 Backtests ({backtests.length})
          </button>
        </div>

        {loading && <div style={{ fontSize: 13, color: 'var(--muted)', padding: 20, textAlign: 'center' }}>⏳ Loading strategies, alignments, bots and backtests...</div>}
        {error && <div style={{ fontSize: 13, color: 'var(--error)', padding: 20, textAlign: 'center', background: 'rgba(255,0,0,0.1)', borderRadius: 6 }}>❌ {error}</div>}

        {/* Strategies Grid */}
        {!loading && activeTab === 'strategies' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {strategies.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--muted)', padding: 32, gridColumn: '1 / -1', textAlign: 'center', background: 'var(--surface)', borderRadius: 6 }}>
                ⚡ No strategies found. Import strategies from git first.
              </div>
            )}
            {strategies.map((st) => (
              <div
                key={st.strategy_id}
                onClick={() => setSelectedStrategy(selectedStrategy?.strategy_id === st.strategy_id ? null : st)}
                style={{
                  padding: 16,
                  borderRadius: 8,
                  border: `2px solid ${selectedStrategy?.strategy_id === st.strategy_id ? 'var(--primary)' : 'var(--border)'}`,
                  background: selectedStrategy?.strategy_id === st.strategy_id ? 'var(--selected)' : 'var(--surface)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: selectedStrategy?.strategy_id === st.strategy_id ? '0 4px 12px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>
                  {st.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
                  {st.strategy_class}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8 }}>
                  {st.source_url?.split('/').pop() || 'Unknown source'}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {st.tags?.map(tag => (
                    <span key={tag} style={{ fontSize: 9, padding: '2px 6px', background: 'var(--border)', borderRadius: 3 }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bots Grid */}
        {!loading && activeTab === 'bots' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {bots.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--muted)', padding: 32, gridColumn: '1 / -1', textAlign: 'center', background: 'var(--surface)', borderRadius: 6 }}>
                🤖 No bots found. Generate bots from alignments first.
              </div>
            )}
            {bots.map((bot) => {
              const status = botStatuses[bot.bot_id]
              const isRunning = status?.status === 'running'
              const isToggling = togglingBot === bot.bot_id
              
              return (
                <div
                  key={bot.bot_id}
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    border: `2px solid ${isRunning ? '#4ade80' : 'var(--border)'}`,
                    background: 'var(--surface)',
                    transition: 'all 0.2s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                  }}
                >
                  {/* Bot Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>
                        {bot.name}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>
                        {bot.bot_id.substring(0, 16)}...
                      </div>
                    </div>
                    
                    {/* iOS Toggle Switch */}
                    <label style={{ position: 'relative', display: 'inline-block', width: 51, height: 31, cursor: isToggling ? 'not-allowed' : 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isRunning}
                        disabled={isToggling}
                        onChange={() => toggleBot(bot.bot_id, status?.status || 'stopped')}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: isRunning ? '#4ade80' : '#ccc',
                        borderRadius: 31,
                        transition: '0.3s',
                        opacity: isToggling ? 0.5 : 1,
                      }}>
                        <span style={{
                          position: 'absolute',
                          content: '',
                          height: 27,
                          width: 27,
                          left: isRunning ? 22 : 2,
                          bottom: 2,
                          backgroundColor: 'white',
                          borderRadius: '50%',
                          transition: '0.3s',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                        }} />
                      </span>
                    </label>
                  </div>
                  
                  {/* Status Info */}
                  <div style={{ 
                    padding: '8px 12px', 
                    background: 'var(--border)', 
                    borderRadius: 6, 
                    marginBottom: 12,
                    fontSize: 11 
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--muted)' }}>Status:</span>
                      <span style={{ 
                        fontWeight: 600,
                        color: isRunning ? '#4ade80' : status?.status === 'stopped' ? '#fbbf24' : 'var(--muted)',
                        textTransform: 'uppercase',
                        fontSize: 10,
                      }}>
                        {isToggling ? '⏳ TOGGLING...' : status?.status || 'NOT DEPLOYED'}
                      </span>
                    </div>
                    {status?.container_name && (
                      <div style={{ marginTop: 6, fontSize: 10, color: 'var(--muted)' }}>
                        🐳 {status.container_name}
                      </div>
                    )}
                  </div>
                  
                  {/* Bot Info */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
                    <div>
                      <div style={{ color: 'var(--muted)', marginBottom: 2 }}>Config</div>
                      <div style={{ fontSize: 10, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {bot.config_path.split('/').pop()}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--muted)', marginBottom: 2 }}>Created</div>
                      <div style={{ fontSize: 10 }}>
                        {new Date(bot.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  
                  {/* Action Buttons */}
                  {status?.bot_id && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          checkBotStatus(bot.bot_id, bot.bot_id)
                        }}
                        style={{
                          flex: 1,
                          padding: '8px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--surface)',
                          color: 'var(--text)',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        📊 Logs
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Alignments Grid */}
        {!loading && activeTab === 'alignments' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {alignments.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--muted)', padding: 32, gridColumn: '1 / -1', textAlign: 'center', background: 'var(--surface)', borderRadius: 6 }}>
                🔗 No alignments found. Create strategy+model alignments first.
              </div>
            )}
            {alignments.map((al) => (
              <div
                key={al.alignment_id}
                style={{
                  padding: 16,
                  borderRadius: 8,
                  border: `2px solid ${selectedAlignment?.alignment_id === al.alignment_id ? 'var(--primary)' : 'var(--border)'}`,
                  background: selectedAlignment?.alignment_id === al.alignment_id ? 'var(--selected)' : 'var(--surface)',
                  transition: 'all 0.2s',
                  boxShadow: selectedAlignment?.alignment_id === al.alignment_id ? '0 4px 12px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.05)',
                }}
              >
                <div 
                  onClick={() => setSelectedAlignment(selectedAlignment?.alignment_id === al.alignment_id ? null : al)}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>
                    {al.profile} Alignment
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                    Strategy: {strategies.find(s => s.strategy_id === al.strategy_id)?.name || al.strategy_id.substring(0, 8)}
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>Status</div>
                      <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>
                        {al.status}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>Created</div>
                      <div style={{ fontSize: 12 }}>
                        {new Date(al.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Deployment Status */}
                {botStatuses[al.alignment_id] && (
                  <div style={{ 
                    padding: '8px 12px', 
                    background: 'var(--border)', 
                    borderRadius: 4, 
                    marginBottom: 8,
                    fontSize: 11 
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      🐳 {botStatuses[al.alignment_id].container_name || 'Container'}
                    </div>
                    <div style={{ color: 'var(--muted)' }}>
                      Status: <span style={{ 
                        color: botStatuses[al.alignment_id].status === 'running' ? '#4ade80' : '#fbbf24',
                        fontWeight: 600 
                      }}>
                        {botStatuses[al.alignment_id].status || 'unknown'}
                      </span>
                    </div>
                  </div>
                )}
                
                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      generateAndDeployBot(al.alignment_id)
                    }}
                    disabled={deployingBot === al.alignment_id}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      borderRadius: 6,
                      border: 'none',
                      background: deployingBot === al.alignment_id ? 'var(--muted)' : 'var(--primary)',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: deployingBot === al.alignment_id ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      opacity: deployingBot === al.alignment_id ? 0.6 : 1,
                    }}
                  >
                    {deployingBot === al.alignment_id ? '⏳ Deploying...' : '🚀 Deploy'}
                  </button>
                  
                  {botStatuses[al.alignment_id]?.bot_id && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          checkBotStatus(al.alignment_id, botStatuses[al.alignment_id].bot_id)
                        }}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--surface)',
                          color: 'var(--text)',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        📊
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          stopBot(al.alignment_id, botStatuses[al.alignment_id].bot_id)
                        }}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--surface)',
                          color: '#ef4444',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        ⏹️
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Backtests Grid */}
        {!loading && activeTab === 'backtests' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {backtests.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--muted)', padding: 32, gridColumn: '1 / -1', textAlign: 'center', background: 'var(--surface)', borderRadius: 6 }}>
                📭 No backtests found. Run a backtest in Freqtrade first.
              </div>
            )}
            {backtests.map((bt) => (
              <div
                key={bt.id}
                onClick={() => setSelectedBacktest(selectedBacktest?.id === bt.id ? null : bt)}
                style={{
                  padding: 16,
                  borderRadius: 8,
                  border: `2px solid ${selectedBacktest?.id === bt.id ? 'var(--primary)' : 'var(--border)'}`,
                  background: selectedBacktest?.id === bt.id ? 'var(--selected)' : 'var(--surface)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: selectedBacktest?.id === bt.id ? '0 4px 12px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>
                  {bt.strategy_name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                  {bt.pair} · {bt.timeframe} · {bt.total_trades} trades
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>Return</div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: bt.total_return > 0 ? 'var(--up)' : 'var(--down)',
                      }}
                    >
                      {bt.total_return > 0 ? '+' : ''}
                      {bt.total_return.toFixed(2)}%
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>Win Rate</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>
                      {bt.win_rate.toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>Sharpe</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>
                      {bt.sharpe_ratio.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </Card>
    </div>
  )
}
