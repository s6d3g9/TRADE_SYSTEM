import { useEffect, useMemo, useState } from 'react'

import Card from '../../shared/ui/Card'
import PageHeader from '../../shared/ui/PageHeader'
import CandleChart from './components/CandleChart'
import { fetchExchangePairs } from '../../services/exchangeClients'
import { Candle, getCandles } from '../../services/api/marketApi'
import { http } from '../../services/httpClient'

type BotItem = {
  bot_id: string
  name: string
  status: string
  exchange: string
}

type PairInfo = {
  pair: string
  kinds: Array<'spot' | 'perp'>
  lastPrice?: number
  volume24h?: number
}

type TradingBacktest = {
  backtest_id: string
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
  open_date?: string
  close_date?: string
  open_rate?: number
  close_rate?: number
  profit_ratio?: number
  is_short?: boolean
  enter_tag?: string
  exit_reason?: string
}

type BacktestDetail = {
  backtest_id: string
  pair: string
  timeframe: string
  trades: BacktestTrade[]
}

const EXCHANGES = ['binance', 'okx', 'bybit', 'coinbase', 'kraken']

function asNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export default function BotBacktestWorkspacePage() {
  const [bots, setBots] = useState<BotItem[]>([])
  const [selectedBotId, setSelectedBotId] = useState<string>('')

  const [exchange, setExchange] = useState('binance')
  const [pairs, setPairs] = useState<PairInfo[]>([])
  const [pairSearch, setPairSearch] = useState('')
  const [selectedPairs, setSelectedPairs] = useState<string[]>(['BTC/USDT'])

  const [chartPair, setChartPair] = useState('BTC/USDT')
  const [chartTimeframe, setChartTimeframe] = useState('1h')
  const [candles, setCandles] = useState<Candle[]>([])

  const [timeframe, setTimeframe] = useState('1h')
  const [days, setDays] = useState(30)
  const [stakeAmount, setStakeAmount] = useState('unlimited')
  const [maxOpenTrades, setMaxOpenTrades] = useState(3)
  const [stoploss, setStoploss] = useState('-0.10')
  const [takeProfit, setTakeProfit] = useState('0.15')

  const [backtests, setBacktests] = useState<TradingBacktest[]>([])
  const [selectedBacktestId, setSelectedBacktestId] = useState<string>('')
  const [backtestDetail, setBacktestDetail] = useState<BacktestDetail | null>(null)

  const [loading, setLoading] = useState(true)
  const [pairsLoading, setPairsLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadBots() {
    const botRows = await http<BotItem[]>('/trading/bots')
    setBots(botRows)
    if (!selectedBotId && botRows.length > 0) {
      setSelectedBotId(botRows[0].bot_id)
      if (botRows[0].exchange) setExchange(botRows[0].exchange)
    }
  }

  async function loadBacktests(botId: string) {
    const rows = await http<TradingBacktest[]>(`/trading/backtests?bot_id=${encodeURIComponent(botId)}&limit=100`)
    setBacktests(rows)
  }

  useEffect(() => {
    let cancelled = false

    async function init() {
      setLoading(true)
      setError(null)
      try {
        await loadBots()
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
    let cancelled = false
    async function loadPairs() {
      setPairsLoading(true)
      try {
        const list = await fetchExchangePairs(exchange, 'USDT')
        if (cancelled) return
        setPairs(list)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load pairs')
      } finally {
        if (!cancelled) setPairsLoading(false)
      }
    }

    loadPairs()
    return () => {
      cancelled = true
    }
  }, [exchange])

  useEffect(() => {
    let cancelled = false

    async function loadChart() {
      try {
        const res = await getCandles({ exchange, pair: chartPair, timeframe: chartTimeframe, limit: 800 })
        if (!cancelled) setCandles(res.candles)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load chart')
      }
    }

    loadChart()
    return () => {
      cancelled = true
    }
  }, [exchange, chartPair, chartTimeframe])

  useEffect(() => {
    if (!selectedBacktestId) {
      setBacktestDetail(null)
      return
    }

    let cancelled = false

    async function loadDetail() {
      try {
        const detail = await http<BacktestDetail>(`/trading/backtests/${encodeURIComponent(selectedBacktestId)}/detail`)
        if (cancelled) return
        setBacktestDetail(detail)
        if (detail.pair) setChartPair(detail.pair)
        if (detail.timeframe) setChartTimeframe(detail.timeframe)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load backtest detail')
      }
    }

    loadDetail()
    return () => {
      cancelled = true
    }
  }, [selectedBacktestId])

  const filteredPairs = useMemo(() => {
    const search = pairSearch.trim().toLowerCase()
    if (!search) return pairs.slice(0, 200)
    return pairs.filter((item) => item.pair.toLowerCase().includes(search)).slice(0, 200)
  }, [pairs, pairSearch])

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

    const signals = (backtestDetail?.trades || [])
      .flatMap((trade) => {
        const out: Array<{ idx: number; side: 'buy' | 'sell'; reason: string; time: number }> = []
        const openTs = trade.open_date ? new Date(trade.open_date).getTime() : null
        const closeTs = trade.close_date ? new Date(trade.close_date).getTime() : null

        if (openTs) {
          const openIdx = candles.findIndex((c) => c.ts >= openTs)
          if (openIdx >= 0) {
            out.push({ idx: openIdx, side: trade.is_short ? 'sell' : 'buy', reason: trade.enter_tag || 'Entry', time: openTs })
          }
        }
        if (closeTs) {
          const closeIdx = candles.findIndex((c) => c.ts >= closeTs)
          if (closeIdx >= 0) {
            out.push({ idx: closeIdx, side: trade.is_short ? 'buy' : 'sell', reason: trade.exit_reason || 'Exit', time: closeTs })
          }
        }
        return out
      })
      .sort((a, b) => a.time - b.time)

    return {
      emaFast,
      emaSlow,
      macd: emaFast.map((v, idx) => v - emaSlow[idx]),
      macdSignal: emaFast.map(() => 0),
      rsi: closes.map(() => 50),
      signals,
    }
  }, [candles, backtestDetail])

  function togglePair(nextPair: string) {
    setSelectedPairs((prev) => {
      const exists = prev.includes(nextPair)
      if (exists) {
        const out = prev.filter((item) => item !== nextPair)
        if (chartPair === nextPair && out.length > 0) setChartPair(out[0])
        return out
      }
      return [...prev, nextPair]
    })
    setChartPair(nextPair)
  }

  async function runBacktestSet() {
    if (!selectedBotId) {
      setError('Выбери бота для запуска бэктеста')
      return
    }
    if (selectedPairs.length === 0) {
      setError('Выбери хотя бы одну торговую пару')
      return
    }

    setError(null)
    setRunning(true)
    try {
      for (const runPair of selectedPairs) {
        const query = new URLSearchParams({
          pair: runPair,
          timeframe,
          days: String(Math.max(days, 1)),
        })
        await http<TradingBacktest>(`/trading/bots/${encodeURIComponent(selectedBotId)}/backtests/run?${query.toString()}`, {
          method: 'POST',
        })
      }
      await loadBacktests(selectedBotId)
      setSelectedBacktestId('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backtest run failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader title="Backtest Builder" description="График, выбор биржи и набора пар, параметры стратегии и запуск бэктеста" />

      {error && (
        <Card>
          <div style={{ color: 'var(--down)', fontSize: 13 }}>❌ {error}</div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 12 }}>
        <Card>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Пара графика</label>
            <input
              value={chartPair}
              onChange={(e) => setChartPair(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            />
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>ТФ графика</label>
            <select
              value={chartTimeframe}
              onChange={(e) => setChartTimeframe(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            >
              <option value="5m">5m</option>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
            </select>
            <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
              Выбрано пар: {selectedPairs.length}
            </div>
          </div>
          <CandleChart candles={candles} indicators={indicators} showEma={true} showMacd={false} showRsi={false} />
        </Card>

        <Card>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Биржа и торговые пары</div>

          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Биржа</label>
          <select
            value={exchange}
            onChange={(e) => setExchange(e.target.value)}
            style={{ width: '100%', marginTop: 4, marginBottom: 8, padding: '8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
          >
            {EXCHANGES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>

          <input
            value={pairSearch}
            onChange={(e) => setPairSearch(e.target.value)}
            placeholder="Поиск пары, например BTC"
            style={{ width: '100%', marginBottom: 8, padding: '8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
          />

          <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 6 }}>
            {pairsLoading && <div style={{ fontSize: 12, color: 'var(--muted)', padding: 6 }}>Загружаю пары...</div>}
            {!pairsLoading && filteredPairs.map((item) => {
              const checked = selectedPairs.includes(item.pair)
              return (
                <label
                  key={item.pair}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer', borderRadius: 6, background: checked ? 'var(--selected)' : 'transparent' }}
                >
                  <input type="checkbox" checked={checked} onChange={() => togglePair(item.pair)} />
                  <span style={{ fontSize: 12, flex: 1 }}>{item.pair}</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{item.kinds.join(',')}</span>
                </label>
              )
            })}
          </div>

          <div style={{ marginTop: 8, fontSize: 12 }}>
            <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Набор бэктеста:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selectedPairs.map((item) => (
                <button
                  key={item}
                  onClick={() => togglePair(item)}
                  style={{ padding: '4px 8px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
                >
                  {item} ×
                </button>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Параметры бэктеста и стратегии</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Бот</div>
            <select
              value={selectedBotId}
              onChange={(e) => setSelectedBotId(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            >
              <option value="">Выбери бота</option>
              {bots.map((bot) => (
                <option key={bot.bot_id} value={bot.bot_id}>{bot.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>ТФ бэктеста</div>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            >
              <option value="5m">5m</option>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Период (дней)</div>
            <input
              type="number"
              value={days}
              onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
              style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Stake amount</div>
            <input
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Max open trades</div>
            <input
              type="number"
              value={maxOpenTrades}
              onChange={(e) => setMaxOpenTrades(Math.max(1, Number(e.target.value) || 1))}
              style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Stoploss</div>
            <input
              value={stoploss}
              onChange={(e) => setStoploss(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Take profit</div>
            <input
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button
              onClick={runBacktestSet}
              disabled={running || loading}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: running ? 'not-allowed' : 'pointer', opacity: running ? 0.7 : 1 }}
            >
              {running ? '⏳ Запускаю...' : `🚀 Запустить бэктест набора (${selectedPairs.length})`}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
          Параметры стратегии доступны для настройки на странице; в текущем MVP API запуска использует ключевые поля: пары, timeframe и период.
        </div>
      </Card>

      <Card>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>История бэктестов</div>
        <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface)' }}>
                <th style={{ textAlign: 'left', padding: 8 }}>Дата</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Pair</th>
                <th style={{ textAlign: 'left', padding: 8 }}>TF</th>
                <th style={{ textAlign: 'right', padding: 8 }}>Trades</th>
                <th style={{ textAlign: 'right', padding: 8 }}>Win %</th>
                <th style={{ textAlign: 'right', padding: 8 }}>Return %</th>
              </tr>
            </thead>
            <tbody>
              {backtests.map((item) => {
                const selected = selectedBacktestId === item.backtest_id
                return (
                  <tr
                    key={item.backtest_id}
                    onClick={() => setSelectedBacktestId(item.backtest_id)}
                    style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: selected ? 'var(--selected)' : 'transparent' }}
                  >
                    <td style={{ padding: 8 }}>{new Date(item.created_at).toLocaleString()}</td>
                    <td style={{ padding: 8 }}>{item.pair}</td>
                    <td style={{ padding: 8 }}>{item.timeframe}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{item.total_trades}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{asNumber(item.win_rate).toFixed(1)}</td>
                    <td style={{ padding: 8, textAlign: 'right', color: asNumber(item.total_return_percent) >= 0 ? 'var(--up)' : 'var(--down)' }}>
                      {asNumber(item.total_return_percent).toFixed(2)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
