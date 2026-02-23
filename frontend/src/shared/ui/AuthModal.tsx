import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useAuthModal } from '../context/AuthContext'
import { passwordLogin, passwordRegister, passwordReset } from '../../services/api/authApi'

type View = 'login' | 'register' | 'recover'

export default function AuthModal() {
  const { isOpen, closeAuthModal } = useAuthModal()
  const { login } = useAuth()
  const nav = useNavigate()
  
  const [view, setView] = useState<View>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoveryMnemonic, setRecoveryMnemonic] = useState('')
  const [generatedRecoveryMnemonic, setGeneratedRecoveryMnemonic] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setView('login')
      setEmail('')
      setPassword('')
      setConfirmPassword('')
      setRecoveryMnemonic('')
      setGeneratedRecoveryMnemonic(null)
      setError(null)
      setSuccess(null)
    }
  }, [isOpen])

  // Close on Escape key
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        closeAuthModal()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, closeAuthModal])

  if (!isOpen) return null

  async function onPasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const out = await passwordLogin(email, password)
      localStorage.setItem('access_token', out.access_token)
      login(out.access_token)
      setSuccess('Вход выполнен успешно!')
      setTimeout(() => {
        closeAuthModal()
        nav('/', { replace: true })
      }, 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неверный email или пароль')
    } finally {
      setBusy(false)
    }
  }

  async function onPasswordRegister(e: React.FormEvent) {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      setError('Пароли не совпадают')
      return
    }
    
    if (password.length < 6) {
      setError('Пароль должен быть минимум 6 символов')
      return
    }
    
    setBusy(true)
    setError(null)
    setGeneratedRecoveryMnemonic(null)
    try {
      const out = await passwordRegister(email, password)
      localStorage.setItem('access_token', out.access_token)
      login(out.access_token)
      setGeneratedRecoveryMnemonic(out.recovery_mnemonic)
      setSuccess('Регистрация успешна! СОХРАНИТЕ seed-фразу!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка регистрации')
    } finally {
      setBusy(false)
    }
  }

  async function onPasswordReset(e: React.FormEvent) {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      setError('Пароли не совпадают')
      return
    }
    
    if (!recoveryMnemonic.trim()) {
      setError('Введите seed-фразу восстановления')
      return
    }
    
    setBusy(true)
    setError(null)
    try {
      const out = await passwordReset(email, recoveryMnemonic, password)
      localStorage.setItem('access_token', out.access_token)
      login(out.access_token)
      setSuccess('Пароль успешно изменён!')
      setTimeout(() => {
        closeAuthModal()
        nav('/', { replace: true })
      }, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка восстановления')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        overflow: 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeAuthModal()
      }}
    >
      {/* Backdrop with blur */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          margin: 'auto',
          background: 'var(--surface)',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Close button */}
        <button
          onClick={closeAuthModal}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            zIndex: 1,
          }}
        >
          ×
        </button>

        <div style={{ padding: '40px 32px' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔐</div>
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              {view === 'login' && 'Вход в систему'}
              {view === 'register' && 'Регистрация'}
              {view === 'recover' && 'Восстановление пароля'}
            </h2>
          </div>

          {/* Tabs */}
          <div style={{
            display: 'flex',
            gap: 8,
            marginBottom: 24,
            padding: 4,
            background: 'var(--bg)',
            borderRadius: 8,
          }}>
            {[
              { id: 'login' as View, label: 'Вход' },
              { id: 'register' as View, label: 'Регистрация' },
              { id: 'recover' as View, label: 'Восстановление' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setView(tab.id)
                  setError(null)
                  setSuccess(null)
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: 6,
                  background: view === tab.id ? 'var(--surface)' : 'transparent',
                  color: view === tab.id ? 'var(--text)' : 'var(--text-secondary)',
                  fontSize: 13,
                  fontWeight: view === tab.id ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          {error && (
            <div style={{
              padding: 12,
              marginBottom: 16,
              borderRadius: 8,
              background: '#fee2e2',
              color: '#dc2626',
              fontSize: 14,
            }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{
              padding: 12,
              marginBottom: 16,
              borderRadius: 8,
              background: '#dcfce7',
              color: '#16a34a',
              fontSize: 14,
            }}>
              {success}
            </div>
          )}

          {/* Login Form */}
          {view === 'login' && (
            <form onSubmit={onPasswordLogin} style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: 15,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                  Пароль
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: 15,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  marginTop: 8,
                  border: 'none',
                  borderRadius: 8,
                  background: busy ? 'var(--border)' : 'var(--primary)',
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer',
                }}
              >
                {busy ? 'Вход...' : 'Войти'}
              </button>
            </form>
          )}

          {/* Register Form */}
          {view === 'register' && !generatedRecoveryMnemonic && (
            <form onSubmit={onPasswordRegister} style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: 15,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                  Пароль
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: 15,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                  Подтверждение пароля
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: 15,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  marginTop: 8,
                  border: 'none',
                  borderRadius: 8,
                  background: busy ? 'var(--border)' : 'var(--primary)',
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer',
                }}
              >
                {busy ? 'Регистрация...' : 'Зарегистрироваться'}
              </button>
            </form>
          )}

          {/* Recovery Phrase Display */}
          {view === 'register' && generatedRecoveryMnemonic && (
            <div>
              <div style={{
                padding: 16,
                background: '#fef3c7',
                border: '2px solid #f59e0b',
                borderRadius: 8,
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#92400e', marginBottom: 8 }}>
                  ⚠️ ВАЖНО! Сохраните эту фразу:
                </div>
                <div style={{
                  padding: 12,
                  background: '#fff',
                  borderRadius: 6,
                  fontFamily: 'monospace',
                  fontSize: 13,
                  color: '#1f2937',
                  wordBreak: 'break-all',
                }}>
                  {generatedRecoveryMnemonic}
                </div>
                <div style={{ fontSize: 12, color: '#92400e', marginTop: 8 }}>
                  Эта фраза нужна для восстановления доступа к аккаунту. Храните её в безопасном месте!
                </div>
              </div>

              <button
                onClick={() => {
                  closeAuthModal()
                  nav('/', { replace: true })
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: 'none',
                  borderRadius: 8,
                  background: 'var(--primary)',
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Продолжить
              </button>
            </div>
          )}

          {/* Recover Form */}
          {view === 'recover' && (
            <form onSubmit={onPasswordReset} style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: 15,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                  Seed-фраза восстановления
                </label>
                <textarea
                  value={recoveryMnemonic}
                  onChange={(e) => setRecoveryMnemonic(e.target.value)}
                  required
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: 15,
                    fontFamily: 'monospace',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                  Новый пароль
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: 15,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>
                  Подтверждение пароля
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: 15,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  marginTop: 8,
                  border: 'none',
                  borderRadius: 8,
                  background: busy ? 'var(--border)' : 'var(--primary)',
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer',
                }}
              >
                {busy ? 'Восстановление...' : 'Восстановить пароль'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
