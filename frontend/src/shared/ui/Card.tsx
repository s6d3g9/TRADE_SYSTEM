import type { ReactNode } from 'react'

export default function Card({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 12,
        background: 'var(--surface)',
        color: 'var(--text)',
      }}
    >
      {children}
    </div>
  )
}
