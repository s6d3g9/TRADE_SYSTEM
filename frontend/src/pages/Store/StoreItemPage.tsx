import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import Card from '../../shared/ui/Card'
import PageHeader from '../../shared/ui/PageHeader'
import { getStoreItem, purchaseStoreItem, StoreItemDetail } from '../../services/api/storeApi'

export default function StoreItemPage() {
  const nav = useNavigate()
  const params = useParams()
  const itemId = params.itemId

  const [item, setItem] = useState<StoreItemDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!itemId) return
    const id = itemId
    let cancelled = false

    async function run() {
      setBusy(true)
      setErr(null)
      setMsg(null)
      try {
        const out = await getStoreItem(id)
        if (!cancelled) setItem(out)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load item')
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [itemId])

  const backtests = useMemo(() => item?.latest_backtests ?? [], [item])

  async function onBuy() {
    if (!item) return
    setBusy(true)
    setMsg(null)
    try {
      await purchaseStoreItem(item.item_id)
      const refreshed = await getStoreItem(item.item_id)
      setItem(refreshed)
      setMsg('Purchased.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Purchase failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PageHeader
        title={item ? `Store · ${item.name}` : 'Store · Item'}
        description={item?.description || 'Item details'}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => nav('/store')} style={{ padding: '8px 10px' }}>
              Back
            </button>
            <button disabled={busy || !item || item.purchased} onClick={onBuy} style={{ padding: '8px 10px' }}>
              {item?.purchased ? 'Owned' : 'Buy'}
            </button>
          </div>
        }
      />

      {busy && !item ? <Card>Loading…</Card> : null}
      {err ? <Card>{err}</Card> : null}
      {msg ? <Card>{msg}</Card> : null}

      {item ? (
        <Card>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, opacity: 0.85 }}>
              <div>Type: {item.item_type}</div>
              <div>Slug: {item.slug}</div>
              <div>Purchases: {item.purchaser_count}</div>
            </div>
            {item.tags?.length ? <div style={{ fontSize: 12, opacity: 0.75 }}>Tags: {item.tags.join(', ')}</div> : null}
          </div>
        </Card>
      ) : null}

      {item && item.item_type === 'strategy' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <Card>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Backtests (latest)</div>
            {backtests.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.8 }}>No backtests found for this strategy.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: 8 }}>Strategy</th>
                      <th style={{ padding: 8 }}>Pair</th>
                      <th style={{ padding: 8 }}>TF</th>
                      <th style={{ padding: 8 }}>Trades</th>
                      <th style={{ padding: 8 }}>Win%</th>
                      <th style={{ padding: 8 }}>PF</th>
                      <th style={{ padding: 8 }}>Sharpe</th>
                      <th style={{ padding: 8 }}>Return%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backtests.map((bt, idx) => (
                      <tr key={String((bt as any).id || idx)} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: 8 }}>{String((bt as any).strategy_name ?? '')}</td>
                        <td style={{ padding: 8 }}>{String((bt as any).pair ?? '')}</td>
                        <td style={{ padding: 8 }}>{String((bt as any).timeframe ?? '')}</td>
                        <td style={{ padding: 8 }}>{String((bt as any).total_trades ?? '')}</td>
                        <td style={{ padding: 8 }}>{String((bt as any).win_rate ?? '')}</td>
                        <td style={{ padding: 8 }}>{String((bt as any).profit_factor ?? '')}</td>
                        <td style={{ padding: 8 }}>{String((bt as any).sharpe_ratio ?? '')}</td>
                        <td style={{ padding: 8 }}>{String((bt as any).total_return ?? '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {item ? (
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Buyers (latest)</div>
          {item.purchasers.length === 0 ? (
            <div style={{ fontSize: 12, opacity: 0.8 }}>No purchases yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 6, fontSize: 12 }}>
              {item.purchasers.map((p) => (
                <div key={`${p.user_id}-${p.purchased_at}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div>{p.name || p.email || p.user_id}</div>
                  <div style={{ opacity: 0.75 }}>{new Date(p.purchased_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}
    </div>
  )
}
