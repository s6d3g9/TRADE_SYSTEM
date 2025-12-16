import ConnectionPills from './ConnectionPills'

export default function Topbar() {
  return (
    <header
      style={{
        borderBottom: '1px solid #eee',
        padding: 12,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <input
        placeholder="Global Search (TODO)"
        style={{
          flex: 1,
          maxWidth: 520,
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid #ddd',
        }}
      />
      <ConnectionPills />
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd' }}>
          Run/Stop All (TODO)
        </button>
        <button style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd' }}>
          Notifications (TODO)
        </button>
        <button style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd' }}>
          User (TODO)
        </button>
      </div>
    </header>
  )
}
