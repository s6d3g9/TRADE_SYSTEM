/**
 * CandleChart Component
 * SVG-based candlestick chart with indicators (EMA, MACD, RSI) and interactive controls
 */

import { useRef, useMemo } from 'react'
import { Candle } from '../../../services/api/marketApi'

interface Indicators {
  emaFast: number[]
  emaSlow: number[]
  macd: number[]
  macdSignal: number[]
  rsi: number[]
  signals: Array<{ idx: number; side: 'buy' | 'sell'; reason: string }>
}

interface CandleChartProps {
  candles: Candle[]
  indicators: Indicators
  showEma: boolean
  showMacd: boolean
  showRsi: boolean
  onWheel?: (e: React.WheelEvent) => void
  onPointerDown?: (e: React.PointerEvent) => void
  onPointerMove?: (e: React.PointerEvent) => void
  onPointerUp?: (e: React.PointerEvent) => void
  onPointerCancel?: (e: React.PointerEvent) => void
  onPointerLeave?: (e: React.PointerEvent) => void
  onDoubleClick?: () => void
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export default function CandleChart(props: CandleChartProps) {
  const {
    candles,
    indicators,
    showEma,
    showMacd,
    showRsi,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
    onDoubleClick,
  } = props

  const chartSvgRef = useRef<SVGSVGElement | null>(null)

  // Chart dimensions
  const width = 1200
  const priceHeight = 400
  const macdHeight = 100
  const rsiHeight = 80
  const plotWidth = width - 40

  // Price range
  const { priceMin, priceMax } = useMemo(() => {
    if (!candles.length) return { priceMin: 0, priceMax: 100 }
    let min = Infinity
    let max = -Infinity
    candles.forEach((c) => {
      if (c.low < min) min = c.low
      if (c.high > max) max = c.high
    })
    // Add 2% padding
    const padding = (max - min) * 0.02
    return { priceMin: min - padding, priceMax: max + padding }
  }, [candles])

  // Mapping functions
  const mapX = (idx: number) => {
    if (candles.length <= 1) return plotWidth / 2
    return (idx / (candles.length - 1)) * plotWidth
  }

  const mapPriceY = (price: number) => {
    if (priceMax === priceMin) return priceHeight / 2
    return priceHeight - ((price - priceMin) / (priceMax - priceMin)) * priceHeight
  }

  const candleWidth = useMemo(() => {
    if (candles.length <= 1) return 8
    const spacing = plotWidth / candles.length
    return clamp(spacing * 0.7, 1.5, 12)
  }, [candles.length, plotWidth])

  // MACD range
  const { macdMin, macdMax } = useMemo(() => {
    if (!indicators.macd.length) return { macdMin: -1, macdMax: 1 }
    const all = [...indicators.macd, ...indicators.macdSignal]
    const min = Math.min(...all)
    const max = Math.max(...all)
    const padding = Math.max(0.1, (max - min) * 0.1)
    return { macdMin: min - padding, macdMax: max + padding }
  }, [indicators.macd, indicators.macdSignal])

  const mapMacdY = (value: number) => {
    if (macdMax === macdMin) return macdHeight / 2
    return macdHeight - ((value - macdMin) / (macdMax - macdMin)) * macdHeight
  }

  const mapRsiY = (value: number) => {
    return rsiHeight - (value / 100) * rsiHeight
  }

  if (!candles.length) {
    return (
      <div style={{ 
        background: 'var(--chart-bg)', 
        borderRadius: 12, 
        padding: 32, 
        textAlign: 'center',
        color: 'var(--text-secondary)',
        minHeight: 400
      }}>
        <p>No candles data available</p>
        <p style={{ fontSize: 12, marginTop: 8 }}>Select a pair and timeframe to load chart data</p>
      </div>
    )
  }

  return (
    <div
      style={{ touchAction: 'none', cursor: 'crosshair' }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      onDoubleClick={onDoubleClick}
      title="Wheel = zoom, drag = pan, double click = pin to latest"
    >
      {/* Main Price Chart */}
      <svg
        ref={chartSvgRef}
        width="100%"
        viewBox={`0 0 ${width} ${priceHeight + 40}`}
        style={{ background: 'var(--chart-bg)', borderRadius: 12, padding: 12, display: 'block' }}
      >
        <defs>
          <linearGradient id="grad-up" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#4caf50" stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--chart-bg)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g transform="translate(20 10)">
          {/* Background gradient */}
          <rect x="0" y="0" width={plotWidth} height={priceHeight} fill="url(#grad-up)" />

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = priceHeight * ratio
            const price = priceMax - (priceMax - priceMin) * ratio
            return (
              <g key={ratio}>
                <line
                  x1={0}
                  x2={plotWidth}
                  y1={y}
                  y2={y}
                  stroke="var(--border)"
                  strokeWidth={0.5}
                  opacity={0.3}
                  strokeDasharray="4 4"
                />
                <text x={plotWidth + 5} y={y + 4} fill="var(--text-secondary)" fontSize={10}>
                  {price.toFixed(2)}
                </text>
              </g>
            )
          })}

          {/* Candlesticks */}
          <g>
            {candles.map((c, idx) => {
              const x = mapX(idx)
              const color = c.close >= c.open ? 'var(--up)' : 'var(--down)'
              const bodyTop = mapPriceY(Math.max(c.open, c.close))
              const bodyBottom = mapPriceY(Math.min(c.open, c.close))
              const wickHigh = mapPriceY(c.high)
              const wickLow = mapPriceY(c.low)
              return (
                <g key={`${c.ts}-${idx}`}>
                  {/* Wick */}
                  <line x1={x} x2={x} y1={wickHigh} y2={wickLow} stroke={color} strokeWidth={1} opacity={0.8} />
                  {/* Body */}
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

          {/* EMA indicators */}
          {showEma && indicators.emaFast.length > 1 && (
            <polyline
              fill="none"
              stroke="#4fc3f7"
              strokeWidth={1.5}
              opacity={0.85}
              points={indicators.emaFast.map((v, idx) => `${mapX(idx)},${mapPriceY(v)}`).join(' ')}
            />
          )}
          {showEma && indicators.emaSlow.length > 1 && (
            <polyline
              fill="none"
              stroke="#f5c16c"
              strokeWidth={1.5}
              opacity={0.85}
              points={indicators.emaSlow.map((v, idx) => `${mapX(idx)},${mapPriceY(v)}`).join(' ')}
            />
          )}

          {/* Buy/Sell signals */}
          {indicators.signals.map((s, i) => {
            if (s.idx >= candles.length) return null
            const candle = candles[s.idx]
            return (
              <g key={`${s.idx}-${i}`}>
                <circle
                  cx={mapX(s.idx)}
                  cy={mapPriceY(candle.close)}
                  r={5}
                  fill={s.side === 'buy' ? '#4caf50' : '#f44336'}
                  opacity={0.9}
                />
                <text
                  x={mapX(s.idx)}
                  y={mapPriceY(candle.close) - 12}
                  fill="#fff"
                  fontSize={9}
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {s.side === 'buy' ? 'B' : 'S'}
                </text>
              </g>
            )
          })}

          {/* Price labels legend */}
          <g transform={`translate(5 ${priceHeight + 15})`}>
            {showEma && (
              <>
                <circle cx={5} cy={5} r={4} fill="#4fc3f7" opacity={0.85} />
                <text x={15} y={9} fill="var(--text)" fontSize={11}>
                  EMA(8)
                </text>
                <circle cx={80} cy={5} r={4} fill="#f5c16c" opacity={0.85} />
                <text x={90} y={9} fill="var(--text)" fontSize={11}>
                  EMA(21)
                </text>
              </>
            )}
          </g>
        </g>
      </svg>

      {/* MACD Chart */}
      {showMacd && indicators.macd.length > 0 && (
        <svg
          width="100%"
          viewBox={`0 0 ${width} ${macdHeight + 40}`}
          style={{ background: 'var(--chart-bg)', borderRadius: 12, padding: 12, marginTop: 12, display: 'block' }}
        >
          <g transform="translate(20 10)">
            <text x={0} y={-3} fill="var(--text)" fontSize={12} fontWeight="500">
              MACD
            </text>

            {/* Zero line */}
            <line
              x1={0}
              x2={plotWidth}
              y1={mapMacdY(0)}
              y2={mapMacdY(0)}
              stroke="var(--border)"
              strokeWidth={1}
              opacity={0.5}
            />

            {/* MACD histogram */}
            {indicators.macd.map((val, idx) => {
              const x = mapX(idx)
              const y0 = mapMacdY(0)
              const y1 = mapMacdY(val)
              const color = val >= 0 ? '#4caf50' : '#f44336'
              return (
                <line
                  key={`macd-${idx}`}
                  x1={x}
                  x2={x}
                  y1={y0}
                  y2={y1}
                  stroke={color}
                  strokeWidth={candleWidth}
                  opacity={0.7}
                />
              )
            })}

            {/* MACD signal line */}
            {indicators.macdSignal.length > 1 && (
              <polyline
                fill="none"
                stroke="#ff9800"
                strokeWidth={1.5}
                opacity={0.9}
                points={indicators.macdSignal.map((v, idx) => `${mapX(idx)},${mapMacdY(v)}`).join(' ')}
              />
            )}
          </g>
        </svg>
      )}

      {/* RSI Chart */}
      {showRsi && indicators.rsi.length > 0 && (
        <svg
          width="100%"
          viewBox={`0 0 ${width} ${rsiHeight + 40}`}
          style={{ background: 'var(--chart-bg)', borderRadius: 12, padding: 12, marginTop: 12, display: 'block' }}
        >
          <g transform="translate(20 10)">
            <text x={0} y={-3} fill="var(--text)" fontSize={12} fontWeight="500">
              RSI(14)
            </text>

            {/* Overbought/Oversold zones */}
            <rect x={0} y={mapRsiY(100)} width={plotWidth} height={mapRsiY(70) - mapRsiY(100)} fill="#f44336" opacity={0.1} />
            <rect x={0} y={mapRsiY(30)} width={plotWidth} height={mapRsiY(0) - mapRsiY(30)} fill="#4caf50" opacity={0.1} />

            {/* Reference lines */}
            {[30, 50, 70].map((level) => (
              <g key={level}>
                <line
                  x1={0}
                  x2={plotWidth}
                  y1={mapRsiY(level)}
                  y2={mapRsiY(level)}
                  stroke="var(--border)"
                  strokeWidth={0.5}
                  opacity={0.4}
                  strokeDasharray="3 3"
                />
                <text x={plotWidth + 5} y={mapRsiY(level) + 4} fill="var(--text-secondary)" fontSize={10}>
                  {level}
                </text>
              </g>
            ))}

            {/* RSI line */}
            {indicators.rsi.length > 1 && (
              <polyline
                fill="none"
                stroke="#9c27b0"
                strokeWidth={1.5}
                opacity={0.9}
                points={indicators.rsi.map((v, idx) => `${mapX(idx)},${mapRsiY(v)}`).join(' ')}
              />
            )}
          </g>
        </svg>
      )}
    </div>
  )
}
