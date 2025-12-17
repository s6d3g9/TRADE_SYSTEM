import { useEffect, useRef, useState } from 'react'

import { applyTheme, readStoredTheme, THEME_PRESETS, ThemeKey } from '../theme/themePresets'

export default function ThemeMenu() {
  const [theme, setTheme] = useState<ThemeKey>('midnight')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const stored = readStoredTheme()
    setTheme(stored)
    applyTheme(stored)
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const el = ref.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Color scheme"
        style={{
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text)',
          display: 'inline-flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 3c-5 0-9 3.6-9 8 0 3.3 2.4 6 5.4 6h1.2c.9 0 1.4.7 1.1 1.5-.2.5-.1 1 .2 1.4.4.6 1.2 1.1 2.6 1.1 4.7 0 8.5-3.6 8.5-8.5C22 7.5 17.6 3 12 3Z"
            stroke="var(--text)"
            strokeWidth="1.6"
            opacity="0.9"
          />
          <circle cx="8" cy="11" r="1" fill="var(--up)" />
          <circle cx="12" cy="9" r="1" fill="var(--muted)" />
          <circle cx="15.5" cy="12" r="1" fill="var(--down)" />
        </svg>
        <span style={{ fontSize: 12, opacity: 0.9 }}>{THEME_PRESETS[theme].label}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 260,
            borderRadius: 14,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            padding: 8,
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            zIndex: 50,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Color scheme</div>
          {Object.entries(THEME_PRESETS).map(([k, p]) => {
            const key = k as ThemeKey
            const active = key === theme
            return (
              <button
                key={key}
                onClick={() => {
                  setTheme(key)
                  setOpen(false)
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '10px 10px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: active ? 'var(--selected)' : 'var(--surface)',
                  color: 'var(--text)',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</span>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 99,
                    border: '1px solid var(--border)',
                    background: active ? 'var(--pos)' : 'transparent',
                  }}
                />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
