import { Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { AuthModalProvider } from '../../shared/context/AuthContext'
import AuthModal from '../../shared/ui/AuthModal'

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <AuthModalProvider>
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.35)',
              zIndex: 999,
            }}
          />
        )}

        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            height: '100vh',
            zIndex: 1000,
            transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 160ms ease',
          }}
        >
          <Sidebar
            onNavigate={() => setSidebarOpen(false)}
            globalSearch={globalSearch}
            onGlobalSearchChange={setGlobalSearch}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Topbar
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            sidebarOpen={sidebarOpen}
          />
          <main style={{ padding: 16, minWidth: 0 }}>
            <Outlet />
          </main>
        </div>

        <AuthModal />
      </div>
    </AuthModalProvider>
  )
}
