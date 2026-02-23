export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const token = window.localStorage.getItem('access_token')
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    // Handle unauthorized - redirect to login
    if (res.status === 401) {
      window.localStorage.removeItem('access_token')
      window.location.href = '/login'
      throw new Error('Unauthorized - please login')
    }

    const text = await res.text()
    let message = text || `HTTP ${res.status}`
    try {
      const parsed = JSON.parse(text) as any

      const msg = parsed?.message
      if (typeof msg === 'string') {
        message = msg
      } else if (msg && typeof msg === 'object') {
        if (typeof msg.message === 'string') message = msg.message
        else if (typeof msg.error === 'string') message = msg.error
      } else if (parsed?.detail && typeof parsed.detail === 'object') {
        // FastAPI common shape: {"detail": {"message": "...", ...}}
        if (typeof parsed.detail.message === 'string') message = parsed.detail.message
        else if (typeof parsed.detail.error === 'string') message = parsed.detail.error
      } else if (typeof parsed?.detail === 'string') {
        message = parsed.detail
      }
    } catch {
      // ignore JSON parse errors
    }

    throw new Error(message || `HTTP ${res.status}`)
  }

  return (await res.json()) as T
}
