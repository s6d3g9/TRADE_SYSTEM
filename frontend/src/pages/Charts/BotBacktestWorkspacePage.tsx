import { useEffect, useMemo, useState } from 'react'

import Card from '../../shared/ui/Card'
import PageHeader from '../../shared/ui/PageHeader'
import CandleChart from './components/CandleChart'
import { http } from '../../services/httpClient'
import { Candle, getCandles } from '../../services/api/marketApi'

type BotItem = {
  bot_id: string
  name: string
  status: string
  exchange: string
  created_at: string
}

type BotStatus = {
  bot_id: string
  status: string
  container_name?: string | null
}

type TradingBacktest = {
  backtest_id: string
  bot_id?: string | null
  strategy_name: string
  pair: string
  timeframe: string
  status: string
  total_trades: number
  win_rate?: number | string | null
  total_return_percent?: number | string | null
  created_at: string
}

type BacktestTrade = {
  pair?: string
  open_date?: string
  close_date?: string
  open_rate?: number
  close_rate?: number
  profit_abs?: number
  profit_ratio?: number
  is_short?: boolean
  enter_tag?: string
  exit_reason?: string
}

type BacktestDetail = {
  backtest_id: string
  pair: string
  timeframe: string
  status: string
  trades: BacktestTrade[]
}

function asNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export default function BotBacktestWorkspacePage() {
  const [bots, setBots] = useState<BotItem[]>([])
  const [botStatuses, setBotStatuses] = useState<Record<string, BotStatus>>({})
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null)

  const [backtests, setBacktests] = useState<TradingBacktest[]>([])
  const [selectedBacktest, setSelectedBacktest] = useState<TradingBacktest | null>(null)
  const [backtestDetail, setBacktestDetail] = useState<BacktestDetail | null>(null)

  const [exchange, setExchange] = useState('binance')
  const [pair, setPair] = useState('BTC/USDT')
  const [timeframe, setTimeframe] = useState('1h')

  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(true)
  const [runningBotId, setRunningBotId] = useState<string | null>(null)
  const [deployingBotId, setDeployingBotId] = useState<string | null>(null)
  const [stoppingBotId, setStoppingBotId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadBotsAndStatuses() {
    const botsData = await http<BotItem[]>('/trading/bots')
    setBots(botsData)

    const statusMap: Record<string, BotStatus> = {}
    for (const bot of botsData) {
      try {
        statusMap[bot.bot_id] = await http<BotStatus>(`/trading/bots/${encodeURIComponent(bot.bot_id)}/status`)
      } catch {
        statusMap[bot.bot_id] = { bot_id: bot.bot_id, status: bot.status }
      }
    }
    setBotStatuses(statusMap)

    if (!selectedBotId && botsData.length > 0) {
      setSelectedBotId(botsData[0].bot_id)
      setExchange(botsData[0].exchange || 'binance')
    }
  }

  async function loadBacktests(botId: string | null) {
    const query = botId ? `?bot_id=${encodeURIComponent(botId)}&limit=100` : '?limit=100'
    const rows = await http<TradingBacktest[]>(`/trading/backtests${query}`)
    setBacktests(rows)

    if (rows.length > 0) {
      const current = rows[0]
      setSelectedBacktest(current)
    } else {
      setSelectedBacktest(null)
      setBacktestDetail(null)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function init() {
      setLoading(true)
      setError(null)
      try {
        await loadBotsAndStatuses()
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load bots')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedBotId) return
    loadBacktests(selectedBotId).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load backtests'))
  }, [selectedBotId])

  useEffect(() => {
    if (!selectedBacktest) {
      setBacktestDetail(null)
      return
    }

    const currentBacktest = selectedBacktest

    let cancelled = false

    async function loadDetail() {
      try {
        const detail = await http<BacktestDetail>(`/trading/backtests/${encodeURIComponent(currentBacktest.backtest_id)}/detail`)
        if (cancelled) return
        setBacktestDetail(detail)

        const chartPair = detail.pair || currentBacktest.pair || pair
        const chartTimeframe = detail.timeframe || currentBacktest.timeframe || timeframe
        setPair(chartPair)
        setTimeframe(chartTimeframe)

        const candlesRes = await getCandles({
          exchange,
          pair: chartPair,
          timeframe: chartTimeframe,
          limit: 1000,
        })
        if (!cancelled) setCandles(candlesRes.candles)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load backtest detail')
      }
    }

    loadDetail()
    return () => {
      cancelled = true
    }
  }, [selectedBacktest, exchange])

  const indicators = useMemo(() => {
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
    const macd = emaFast.map((v, idx) => v - emaSlow[idx])
    const macdSignal = ema(9, macd)
    const rsi = closes.map(() => 50)

    const signals = (backtestDetail?.trades || []).flatMap((trade) => {
      const out: Array<{ idx: number; side: 'buy' | 'sell'; reason: string; time: number }> = []
      const openTs = trade.open_date ? new Date(trade.open_date).getTime() : null
      const closeTs = trade.close_date ? new Date(trade.close_date).getTime() : null

      if (openTs) {
        const openIdx = candles.findIndex((c) => c.ts >= openTs)
        if (openIdx >= 0) {
          out.push({
            idx: openIdx,
            side: trade.is_short ? 'sell' : 'buy',
            reason: trade.enter_tag || 'Entry',
            time: openTs,
          })
        }
      }

      if (closeTs) {
        const closeIdx = candles.findIndex((c) => c.ts >= closeTs)
        if (closeIdx >= 0) {
          out.push({
            idx: closeIdx,
            side: trade.is_short ? 'buy' : 'sell',
            reason: trade.exit_reason || 'Exit',
            time: closeTs,
          })
        }
      }

      return out
    }).sort((a, b) => a.time - b.time)

    return { emaFast, emaSlow, macd, macdSignal, rsi, signals }
  }, [candles, backtestDetail])

  async function deployBot(botId: string) {
    setDeployingBotId(botId)
    setError(null)
    try {
      await http(`/trading/bots/${encodeURIComponent(botId)}/deploy`, { method: 'POST' })
      await loadBotsAndStatuses()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to deploy bot')
    } finally {
      setDeployingBotId(null)
    }
  }

  async function stopBot(botId: string) {
    setStoppingBotId(botId)
    setError(null)
    try {
      await http(`/trading/bots/${encodeURIComponent(botId)}/stop`, { method: 'POST' })
      await loadBotsAndStatuses()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to stop bot')
    } finally {
      setStoppingBotId(null)
    }
  }

  async function runBacktest(botId: string) {
    setRunningBotId(botId)
    setError(null)
    try {
      const query = new URLSearchParams({ pair, timeframe })
      const created = await http<TradingBacktest>(`/trading/bots/${encodeURIComponent(botId)}/backtests/run?${query.toString()}`, {
        method: 'POST',
      })
      await loadBacktests(botId)
      setSelectedBacktest(created)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run backtest')
    } finally {
      setRunningBotId(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader title="Bots + Backtests Workspace" description="Deploy bot, run backtest, inspect entry/exit deals on chart" />

      {error && (
        <Card>
          <div style={{ color: 'var(--down)', fontSize: 13 }}>❌ {error}</div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 12 }}>
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Bots</div>
          {loading && <div style={{ color: 'var(--muted)', fontSize: 12 }}>Loading bots...</div>}
          {!loading && bots.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 12 }}>No bots found</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bots.map((bot) => {
              const status = botStatuses[bot.bot_id]
              const isSelected = selectedBotId === bot.bot_id
              const isRunning = status?.status === 'running'
              return (
                <div
                  key={bot.bot_id}
                  onClick={() => {
                    setSelectedBotId(bot.bot_id)
                    setExchange(bot.exchange || 'binance')
                  }}
                  style={{
                    border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                    background: isSelected ? 'var(--selected)' : 'var(--surface)',
                    borderRadius: 8,
                    padding: 10,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{bot.name}</div>
                    <div style={{ fontSize: 11, color: isRunning ? 'var(--up)' : 'var(--muted)' }}>
                      {status?.status || bot.status}
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                    {bot.exchange} · {status?.container_name || 'container: n/a'}
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deployBot(bot.bot_id)
                      }}
                      disabled={deployingBotId === bot.bot_id}
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
                    >
                      {deployingBotId === bot.bot_id ? 'Starting...' : 'Start'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        stopBot(bot.bot_id)
                      }}
                      disabled={stoppingBotId === bot.bot_id}
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
                    >
                      {stoppingBotId === bot.bot_id ? 'Stopping...' : 'Stop'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        runBacktest(bot.bot_id)
                      }}
                      disabled={runningBotId === bot.bot_id}
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
                    >
                      {runningBotId === bot.bot_id ? 'Backtest...' : 'Backtest'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Exchange</label>
              <input
                value={exchange}
                onChange={(e) => setExchange(e.target.value)}
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
              />
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Pair</label>
              <input
                value={pair}
                onChange={(e) => setPair(e.target.value)}
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
              />
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>TF</label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
              >
                <option value="5m">5m</option>
                <option value="15m">15m</option>
                <option value="1h">1h</option>
                <option value="4h">4h</option>
                <option value="1d">1d</option>
              </select>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
                Trades: {backtestDetail?.trades?.length || 0}
              </div>
            </div>

            <CandleChart candles={candles} indicators={indicators} showEma={true} showMacd={false} showRsi={false} />
          </Card>

          <Card>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Backtests</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginBottom: 12 }}>
              {backtests.map((bt) => {
                const selected = selectedBacktest?.backtest_id === bt.backtest_id
                return (
                  <div
                    key={bt.backtest_id}
                    onClick={() => setSelectedBacktest(bt)}
                    style={{
                      border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                      background: selected ? 'var(--selected)' : 'var(--surface)',
                      borderRadius: 8,
                      padding: 10,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>{bt.strategy_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{bt.pair} · {bt.timeframe}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      Trades: {bt.total_trades} · WinRate: {asNumber(bt.win_rate).toFixed(1)}%
                    </div>
                    <div style={{ fontSize: 11, color: asNumber(bt.total_return_percent) >= 0 ? 'var(--up)' : 'var(--down)' }}>
                      Return: {asNumber(bt.total_return_percent).toFixed(2)}%
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surface)' }}>
                    <th style={{ textAlign: 'left', padding: 8 }}>Open</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Close</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>Open Rate</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>Close Rate</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>P/L %</th>
                  </tr>
                </thead>
                <tbody>
                  {(backtestDetail?.trades || []).map((trade, idx) => (
                    <tr key={`${trade.open_date || 't'}-${idx}`} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 8 }}>{trade.open_date ? new Date(trade.open_date).toLocaleString() : '—'}</td>
                      <td style={{ padding: 8 }}>{trade.close_date ? new Date(trade.close_date).toLocaleString() : '—'}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{asNumber(trade.open_rate).toFixed(4)}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{asNumber(trade.close_rate).toFixed(4)}</td>
                      <td style={{
                        padding: 8,
                        textAlign: 'right',
                        color: asNumber(trade.profit_ratio) >= 0 ? 'var(--up)' : 'var(--down)',
                      }}>
                        {(asNumber(trade.profit_ratio) * 100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
