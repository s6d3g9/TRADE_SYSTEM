import type { ReactNode } from 'react'

type Props = {
  title: string
  description?: string
  actions?: ReactNode
}

export default function PageHeader({ title, description, actions }: Props) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1>
        {description && <div style={{ marginTop: 6, opacity: 0.75 }}>{description}</div>}
      </div>
      {actions ? <div>{actions}</div> : null}
    </div>
  )
}
