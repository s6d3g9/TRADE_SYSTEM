import type { ReactNode } from 'react'

export default function Card({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        border: '1px solid #eee',
        borderRadius: 12,
        padding: 12,
        background: '#fff',
      }}
    >
      {children}
    </div>
  )
}
