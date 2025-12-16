import { useMemo } from 'react'

export type TabItem = { id: string; label: string }

type Props = {
  items: TabItem[]
  value: string
  onChange: (id: string) => void
}

export default function Tabs({ items, value, onChange }: Props) {
  const selected = useMemo(() => new Set([value]), [value])
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {items.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid #ddd',
            background: selected.has(t.id) ? '#f3f3f3' : '#fff',
            cursor: 'pointer',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
