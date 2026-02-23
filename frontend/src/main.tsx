import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'
import { RouterProvider } from 'react-router-dom'

import { applyTheme, readStoredTheme } from './shared/theme/themePresets'

import { router } from './app/routes'

// Apply stored theme as early as possible so a refresh preserves the chosen scheme.
applyTheme(readStoredTheme())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
