/**
 * Market Sidebar Component
 * Displays live pairs list with filters and real-time prices
 */

import { PairInfo } from '../../../services/api/marketApi'

interface MarketSidebarProps {
  pairs: PairInfo[]
  selectedPair: string
  onPairSelect: (pair: string) => void

  // Filters
  marketType: 'perp' | 'spot'
  onMarketTypeChange: (type: 'perp' | 'spot') => void
  volumeFilter: 'all' | 'top' | 'bottom'
  onVolumeFilterChange: (filter: 'all' | 'top' | 'bottom') => void
  changeFilter: 'all' | 'up' | 'down'
  onChangeFilterChange: (filter: 'all' | 'up' | 'down') => void

  // Live data
  livePrices: Record<string, number>
  lastCandle?: { close: number }

  // Meta
  pairsLoading: boolean
  pairsError: string | null
}

function formatPrice(v?: number | null) {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  const maximumFractionDigits = abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : abs >= 0.0001 ? 6 : 8
  return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits })
}

function formatCompact(v?: number | null) {
  if (v === undefined || v === null) return '—'
  const abs = Math.abs(v)
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return v.toFixed(0)
}

export default function MarketSidebar(props: MarketSidebarProps) {
  // Filter pairs
  const filtered = props.pairs
    .filter((p) => {
      if (props.marketType && p.kinds && Array.isArray(p.kinds)) {
        if (!p.kinds.includes(props.marketType)) return false
      }
      if (props.changeFilter === 'up' && (p.change24hPct ?? 0) <= 0) return false
      if (props.changeFilter === 'down' && (p.change24hPct ?? 0) >= 0) return false
      return true
    })
    .map((p) => ({
      ...p,
      _vol: p.volume24hQuote ?? 0,
      _change: p.change24hPct ?? 0,
    }))
    .sort((a, b) => {
      if (props.volumeFilter === 'top') return b._vol - a._vol
      if (props.volumeFilter === 'bottom') return a._vol - b._vol
      return 0
    })
    .slice(0, props.volumeFilter === 'all' ? undefined : 20)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Filters */}
      <div style={{ display: 'grid', gap: 8 }}>
        {/* Market Type */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(['perp', 'spot'] as const).map((m) => (
            <button
              key={m}
              onClick={() => props.onMarketTypeChange(m)}
              style={{
                flex: 1,
                padding: '6px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: props.marketType === m ? 'var(--selected)' : 'var(--surface)',
                color: 'var(--text)',
                fontSize: 11,
                textTransform: 'uppercase',
                fontWeight: props.marketType === m ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Volume Filter */}
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            { key: 'all', label: '$ all' },
            { key: 'top', label: 'Top 20' },
            { key: 'bottom', label: 'Bottom 20' },
          ] as const).map((item) => (
            <button
              key={item.key}
              onClick={() => props.onVolumeFilterChange(item.key)}
              style={{
                padding: '6px 9px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: props.volumeFilter === item.key ? 'var(--selected)' : 'var(--surface)',
                color: 'var(--text)',
                fontSize: 11,
                fontWeight: props.volumeFilter === item.key ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Change Filter */}
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            { key: 'all', label: 'Δ all' },
            { key: 'up', label: 'Gainers' },
            { key: 'down', label: 'Losers' },
          ] as const).map((item) => (
            <button
              key={item.key}
              onClick={() => props.onChangeFilterChange(item.key)}
              style={{
                padding: '6px 9px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: props.changeFilter === item.key ? 'var(--selected)' : 'var(--surface)',
                color: 'var(--text)',
                fontSize: 11,
                fontWeight: props.changeFilter === item.key ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pairs List */}
      <div style={{ display: 'grid', gap: 6, maxHeight: 'calc(100vh - 280px)', overflowY: 'auto', paddingRight: 4 }}>
        {props.pairsLoading && <div style={{ padding: 12, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>}
        {props.pairsError && (
          <div style={{ padding: 12, color: 'var(--neg)', fontSize: 11 }}>{props.pairsError}</div>
        )}
        {filtered.map((p) => {
          const isActive = p.pair === props.selectedPair
          const exchanges = Array.isArray(p.exchanges) ? p.exchanges : Object.keys(p.exchanges || {})
          const price = props.livePrices[p.pair] ?? p.last ?? (isActive ? props.lastCandle?.close : undefined)

          return (
            <button
              key={p.pair}
              onClick={() => props.onPairSelect(p.pair)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 12px',
                borderRadius: 10,
                border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                background: isActive ? 'var(--selected)' : 'var(--surface)',
                color: 'var(--text)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.borderColor = 'var(--primary-dim)'
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.borderColor = 'var(--border)'
              }}
            >
              <span style={{ display: 'grid', gap: 2, textAlign: 'left' }}>
                <span style={{ fontWeight: isActive ? 600 : 400, fontSize: 13 }}>{p.pair}</span>
                <span style={{ fontSize: 10, opacity: 0.7, color: 'var(--muted)' }}>
                  {exchanges.slice(0, 3).join(' · ')}
                </span>
              </span>
              <span style={{ display: 'grid', justifyItems: 'end', gap: 1 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>${formatPrice(price)}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color:
                      p.change24hPct !== undefined && p.change24hPct !== null
                        ? p.change24hPct > 0
                          ? 'var(--pos)'
                          : p.change24hPct < 0
                            ? 'var(--neg)'
                            : 'var(--muted)'
                        : 'var(--muted)',
                  }}
                >
                  {p.change24hPct !== undefined && p.change24hPct !== null ? `${p.change24hPct.toFixed(1)}%` : '—'}
                </span>
                <span style={{ fontSize: 10, color: 'var(--muted)', opacity: 0.8 }}>
                  {formatCompact(p.volume24hQuote)}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
