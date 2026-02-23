import { useEffect, useMemo, useState } from 'react'

import PageHeader from '../../shared/ui/PageHeader'
import Card from '../../shared/ui/Card'
import ErrorBanner from '../../shared/ui/ErrorBanner'
import CollapsibleSection from '../../shared/ui/CollapsibleSection'
import {
  listFreqAIModelVariants,
  listStrategyAlignments,
  listStrategyTemplates,
} from '../../services/api/strategylabApi'

type HealthResponse = {
  status: string
  checks?: {
    postgres?: { status: string; latency_ms?: number }
    redis?: { status: string; latency_ms?: number }
    exchange?: { status: string; latency_ms?: number }
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{label}</div>
      <div style={{ fontWeight: 800 }}>{value}</div>
    </div>
  )
}

export default function OverviewPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [strategyCount, setStrategyCount] = useState<number | null>(null)
  const [modelCount, setModelCount] = useState<number | null>(null)
  const [alignmentCount, setAlignmentCount] = useState<number | null>(null)

  const healthSummary = useMemo(() => {
    if (!health) return 'unknown'
    return health.status || 'unknown'
  }, [health])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [h, strategies, models, alignments] = await Promise.all([
        fetch('/api/health').then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return (await r.json()) as HealthResponse
        }),
        listStrategyTemplates(),
        listFreqAIModelVariants(),
        listStrategyAlignments(),
      ])
      setHealth(h)
      setStrategyCount(strategies.length)
      setModelCount(models.length)
      setAlignmentCount(alignments.length)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load overview')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PageHeader title="Dashboard · Overview" description="Сводка по состоянию системы и каталогу стратегий/моделей." />

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      <div style={{ display: 'grid', gap: 12 }}>
        <CollapsibleSection
          title="Backend Health"
          icon="🏥"
          variant="card"
          defaultExpanded={true}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <Stat label="Status" value={loading ? 'loading…' : healthSummary} />
            <Stat
              label="Exchange"
              value={
                health?.checks?.exchange
                  ? `${health.checks.exchange.status}${
                      typeof health.checks.exchange.latency_ms === 'number' ? ` · ${health.checks.exchange.latency_ms}ms` : ''
                    }`
                  : '—'
              }
            />
            <Stat
              label="Postgres"
              value={
                health?.checks?.postgres
                  ? `${health.checks.postgres.status}${
                      typeof health.checks.postgres.latency_ms === 'number' ? ` · ${health.checks.postgres.latency_ms}ms` : ''
                    }`
                  : '—'
              }
            />
            <Stat
              label="Redis"
              value={
                health?.checks?.redis
                  ? `${health.checks.redis.status}${
                      typeof health.checks.redis.latency_ms === 'number' ? ` · ${health.checks.redis.latency_ms}ms` : ''
                    }`
                  : '—'
              }
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="StrategyLab Catalog"
          icon="📚"
          variant="card"
          defaultExpanded={true}
          headerActions={
            <button
              onClick={() => void load()}
              disabled={loading}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: 12,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              🔄 Refresh
            </button>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              <Stat label="Strategies" value={strategyCount === null ? (loading ? '…' : '—') : String(strategyCount)} />
              <Stat label="Models" value={modelCount === null ? (loading ? '…' : '—') : String(modelCount)} />
              <Stat label="Alignments" value={alignmentCount === null ? (loading ? '…' : '—') : String(alignmentCount)} />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href="/strategylab/combinator" style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text)', textDecoration: 'none', fontSize: 13 }}>
                Open Combinator
              </a>
              <a
                href="/settings/integrations/freqtrade-freqai"
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text)', textDecoration: 'none', fontSize: 13 }}
              >
                Freqtrade/FreqAI settings
              </a>
            </div>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  )
}
