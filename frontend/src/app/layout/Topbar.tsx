import ConnectionPills from './ConnectionPills'
import ThemeMenu from '../../shared/ui/ThemeMenu'

export default function Topbar({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  return (
    <header
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        padding: 12,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <button
        onClick={onToggleSidebar}
        aria-label="Menu"
        style={{
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>☰</span>
      </button>
      <input
        placeholder="Global Search (TODO)"
        style={{
          flex: 1,
          maxWidth: 520,
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg)',
          color: 'var(--text)',
        }}
      />
      <ConnectionPills />
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
          Run/Stop All (TODO)
        </button>
        <button style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
          Notifications (TODO)
        </button>
        <ThemeMenu />
        <button style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
          User (TODO)
        </button>
      </div>
    </header>
  )
}
