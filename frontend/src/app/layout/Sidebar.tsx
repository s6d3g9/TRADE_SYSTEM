import { NavLink } from 'react-router-dom'

const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  display: 'block',
  padding: '8px 10px',
  borderRadius: 8,
  textDecoration: 'none',
  color: 'inherit',
  background: isActive ? 'var(--selected)' : 'transparent',
})

type Props = {
  onNavigate?: () => void
  globalSearch: string
  onGlobalSearchChange: (next: string) => void
}

export default function Sidebar({ onNavigate, globalSearch, onGlobalSearchChange }: Props) {
  return (
    <aside
      style={{
        width: 260,
        borderRight: '1px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text)',
        padding: 0,
        overflowY: 'auto',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
        <input
          placeholder="Global Search"
          value={globalSearch}
          onChange={(e) => onGlobalSearchChange(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text)',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ padding: 12 }}>
      <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Workspace</div>
      <NavLink to="/charts/bots-backtests" style={linkStyle} onClick={onNavigate}>
        Bots + Backtests
      </NavLink>

      </div>
    </aside>
  )
}
