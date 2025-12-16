type PillProps = {
  label: string
  status: 'ok' | 'warn' | 'down'
}

function Pill({ label, status }: PillProps) {
  const bg = status === 'ok' ? '#eaffea' : status === 'warn' ? '#fff4d6' : '#ffe9e9'
  const border = status === 'ok' ? '#b9e7b9' : status === 'warn' ? '#f1d18c' : '#f0b4b4'

  return (
    <span
      style={{
        fontSize: 12,
        padding: '4px 8px',
        borderRadius: 999,
        border: `1px solid ${border}`,
        background: bg,
      }}
    >
      {label}
    </span>
  )
}

export default function ConnectionPills() {
  // TODO: Replace with live health checks (API/WS/Redis/Postgres/Exchange)
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Pill label="API" status="ok" />
      <Pill label="WS" status="warn" />
      <Pill label="Redis" status="ok" />
      <Pill label="Postgres" status="ok" />
      <Pill label="Exchange" status="warn" />
    </div>
  )
}
