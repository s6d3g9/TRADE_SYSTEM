export type ThemeKey = 'midnight' | 'graphite' | 'slate' | 'fog' | 'greige' | 'ember'

export const THEME_STORAGE_KEY = 'trade.theme'

export const THEME_PRESETS: Record<ThemeKey, { label: string; vars: Record<string, string> }> = {
  midnight: {
    label: 'Midnight',
    vars: {
      '--bg': '#0b1320',
      '--surface': '#0f172a',
      '--border': '#30415d',
      '--text': '#e5e7eb',
      '--muted': '#bfcbe5',
      '--selected': '#0b1320',
      '--surface-muted': '#141c2a',
      '--text-muted-2': '#7e8fb2',
      '--chart-bg': '#0b1320',
    },
  },
  graphite: {
    label: 'Graphite',
    vars: {
      '--bg': '#141c2a',
      '--surface': '#0b1320',
      '--border': '#30415d',
      '--text': '#e5e7eb',
      '--muted': '#bfcbe5',
      '--selected': '#0f172a',
      '--surface-muted': '#0f172a',
      '--text-muted-2': '#bfcbe5',
      '--chart-bg': '#0f172a',
    },
  },
  slate: {
    label: 'Slate',
    vars: {
      '--bg': '#0f172a',
      '--surface': '#141c2a',
      '--border': '#7e8fb2',
      '--text': '#e5e7eb',
      '--muted': '#bfcbe5',
      '--selected': '#0b1320',
      '--surface-muted': '#0b1320',
      '--text-muted-2': '#7e8fb2',
      '--chart-bg': '#0b1320',
    },
  },
  fog: {
    label: 'Fog',
    vars: {
      '--bg': '#0f1115',
      '--surface': '#141820',
      '--border': '#2a303b',
      '--text': '#e8eaed',
      '--muted': '#b9c0ca',
      '--selected': '#0f1115',
      '--surface-muted': '#10141b',
      '--text-muted-2': '#9099a6',
      '--chart-bg': '#0f1115',
    },
  },
  greige: {
    label: 'Greige',
    vars: {
      '--bg': '#15130f',
      '--surface': '#1b1914',
      '--border': '#3b352a',
      '--text': '#efe7da',
      '--muted': '#d2c6b5',
      '--selected': '#15130f',
      '--surface-muted': '#171510',
      '--text-muted-2': '#a99983',
      '--chart-bg': '#15130f',
    },
  },
  ember: {
    label: 'Ember',
    vars: {
      '--bg': '#16120f',
      '--surface': '#1f1915',
      '--border': '#4b3a2e',
      '--text': '#f0e6dc',
      '--muted': '#d2c1b3',
      '--selected': '#1a1512',
      '--surface-muted': '#191410',
      '--text-muted-2': '#b39b86',
      '--chart-bg': '#16120f',
    },
  },
}

export function isThemeKey(v: string): v is ThemeKey {
  return v in THEME_PRESETS
}

export function readStoredTheme(): ThemeKey {
  if (typeof window === 'undefined') return 'midnight'
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored && isThemeKey(stored)) return stored
  return 'midnight'
}

export function applyTheme(theme: ThemeKey) {
  if (typeof document === 'undefined') return
  const preset = THEME_PRESETS[theme]
  const root = document.documentElement
  Object.entries(preset.vars).forEach(([k, v]) => root.style.setProperty(k, v))
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }
}
