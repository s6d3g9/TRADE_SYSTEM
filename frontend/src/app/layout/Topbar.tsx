import ConnectionPills from './ConnectionPills'
import UserMenu from '../../shared/ui/UserMenu'
import { useLocation } from 'react-router-dom'

type Props = {
  onToggleSidebar?: () => void
  sidebarOpen: boolean
}

const ROUTES: Array<{ path: string; section: string; title: string }> = [
  { path: '/charts/bots-backtests', section: 'Charts', title: 'Bots + Backtests' },
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
        <UserMenu />
      </div>
    </header>
  )
}
