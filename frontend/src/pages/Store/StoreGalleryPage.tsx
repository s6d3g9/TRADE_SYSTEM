import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import Card from '../../shared/ui/Card'
import PageHeader from '../../shared/ui/PageHeader'
import { listStoreItems, StoreItem } from '../../services/api/storeApi'

export default function StoreGalleryPage() {
  const nav = useNavigate()
  const [items, setItems] = useState<StoreItem[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      setBusy(true)
      setErr(null)
      try {
        const out = await listStoreItems()
        if (!cancelled) setItems(out)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load store')
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  const byType = useMemo(() => {
    const strategies = items.filter((i) => i.item_type === 'strategy')
    const models = items.filter((i) => i.item_type === 'model')
    return { strategies, models }
  }, [items])

  function renderGrid(list: StoreItem[]) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 12,
        }}
      >
        {list.map((it) => (
          <button
            key={it.item_id}
            onClick={() => nav(`/store/items/${encodeURIComponent(it.item_id)}`)}
            style={{
              border: 'none',
              padding: 0,
              background: 'transparent',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <Card>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontWeight: 700 }}>{it.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{it.item_type}</div>
                </div>
                {it.description ? <div style={{ fontSize: 13, opacity: 0.85 }}>{it.description}</div> : null}
                <div style={{ display: 'flex', gap: 8, fontSize: 12, opacity: 0.8 }}>
                  <div>Purchases: {it.purchaser_count}</div>
                  <div>{it.purchased ? 'Owned' : 'Not owned'}</div>
                </div>
              </div>
            </Card>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PageHeader title="Store" description="Marketplace for strategies and models" />

      {busy ? <Card>Loading…</Card> : null}
      {err ? <Card>{err}</Card> : null}

      {!busy && !err && items.length === 0 ? <Card>No items yet. Create a strategy/model in StrategyLab.</Card> : null}

      {byType.models.length ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Models</div>
          {renderGrid(byType.models)}
        </div>
      ) : null}

      {byType.strategies.length ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Strategies</div>
          {renderGrid(byType.strategies)}
        </div>
      ) : null}
    </div>
  )
}
