import { useEffect, useMemo, useState } from 'react'

import PageHeader from '../../shared/ui/PageHeader'
import Card from '../../shared/ui/Card'
import ErrorBanner from '../../shared/ui/ErrorBanner'
import { formatFixed, toFiniteNumber } from '../../shared/utils/numberFormat'
import { listBacktests, type BacktestResult } from '../../services/api/strategylabApi'

export default function BenchmarkPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [items, setItems] = useState<BacktestResult[]>([])
  const [total, setTotal] = useState(0)
  const [limit, setLimit] = useState(200)

  const canReload = useMemo(() => !loading, [loading])

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function reload() {
    setLoading(true)
    setError(null)
    try {
      const res = await listBacktests({ limit })
      setItems(res.backtests || [])
      setTotal(res.total || 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load backtests')
    } finally {
      setLoading(false)
    }
  }

  function fmtDate(createdAt: number): string {
    const v = toFiniteNumber(createdAt) ?? Number.NaN
    if (!Number.isFinite(v) || v <= 0) return '—'
    try {
      return new Date(v * 1000).toLocaleString()
    } catch {
      return '—'
    }
  }

  const sorted = useMemo(() => {
    const copy = [...items]
    copy.sort((a, b) => (toFiniteNumber(b.created_at) || 0) - (toFiniteNumber(a.created_at) || 0))
    return copy
  }, [items])

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PageHeader title="StrategyLab · Benchmark" description="Backtests produced by Freqtrade (backtest_results)" />

      {error && <ErrorBanner message={error} onRetry={() => void reload()} />}

      <Card>
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontWeight: 700 }}>Backtests</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Total: {total}</div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>Limit</span>
              <input
                value={String(limit)}
                onChange={(e) => setLimit(Math.max(1, Math.min(1000, Number(e.target.value) || 200)))}
                style={{ width: 120 }}
              />
            </label>

            <button
              onClick={() => void reload()}
              disabled={!canReload}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                cursor: canReload ? 'pointer' : 'not-allowed',
              }}
            >
              {loading ? 'Loading…' : 'Reload'}
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 8px' }}>Date</th>
                <th style={{ padding: '10px 8px' }}>Strategy</th>
                <th style={{ padding: '10px 8px' }}>Pair</th>
                <th style={{ padding: '10px 8px' }}>TF</th>
                <th style={{ padding: '10px 8px' }}>Return</th>
                <th style={{ padding: '10px 8px' }}>Sharpe</th>
                <th style={{ padding: '10px 8px' }}>Trades</th>
                <th style={{ padding: '10px 8px' }}>Win%</th>
                <th style={{ padding: '10px 8px' }}>File</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 14, opacity: 0.75 }}>
                    {loading ? 'Loading…' : 'No backtests found. Run a backtest first.'}
                  </td>
                </tr>
              ) : (
                sorted.map((bt) => (
                  <tr key={bt.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{fmtDate(bt.created_at)}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <a href={`/strategylab/backtests/${encodeURIComponent(bt.id)}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                        {bt.strategy_name || '—'}
                      </a>
                    </td>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{bt.pair || '—'}</td>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{bt.timeframe || '—'}</td>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{formatFixed(toFiniteNumber(bt.total_return), 2)}%</td>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{formatFixed(toFiniteNumber(bt.sharpe_ratio), 2)}</td>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{String(bt.total_trades ?? '—')}</td>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{formatFixed(toFiniteNumber(bt.win_rate), 2)}%</td>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap', opacity: 0.85 }}>{bt.filename || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
