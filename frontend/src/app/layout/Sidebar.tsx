import { NavLink } from 'react-router-dom'

const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  display: 'block',
  padding: '8px 10px',
  borderRadius: 8,
  textDecoration: 'none',
  color: 'inherit',
  background: isActive ? 'var(--selected)' : 'transparent',
})

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <aside
      style={{
        width: 260,
        borderRight: '1px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text)',
        padding: 12,
        overflowY: 'auto',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 12 }}>Trading-Hive</div>

      <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Dashboard</div>
      <NavLink to="/dashboard/overview" style={linkStyle} onClick={onNavigate}>
        Overview
      </NavLink>
      <NavLink to="/dashboard/live" style={linkStyle} onClick={onNavigate}>
        Live
      </NavLink>
      <NavLink to="/dashboard/alerts" style={linkStyle} onClick={onNavigate}>
        Alerts
      </NavLink>

      <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Bots</div>
      <NavLink to="/bots" style={linkStyle} onClick={onNavigate}>
        Bots
      </NavLink>
      <NavLink to="/bots/create" style={linkStyle} onClick={onNavigate}>
        Create Bot
      </NavLink>

      <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Strategy Lab</div>
      <NavLink to="/strategylab/strategies" style={linkStyle} onClick={onNavigate}>
        Strategies
      </NavLink>
      <NavLink to="/strategylab/backtest" style={linkStyle} onClick={onNavigate}>
        Backtest
      </NavLink>
      <NavLink to="/strategylab/optimize" style={linkStyle} onClick={onNavigate}>
        Optimize
      </NavLink>
      <NavLink to="/strategylab/freqai" style={linkStyle} onClick={onNavigate}>
        FreqAI
      </NavLink>

      <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Agents</div>
      <NavLink to="/agents/overview" style={linkStyle} onClick={onNavigate}>
        Overview
      </NavLink>
      <NavLink to="/agents/supervisor" style={linkStyle} onClick={onNavigate}>
        Supervisor
      </NavLink>
      <NavLink to="/agents/reporter" style={linkStyle} onClick={onNavigate}>
        Reporter
      </NavLink>
      <NavLink to="/agents/alignment" style={linkStyle} onClick={onNavigate}>
        Alignment
      </NavLink>

      <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Data</div>
      <NavLink to="/data/markets-pairs" style={linkStyle} onClick={onNavigate}>
        Markets & Pairs
      </NavLink>
      <NavLink to="/data/trades" style={linkStyle} onClick={onNavigate}>
        Trades Search
      </NavLink>
      <NavLink to="/data/artifacts" style={linkStyle} onClick={onNavigate}>
        Artifacts
      </NavLink>

      <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Charts</div>
      <NavLink to="/charts/terminal" style={linkStyle} onClick={onNavigate}>
        Terminal
      </NavLink>

      <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Logs & Audit</div>
      <NavLink to="/logs/viewer" style={linkStyle} onClick={onNavigate}>
        Logs Viewer
      </NavLink>
      <NavLink to="/logs/audit" style={linkStyle} onClick={onNavigate}>
        Audit Trail
      </NavLink>

      <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Settings</div>
      <NavLink to="/settings/account" style={linkStyle} onClick={onNavigate}>
        Account
      </NavLink>
      <NavLink to="/settings/exchanges" style={linkStyle} onClick={onNavigate}>
        Exchanges
      </NavLink>
      <NavLink to="/settings/system" style={linkStyle} onClick={onNavigate}>
        System
      </NavLink>
      <NavLink to="/settings/templates" style={linkStyle} onClick={onNavigate}>
        Templates
      </NavLink>
      <NavLink to="/settings/notifications" style={linkStyle} onClick={onNavigate}>
        Notifications
      </NavLink>
      <NavLink to="/settings/integrations/neuro-modules" style={linkStyle} onClick={onNavigate}>
        Neuro Modules
      </NavLink>
      <NavLink to="/settings/integrations/execution-engines" style={linkStyle} onClick={onNavigate}>
        Execution Engines
      </NavLink>

      <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Admin</div>
      <NavLink to="/admin/users" style={linkStyle} onClick={onNavigate}>
        Users
      </NavLink>
      <NavLink to="/admin/maintenance" style={linkStyle} onClick={onNavigate}>
        Maintenance
      </NavLink>
    </aside>
  )
}
