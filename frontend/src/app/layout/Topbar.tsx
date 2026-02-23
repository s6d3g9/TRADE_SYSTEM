import ConnectionPills from './ConnectionPills'
import UserMenu from '../../shared/ui/UserMenu'
import { useLocation } from 'react-router-dom'

type Props = {
  onToggleSidebar?: () => void
  sidebarOpen: boolean
}

const ROUTES: Array<{ path: string; section: string; title: string }> = [
  { path: '/dashboard/overview', section: 'Dashboard', title: 'Overview' },
  { path: '/dashboard/live', section: 'Dashboard', title: 'Live' },
  { path: '/dashboard/alerts', section: 'Dashboard', title: 'Alerts' },
  { path: '/bots', section: 'Bots', title: 'Bots' },
  { path: '/bots/create', section: 'Bots', title: 'Create Bot' },
  { path: '/strategylab/strategies', section: 'Strategy Lab', title: 'Strategies' },
  { path: '/strategylab/backtest', section: 'Strategy Lab', title: 'Backtest' },
  { path: '/strategylab/benchmark', section: 'Strategy Lab', title: 'Benchmark' },
  { path: '/strategylab/graphs', section: 'Strategy Lab', title: 'Node Graphs' },
  { path: '/strategylab/optimize', section: 'Strategy Lab', title: 'Optimize' },
  { path: '/strategylab/freqai', section: 'Strategy Lab', title: 'FreqAI' },
  { path: '/strategylab/combinator', section: 'Strategy Lab', title: 'Combinator' },
  { path: '/strategylab/editor', section: 'Strategy Lab', title: 'Advanced Editor' },
  { path: '/store', section: 'Store', title: 'Marketplace' },
  { path: '/agents/overview', section: 'Agents', title: 'Overview' },
  { path: '/agents/supervisor', section: 'Agents', title: 'Supervisor' },
  { path: '/agents/reporter', section: 'Agents', title: 'Reporter' },
  { path: '/agents/alignment', section: 'Agents', title: 'Alignment' },
  { path: '/data/markets-pairs', section: 'Data', title: 'Markets & Pairs' },
  { path: '/data/trades', section: 'Data', title: 'Trades Search' },
  { path: '/data/artifacts', section: 'Data', title: 'Artifacts' },
  { path: '/charts/terminal', section: 'Charts', title: 'Terminal' },
  { path: '/charts/terminal2', section: 'Charts', title: 'Terminal 2' },
  { path: '/logs/viewer', section: 'Logs & Audit', title: 'Logs Viewer' },
  { path: '/logs/audit', section: 'Logs & Audit', title: 'Audit Trail' },
  { path: '/settings/account', section: 'Settings', title: 'Account' },
  { path: '/settings/exchanges', section: 'Settings', title: 'Exchanges' },
  { path: '/settings/system', section: 'Settings', title: 'System' },
  { path: '/settings/templates', section: 'Settings', title: 'Templates' },
  { path: '/settings/notifications', section: 'Settings', title: 'Notifications' },
  { path: '/settings/integrations/neuro-modules', section: 'Settings', title: 'Neuro Modules' },
  { path: '/settings/integrations/execution-engines', section: 'Settings', title: 'Execution Engines' },
  { path: '/settings/integrations/freqtrade-freqai', section: 'Settings', title: 'Freqtrade/FreqAI' },
  { path: '/admin/users', section: 'Admin', title: 'Users' },
  { path: '/admin/maintenance', section: 'Admin', title: 'Maintenance' },
]

function pickRoute(pathname: string) {
  // Choose the longest matching prefix or exact path.
  const candidates = ROUTES.filter((r) => pathname === r.path || pathname.startsWith(r.path + '/'))
  if (candidates.length === 0) {
    // Try exact-only fallback.
    const exact = ROUTES.find((r) => r.path === pathname)
    return exact ?? null
  }
  return candidates.sort((a, b) => b.path.length - a.path.length)[0]
}

export default function Topbar({ onToggleSidebar, sidebarOpen }: Props) {
  const loc = useLocation()
  const route = pickRoute(loc.pathname)
  const section = route?.section ?? 'Menu'
  const title = route?.title ?? loc.pathname

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
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
            flex: '0 0 auto',
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>☰</span>
        </button>

        {/* Where search used to be: show menu title + path */}
        <div style={{ display: 'grid', minWidth: 0, gap: 2, flex: 1 }}>
          <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {section} / {title}
          </div>
        </div>
      </div>

      <ConnectionPills />
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
          Run/Stop All (TODO)
        </button>
        <button style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
          Notifications (TODO)
        </button>
        <UserMenu />
      </div>
    </header>
  )
}
