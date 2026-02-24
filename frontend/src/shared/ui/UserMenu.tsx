import { useEffect, useState } from 'react'
import { useAuth, User } from '../hooks/useAuth'
import { useAuthModal } from '../context/AuthContext'
import ThemeMenu from './ThemeMenu'

export default function UserMenu() {
  const { user, loading, logout } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (loading) {
    return (
      <div style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: 'var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>...</span>
      </div>
    )
  }

  if (!user) {
    return (
      <button
        onClick={openAuthModal}
        style={{
          padding: '8px 16px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text)',
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Sign In
      </button>
    )
  }

  const initials = getInitials(user)
  const displayName = user.name || 'User'

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '2px solid var(--primary)',
          background: user.picture_url ? `url(${user.picture_url}) center/cover` : 'var(--primary)',
          color: '#fff',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {!user.picture_url && initials}
      </button>

      {/* Right slide-out user panel (not a popover) */}
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.35)',
              zIndex: 2000,
            }}
          />
          <div
            role="dialog"
            aria-label="User menu"
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: 320,
              maxWidth: '92vw',
              height: '100vh',
              background: 'var(--surface)',
              borderLeft: '1px solid var(--border)',
              zIndex: 2001,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: 12,
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={user.email}
              >
                {user.email}
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

          {/* User Info */}
          <div style={{
            padding: 16,
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: user.picture_url ? `url(${user.picture_url}) center/cover` : 'var(--primary)',
                color: '#fff',
                fontSize: 18,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {!user.picture_url && initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {displayName}
                </div>
                {user.email_verified && (
                  <div style={{
                    fontSize: 10,
                    color: '#22c55e',
                    marginTop: 2,
                  }}>
                    ✓ Verified
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div style={{ padding: 8, overflowY: 'auto', flex: 1 }}>
            <div style={{ padding: 4 }}>
              <ThemeMenu />
            </div>
            <MenuLink href="/profile" icon="👤" label="Profile" onClick={() => setOpen(false)} />
            <MenuLink href="/charts/bots-backtests" icon="🤖" label="Bots + Backtests" onClick={() => setOpen(false)} />
          </div>

          <div style={{
            borderTop: '1px solid var(--border)',
            padding: 8,
          }}>
            <button
              onClick={() => {
                logout()
                setOpen(false)
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: 'none',
                background: 'transparent',
                color: '#ef4444',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>🚪</span>
              <span>Sign Out</span>
            </button>
          </div>

          </div>
        </>
      )}
    </div>
  )
}

function MenuLink({ href, icon, label, onClick }: { href: string; icon: string; label: string; onClick: () => void }) {
  return (
    <a
      href={href}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 6,
        textDecoration: 'none',
        color: 'var(--text)',
        fontSize: 14,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span>{label}</span>
    </a>
  )
}

function getInitials(user: User): string {
  if (user.name) {
    const parts = user.name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return parts[0][0].toUpperCase()
  }
  return user.email[0].toUpperCase()
}
