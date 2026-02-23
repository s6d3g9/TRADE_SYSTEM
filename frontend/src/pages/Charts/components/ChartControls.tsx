/**
 * Chart Controls Component
 * Handles exchange selection, aggregation, timeframe, and view controls
 */

interface ChartControlsProps {
  // Exchange
  exchange: string
  availableExchanges: string[]
  onExchangeChange: (exchange: string) => void

  // Aggregation
  aggEnabled: boolean
  onAggEnabledChange: (enabled: boolean) => void
  aggExchanges: string[]
  onAggExchangesChange: (exchanges: string[]) => void

  // Timeframe
  timeframe: string
  timeframes: string[]
  onTimeframeChange: (tf: string) => void

  // History controls
  historyDays: number
  historyDayOptions: number[]
  onHistoryDaysChange: (days: number) => void

  visibleDays: number
  visibleDayOptions: number[]
  onVisibleDaysChange: (days: number) => void

  // View controls
  viewEndIndex: number
  maxViewEndIndex: number
  pinnedToEnd: boolean
  onViewEndIndexChange: (index: number) => void
  onPinnedToEndChange: (pinned: boolean) => void
  onSliderDrag: (dragging: boolean) => void

  // Mode & Loading
  mode: 'live' | 'backtest' | 'training'
  loading: boolean
  error: string | null

  // Indicator toggles
  showEma?: boolean
  showMacd?: boolean
  showRsi?: boolean
  onShowEmaChange?: (show: boolean) => void
  onShowMacdChange?: (show: boolean) => void
  onShowRsiChange?: (show: boolean) => void
}

export default function ChartControls(props: ChartControlsProps) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      {/* Exchange Selector */}
      <div style={{ display: 'flex', gap: 4 }}>
        <label style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>Exchange:</label>
        <select
          value={props.exchange}
          onChange={(e) => props.onExchangeChange(e.target.value)}
          disabled={props.aggEnabled}
          style={{
            padding: '4px 8px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 12,
          }}
        >
          {props.availableExchanges.map((ex) => (
            <option key={ex} value={ex}>
              {ex}
            </option>
          ))}
        </select>
      </div>

      {/* Aggregation Toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={props.aggEnabled}
          onChange={(e) => props.onAggEnabledChange(e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
        Aggregate
      </label>

      {/* Agg Exchanges */}
      {props.aggEnabled && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {props.availableExchanges.map((ex) => {
            const selected = props.aggExchanges.includes(ex)
            return (
              <button
                key={ex}
                onClick={() => {
                  if (selected) {
                    props.onAggExchangesChange(props.aggExchanges.filter((e) => e !== ex))
                  } else {
                    props.onAggExchangesChange([...props.aggExchanges, ex])
                  }
                }}
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                  background: selected ? 'var(--selected)' : 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                {ex}
              </button>
            )
          })}
        </div>
      )}

      {/* Timeframe Selector */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {props.timeframes.map((tf) => (
          <button
            key={tf}
            onClick={() => props.onTimeframeChange(tf)}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: `1px solid ${tf === props.timeframe ? 'var(--primary)' : 'var(--border)'}`,
              background: tf === props.timeframe ? 'var(--selected)' : 'var(--surface)',
              color: 'var(--text)',
              fontSize: 12,
              fontWeight: tf === props.timeframe ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* History Days */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <label style={{ fontSize: 11, color: 'var(--muted)' }}>History:</label>
        <select
          value={props.historyDays}
          onChange={(e) => props.onHistoryDaysChange(Number(e.target.value))}
          style={{
            padding: '4px 8px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 12,
          }}
        >
          {props.historyDayOptions.map((d) => (
            <option key={d} value={d}>
              {d}d
            </option>
          ))}
        </select>
      </div>

      {/* Visible Days */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <label style={{ fontSize: 11, color: 'var(--muted)' }}>Visible:</label>
        <select
          value={props.visibleDays}
          onChange={(e) => props.onVisibleDaysChange(Number(e.target.value))}
          style={{
            padding: '4px 8px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 12,
          }}
        >
          {props.visibleDayOptions.map((d) => (
            <option key={d} value={d}>
              {d}d
            </option>
          ))}
        </select>
      </div>

      {/* Live/Backtest/Training Mode */}
      <div style={{ display: 'flex', gap: 4 }}>
        {(['live', 'backtest', 'training'] as const).map((m) => (
          <button
            key={m}
            onClick={() => {}}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: `1px solid ${m === props.mode ? 'var(--primary)' : 'var(--border)'}`,
              background: m === props.mode ? 'var(--selected)' : 'var(--surface)',
              color: 'var(--text)',
              fontSize: 12,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Indicator Toggles */}
      {(props.onShowEmaChange || props.onShowMacdChange || props.onShowRsiChange) && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingLeft: 12, borderLeft: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Indicators:</span>
          {props.onShowEmaChange && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={props.showEma}
                onChange={(e) => props.onShowEmaChange?.(e.target.checked)}
              />
              EMA
            </label>
          )}
          {props.onShowMacdChange && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={props.showMacd}
                onChange={(e) => props.onShowMacdChange?.(e.target.checked)}
              />
              MACD
            </label>
          )}
          {props.onShowRsiChange && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={props.showRsi}
                onChange={(e) => props.onShowRsiChange?.(e.target.checked)}
              />
              RSI
            </label>
          )}
        </div>
      )}

      {/* Loading/Error Status */}
      {props.loading && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Loading...</span>}
      {props.error && (
        <span style={{ fontSize: 11, color: 'var(--neg)' }} title={props.error}>
          Error
        </span>
      )}
    </div>
  )
}
