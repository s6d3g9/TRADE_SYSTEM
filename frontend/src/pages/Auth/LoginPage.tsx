import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../shared/hooks/useAuth'

import { passwordLogin, passwordRegister, passwordReset } from '../../services/api/authApi'

type View = 'login' | 'register' | 'recover'

export default function LoginPage() {
  const nav = useNavigate()
  const { login } = useAuth()
  const [view, setView] = useState<View>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoveryMnemonic, setRecoveryMnemonic] = useState('')
  const [generatedRecoveryMnemonic, setGeneratedRecoveryMnemonic] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgType, setMsgType] = useState<'success' | 'error'>('error')

  function showError(message: string) {
    setMsg(message)
    setMsgType('error')
  }

  function showSuccess(message: string) {
    setMsg(message)
    setMsgType('success')
  }

  async function onPasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const out = await passwordLogin(email, password)
      localStorage.setItem('access_token', out.access_token)
      login(out.access_token)
      showSuccess('Вход выполнен успешно')
      setTimeout(() => nav('/', { replace: true }), 1000)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Неверный email или пароль')
    } finally {
      setBusy(false)
    }
  }

  async function onPasswordRegister(e: React.FormEvent) {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      showError('Пароли не совпадают')
      return
    }
    
    if (password.length < 6) {
      showError('Пароль должен быть минимум 6 символов')
      return
    }
    
    setBusy(true)
    setMsg(null)
    setGeneratedRecoveryMnemonic(null)
    try {
      const out = await passwordRegister(email, password)
      localStorage.setItem('access_token', out.access_token)
      login(out.access_token)
      setGeneratedRecoveryMnemonic(out.recovery_mnemonic)
      showSuccess('Регистрация успешна! СОХРАНИТЕ seed-фразу!')
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Ошибка регистрации')
    } finally {
      setBusy(false)
    }
  }

  async function onPasswordReset(e: React.FormEvent) {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      showError('Пароли не совпадают')
      return
    }
    
    setBusy(true)
    setMsg(null)
    try {
      const out = await passwordReset(email, recoveryMnemonic.trim(), password)
      window.localStorage.setItem('trade_access_token', out.access_token)
      showSuccess('Пароль успешно восстановлен')
      setTimeout(() => nav('/', { replace: true }), 1000)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Неверные данные для восстановления')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: 20
    }}>
      <div style={{
        width: '100%',
        maxWidth: 440,
        background: 'var(--surface)',
        borderRadius: 16,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '32px 32px 24px',
          textAlign: 'center',
          borderBottom: '1px solid var(--border)'
        }}>
          <h1 style={{ 
            fontSize: 28, 
            fontWeight: 700, 
            margin: '0 0 8px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            TRADE SYSTEM
          </h1>
          <p style={{ fontSize: 14, opacity: 0.6, margin: 0 }}>
            Торговая платформа с AI
          </p>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          background: 'var(--background)'
        }}>
          {[
            { id: 'login' as View, label: 'Вход' },
            { id: 'register' as View, label: 'Регистрация' },
            { id: 'recover' as View, label: 'Восстановление' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setView(tab.id)
                setMsg(null)
                setGeneratedRecoveryMnemonic(null)
              }}
              style={{
                flex: 1,
                padding: '16px 12px',
                border: 'none',
                background: view === tab.id ? 'var(--surface)' : 'transparent',
                color: view === tab.id ? 'var(--text)' : 'var(--text-muted)',
                fontSize: 14,
                fontWeight: view === tab.id ? 600 : 400,
                cursor: 'pointer',
                borderBottom: view === tab.id ? '2px solid #667eea' : '2px solid transparent',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: 32 }}>
          {/* Login Form */}
          {view === 'login' && (
            <form onSubmit={onPasswordLogin} style={{ display: 'grid', gap: 20 }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: 13, 
                  fontWeight: 500, 
                  marginBottom: 8,
                  color: 'var(--text)'
                }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: 14,
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--background)',
                    color: 'var(--text)',
                    outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: 13, 
                  fontWeight: 500, 
                  marginBottom: 8,
                  color: 'var(--text)'
                }}>
                  Пароль
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: 14,
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--background)',
                    color: 'var(--text)',
                    outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              <button
                type="submit"
                disabled={busy || !email || !password}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  fontSize: 15,
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 8,
                  background: busy || !email || !password 
                    ? 'var(--border)' 
                    : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  cursor: busy || !email || !password ? 'not-allowed' : 'pointer',
                  transition: 'transform 0.1s',
                  transform: 'scale(1)'
                }}
                onMouseDown={(e) => !busy && email && password && (e.currentTarget.style.transform = 'scale(0.98)')}
                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                {busy ? 'Вход...' : 'Войти'}
              </button>
            </form>
          )}

          {/* Register Form */}
          {view === 'register' && !generatedRecoveryMnemonic && (
            <form onSubmit={onPasswordRegister} style={{ display: 'grid', gap: 20 }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: 13, 
                  fontWeight: 500, 
                  marginBottom: 8,
                  color: 'var(--text)'
                }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: 14,
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--background)',
                    color: 'var(--text)',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: 13, 
                  fontWeight: 500, 
                  marginBottom: 8,
                  color: 'var(--text)'
                }}>
                  Пароль
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="минимум 6 символов"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: 14,
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--background)',
                    color: 'var(--text)',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: 13, 
                  fontWeight: 500, 
                  marginBottom: 8,
                  color: 'var(--text)'
                }}>
                  Подтвердите пароль
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="повторите пароль"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: 14,
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--background)',
                    color: 'var(--text)',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              <div style={{
                padding: 12,
                background: 'rgba(102, 126, 234, 0.1)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--text-muted)',
                lineHeight: 1.5
              }}>
                ℹ️ После регистрации вы получите <strong>seed-фразу</strong> для восстановления доступа. 
                Сохраните её в надёжном месте!
              </div>

              <button
                type="submit"
                disabled={busy || !email || !password || !confirmPassword}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  fontSize: 15,
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 8,
                  background: busy || !email || !password || !confirmPassword
                    ? 'var(--border)' 
                    : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  cursor: busy || !email || !password || !confirmPassword ? 'not-allowed' : 'pointer',
                  transition: 'transform 0.1s'
                }}
                onMouseDown={(e) => !busy && email && password && confirmPassword && (e.currentTarget.style.transform = 'scale(0.98)')}
                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                {busy ? 'Регистрация...' : 'Зарегистрироваться'}
              </button>
            </form>
          )}

          {/* Recovery Seed Display */}
          {view === 'register' && generatedRecoveryMnemonic && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div style={{
                padding: 16,
                background: 'rgba(16, 185, 129, 0.1)',
                border: '2px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 8
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#10b981' }}>
                  ✅ Регистрация успешна!
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Сохраните эту фразу. Она нужна для восстановления доступа.
                </div>
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: 13, 
                  fontWeight: 500, 
                  marginBottom: 8,
                  color: 'var(--text)'
                }}>
                  Ваша seed-фраза (12 слов):
                </label>
                <div style={{
                  padding: 16,
                  background: 'var(--background)',
                  border: '2px solid #667eea',
                  borderRadius: 8,
                  fontFamily: 'monospace',
                  fontSize: 13,
                  lineHeight: 1.8,
                  wordBreak: 'break-word',
                  userSelect: 'all'
                }}>
                  {generatedRecoveryMnemonic}
                </div>
              </div>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatedRecoveryMnemonic)
                  showSuccess('Скопировано в буфер обмена!')
                }}
                style={{
                  width: '100%',
                  padding: '12px 24px',
                  fontSize: 14,
                  fontWeight: 500,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  cursor: 'pointer'
                }}
              >
                📋 Копировать seed-фразу
              </button>

              <button
                onClick={() => nav('/', { replace: true })}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  fontSize: 15,
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                Перейти в систему →
              </button>
            </div>
          )}

          {/* Recovery Form */}
          {view === 'recover' && (
            <form onSubmit={onPasswordReset} style={{ display: 'grid', gap: 20 }}>
              <div style={{
                padding: 12,
                background: 'rgba(251, 191, 36, 0.1)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--text-muted)',
                lineHeight: 1.5
              }}>
                ⚠️ Введите email, seed-фразу и новый пароль для восстановления доступа
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: 13, 
                  fontWeight: 500, 
                  marginBottom: 8,
                  color: 'var(--text)'
                }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: 14,
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--background)',
                    color: 'var(--text)',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: 13, 
                  fontWeight: 500, 
                  marginBottom: 8,
                  color: 'var(--text)'
                }}>
                  Seed-фраза (12 слов)
                </label>
                <textarea
                  value={recoveryMnemonic}
                  onChange={(e) => setRecoveryMnemonic(e.target.value)}
                  placeholder="word1 word2 word3 ..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: 14,
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--background)',
                    color: 'var(--text)',
                    outline: 'none',
                    fontFamily: 'monospace',
                    resize: 'vertical'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: 13, 
                  fontWeight: 500, 
                  marginBottom: 8,
                  color: 'var(--text)'
                }}>
                  Новый пароль
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="минимум 6 символов"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: 14,
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--background)',
                    color: 'var(--text)',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: 13, 
                  fontWeight: 500, 
                  marginBottom: 8,
                  color: 'var(--text)'
                }}>
                  Подтвердите пароль
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="повторите пароль"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: 14,
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--background)',
                    color: 'var(--text)',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              <button
                type="submit"
                disabled={busy || !email || !recoveryMnemonic || !password || !confirmPassword}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  fontSize: 15,
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 8,
                  background: busy || !email || !recoveryMnemonic || !password || !confirmPassword
                    ? 'var(--border)' 
                    : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  cursor: busy || !email || !recoveryMnemonic || !password || !confirmPassword ? 'not-allowed' : 'pointer',
                  transition: 'transform 0.1s'
                }}
                onMouseDown={(e) => !busy && email && recoveryMnemonic && password && confirmPassword && (e.currentTarget.style.transform = 'scale(0.98)')}
                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                {busy ? 'Восстановление...' : 'Восстановить доступ'}
              </button>
            </form>
          )}

          {/* Message */}
          {msg && (
            <div style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 8,
              fontSize: 13,
              background: msgType === 'success' 
                ? 'rgba(16, 185, 129, 0.1)' 
                : 'rgba(239, 68, 68, 0.1)',
              color: msgType === 'success' ? '#10b981' : '#ef4444',
              border: `1px solid ${msgType === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
            }}>
              {msg}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
