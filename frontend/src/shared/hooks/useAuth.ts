import { useState, useEffect, useCallback } from 'react'
import { me } from '../../services/api/authApi'

export interface User {
  user_id: string
  email: string
  email_verified: boolean
  name?: string | null
  picture_url?: string | null
}

export interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  })

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      setState({ user: null, loading: false, error: null })
      return
    }

    try {
      const response = await me()
      setState({ user: response.user, loading: false, error: null })
    } catch (err) {
      console.error('Failed to load user:', err)
      // Token expired or invalid
      localStorage.removeItem('access_token')
      setState({ user: null, loading: false, error: err instanceof Error ? err.message : 'Failed to load user' })
    }
  }, [])

  const login = useCallback((token: string) => {
    localStorage.setItem('access_token', token)
    void loadUser()
  }, [loadUser])

  const logout = useCallback(() => {
    localStorage.removeItem('access_token')
    setState({ user: null, loading: false, error: null })
  }, [])

  useEffect(() => {
    void loadUser()
  }, [loadUser])

  return {
    user: state.user,
    loading: state.loading,
    error: state.error,
    login,
    logout,
    refresh: loadUser,
  }
}
