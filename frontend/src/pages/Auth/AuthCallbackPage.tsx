import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import Card from '../../shared/ui/Card'
import PageHeader from '../../shared/ui/PageHeader'
import { emailLoginVerify } from '../../services/api/authApi'

function getParam(name: string): string | null {
  const u = new URL(window.location.href)
  return u.searchParams.get(name)
}

export default function AuthCallbackPage() {
  const nav = useNavigate()
  const [status, setStatus] = useState<'working' | 'ok' | 'error'>('working')
  const [message, setMessage] = useState<string>('Signing you in…')

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        const accessToken = getParam('access_token')
        const emailToken = getParam('email_token')

        if (accessToken) {
          window.localStorage.setItem('trade_access_token', accessToken)
          if (!cancelled) {
            setStatus('ok')
            setMessage('Signed in. Redirecting…')
            nav('/dashboard/overview', { replace: true })
          }
          return
        }

        if (emailToken) {
          const out = await emailLoginVerify(emailToken)
          window.localStorage.setItem('trade_access_token', out.access_token)
          if (!cancelled) {
            setStatus('ok')
            setMessage('Signed in. Redirecting…')
            nav('/dashboard/overview', { replace: true })
          }
          return
        }

        throw new Error('Missing access_token/email_token')
      } catch (e) {
        if (!cancelled) {
          setStatus('error')
          setMessage(e instanceof Error ? e.message : 'Auth failed')
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [nav])

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 520, margin: '0 auto', padding: 16 }}>
      <PageHeader title="Authentication" description="Completing sign-in" />
      <Card>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 13 }}>{message}</div>
          {status === 'error' && (
            <a href="/login" style={{ fontSize: 12 }}>
              Back to login
            </a>
          )}
        </div>
      </Card>
    </div>
  )
}
