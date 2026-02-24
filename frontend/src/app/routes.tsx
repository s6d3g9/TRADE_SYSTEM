import { Navigate, createBrowserRouter } from 'react-router-dom'

import AppShell from './layout/AppShell'

import LoginPage from '../pages/Auth/LoginPage'
import AuthCallbackPage from '../pages/Auth/AuthCallbackPage'

import ProfilePage from '../pages/Profile/ProfilePage'
import BotBacktestWorkspacePage from '../pages/Charts/BotBacktestWorkspacePage'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/auth/callback',
    element: <AuthCallbackPage />,
  },
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <Navigate to="/charts/bots-backtests" replace /> },

      { path: '/profile', element: <ProfilePage /> },
      { path: '/charts/bots-backtests', element: <BotBacktestWorkspacePage /> },
      { path: '*', element: <Navigate to="/charts/bots-backtests" replace /> },
    ],
  },
])
