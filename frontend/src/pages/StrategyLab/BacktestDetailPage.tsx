import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

interface BacktestDetail {
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
  
  // Additional fields from full result
  wins?: number
  losses?: number
  draws?: number
  best_pair?: string
  worst_pair?: string
  avg_duration?: string
  max_drawdown_abs?: number
}

interface Trade {
  pair: string
  open_date: string
  close_date: string
  profit_abs: number
  profit_ratio: number
  close_rate: number
  open_rate: number
  amount: number
  trade_duration: number
}

export default function BacktestDetailPage() {
  const { backtestId } = useParams<{ backtestId: string }>()
  const navigate = useNavigate()
  
  const [backtest, setBacktest] = useState<BacktestDetail | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [tradesFilter, setTradesFilter] = useState<'all' | 'wins' | 'losses'>('all')
  const [sortField, setSortField] = useState<'profit' | 'duration' | 'date'>('date')
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    loadBacktestDetail()
  }, [backtestId])

  async function loadBacktestDetail() {
    if (!backtestId) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/strategylab/backtests/${backtestId}`)
      if (!response.ok) throw new Error('Failed to load backtest')
      const data = await response.json()
      setBacktest(data)
      setTrades(data.trades || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load backtest')
    } finally {
      setLoading(false)
    }
  }

  function formatNumber(value: number, decimals: number = 2): string {
    return value.toFixed(decimals)
  }

  function formatPercent(value: number): string {
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
  }

  function formatCurrency(value: number): string {
    return `$${Math.abs(value).toFixed(2)}`
  }

  function getColorForValue(value: number): string {
    if (value > 0) return '#10b981'
    if (value < 0) return '#ef4444'
    return '#94a3b8'
  }

  const filteredTrades = trades
    .filter(t => {
      if (tradesFilter === 'wins') return t.profit_ratio > 0
      if (tradesFilter === 'losses') return t.profit_ratio < 0
      return true
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortField === 'profit') cmp = a.profit_ratio - b.profit_ratio
      else if (sortField === 'duration') cmp = a.trade_duration - b.trade_duration
      else cmp = new Date(a.close_date).getTime() - new Date(b.close_date).getTime()
      return sortAsc ? cmp : -cmp
    })

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
        <div>Loading backtest details...</div>
      </div>
    )
  }

  if (error || !backtest) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ color: '#ef4444', marginBottom: 16 }}>{error || 'Backtest not found'}</div>
        <button onClick={() => navigate(-1)} style={{ padding: '8px 16px', cursor: 'pointer' }}>
          Go Back
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          ← Back
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{backtest.strategy_name}</h1>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            {backtest.pair} • {backtest.timeframe} • {backtest.period}
          </div>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <MetricCard
          label="Total Return"
          value={formatPercent(backtest.total_return)}
          color={getColorForValue(backtest.total_return)}
        />
        <MetricCard
          label="Win Rate"
          value={formatPercent(backtest.win_rate)}
          color={backtest.win_rate > 50 ? '#10b981' : '#ef4444'}
        />
        <MetricCard
          label="Profit Factor"
          value={formatNumber(backtest.profit_factor, 2)}
          color={backtest.profit_factor > 1 ? '#10b981' : '#ef4444'}
        />
        <MetricCard
          label="Max Drawdown"
          value={formatPercent(backtest.max_drawdown)}
          color="#ef4444"
        />
        <MetricCard
          label="Sharpe Ratio"
          value={formatNumber(backtest.sharpe_ratio, 2)}
          color={backtest.sharpe_ratio > 1 ? '#10b981' : '#f59e0b'}
        />
        <MetricCard
          label="Total Trades"
          value={backtest.total_trades.toString()}
          color="var(--muted)"
        />
        <MetricCard
          label="Avg Trade"
          value={formatPercent(backtest.avg_trade)}
          color={getColorForValue(backtest.avg_trade)}
        />
        <MetricCard
          label="Wins / Losses"
          value={`${backtest.wins || 0} / ${backtest.losses || 0}`}
          color="var(--muted)"
        />
      </div>

      {/* Trades Table */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {/* Table Header */}
        <div
          style={{
            padding: '16px 20px',
            background: 'var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            Trades ({filteredTrades.length})
          </div>
          
          {/* Filters */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setTradesFilter('all')}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: tradesFilter === 'all' ? 'var(--primary)' : 'var(--surface)',
                color: tradesFilter === 'all' ? '#fff' : 'inherit',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              All
            </button>
            <button
              onClick={() => setTradesFilter('wins')}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: tradesFilter === 'wins' ? '#10b981' : 'var(--surface)',
                color: tradesFilter === 'wins' ? '#fff' : 'inherit',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Wins
            </button>
            <button
              onClick={() => setTradesFilter('losses')}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: tradesFilter === 'losses' ? '#ef4444' : 'var(--surface)',
                color: tradesFilter === 'losses' ? '#fff' : 'inherit',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Losses
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div style={{ maxHeight: 600, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Pair</th>
                <th style={thStyle}>Open Date</th>
                <th style={thStyle}>Close Date</th>
                <th style={thStyle}>Duration</th>
                <th style={thStyle}>Open Price</th>
                <th style={thStyle}>Close Price</th>
                <th style={thStyle}>Amount</th>
                <th style={thStyle}>Profit %</th>
                <th style={thStyle}>Profit</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.map((trade, idx) => (
                <tr
                  key={idx}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: idx % 2 === 0 ? 'var(--surface)' : 'var(--background)',
                  }}
                >
                  <td style={tdStyle}>{trade.pair}</td>
                  <td style={tdStyle}>{new Date(trade.open_date).toLocaleString()}</td>
                  <td style={tdStyle}>{new Date(trade.close_date).toLocaleString()}</td>
                  <td style={tdStyle}>{formatDuration(trade.trade_duration)}</td>
                  <td style={tdStyle}>{formatCurrency(trade.open_rate)}</td>
                  <td style={tdStyle}>{formatCurrency(trade.close_rate)}</td>
                  <td style={tdStyle}>{formatNumber(trade.amount, 4)}</td>
                  <td style={{ ...tdStyle, color: getColorForValue(trade.profit_ratio * 100), fontWeight: 600 }}>
                    {formatPercent(trade.profit_ratio * 100)}
                  </td>
                  <td style={{ ...tdStyle, color: getColorForValue(trade.profit_abs), fontWeight: 600 }}>
                    {formatCurrency(trade.profit_abs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours < 24) return `${hours}h ${mins}m`
  const days = Math.floor(hours / 24)
  const hrs = hours % 24
  return `${days}d ${hrs}h`
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--muted)',
}

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 13,
}
