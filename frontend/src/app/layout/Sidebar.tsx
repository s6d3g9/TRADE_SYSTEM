import { NavLink } from 'react-router-dom'

const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  display: 'block',
  padding: '8px 10px',
  borderRadius: 8,
  textDecoration: 'none',
  color: 'inherit',
  background: isActive ? '#f3f3f3' : 'transparent',
})

export default function Sidebar() {
  return (
    <aside style={{ borderRight: '1px solid #eee', padding: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>Trading-Hive</div>

      <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Dashboard</div>
      <NavLink to="/dashboard/overview" style={linkStyle}>
        Overview
      </NavLink>
      <NavLink to="/dashboard/live" style={linkStyle}>
        Live
      </NavLink>
      <NavLink to="/dashboard/alerts" style={linkStyle}>
        Alerts
      </NavLink>

      <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Bots</div>
      <NavLink to="/bots" style={linkStyle}>
        Bots
      </NavLink>
      <NavLink to="/bots/create" style={linkStyle}>
        Create Bot
      </NavLink>

      <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Strategy Lab</div>
      <NavLink to="/strategylab/strategies" style={linkStyle}>
        Strategies
      </NavLink>
      <NavLink to="/strategylab/backtest" style={linkStyle}>
        Backtest
      </NavLink>
      <NavLink to="/strategylab/optimize" style={linkStyle}>
        Optimize
      </NavLink>
      <NavLink to="/strategylab/freqai" style={linkStyle}>
        FreqAI
      </NavLink>

      <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Agents</div>
      <NavLink to="/agents/overview" style={linkStyle}>
        Overview
      </NavLink>
      <NavLink to="/agents/supervisor" style={linkStyle}>
        Supervisor
      </NavLink>
      <NavLink to="/agents/reporter" style={linkStyle}>
        Reporter
      </NavLink>
      <NavLink to="/agents/alignment" style={linkStyle}>
        Alignment
      </NavLink>

      <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Data</div>
      <NavLink to="/data/markets-pairs" style={linkStyle}>
        Markets & Pairs
      </NavLink>
      <NavLink to="/data/trades" style={linkStyle}>
        Trades Search
      </NavLink>
      <NavLink to="/data/artifacts" style={linkStyle}>
        Artifacts
      </NavLink>

      <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Charts</div>
      <NavLink to="/charts/terminal" style={linkStyle}>
        Terminal
      </NavLink>

      <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Logs & Audit</div>
      <NavLink to="/logs/viewer" style={linkStyle}>
        Logs Viewer
      </NavLink>
      <NavLink to="/logs/audit" style={linkStyle}>
        Audit Trail
      </NavLink>

      <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Settings</div>
      <NavLink to="/settings/account" style={linkStyle}>
        Account
      </NavLink>
      <NavLink to="/settings/exchanges" style={linkStyle}>
        Exchanges
      </NavLink>
      <NavLink to="/settings/system" style={linkStyle}>
        System
      </NavLink>
      <NavLink to="/settings/templates" style={linkStyle}>
        Templates
      </NavLink>
      <NavLink to="/settings/notifications" style={linkStyle}>
        Notifications
      </NavLink>
      <NavLink to="/settings/integrations/neuro-modules" style={linkStyle}>
        Neuro Modules
      </NavLink>
      <NavLink to="/settings/integrations/execution-engines" style={linkStyle}>
        Execution Engines
      </NavLink>

      <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Admin</div>
      <NavLink to="/admin/users" style={linkStyle}>
        Users
      </NavLink>
      <NavLink to="/admin/maintenance" style={linkStyle}>
        Maintenance
      </NavLink>
    </aside>
  )
}
