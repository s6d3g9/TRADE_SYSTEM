import { useState } from 'react'

type HealthResponse = {
  status: string
}

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function checkHealth() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/health')
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const data = (await res.json()) as HealthResponse
      setHealth(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <h1>TRADE_SYSTEM</h1>
      <p>Frontend (Vite+React) собран и обслуживается через nginx.</p>

      <button onClick={checkHealth} disabled={loading}>
        {loading ? 'Проверяю…' : 'Проверить backend /health'}
      </button>

      {health && (
        <pre className="card">{JSON.stringify(health, null, 2)}</pre>
      )}
      {error && <pre className="card error">Ошибка: {error}</pre>}
    </div>
  )
}
