export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : null
  }

  return null
}

export function formatFixed(value: unknown, decimals: number, fallback = '---'): string {
  const n = toFiniteNumber(value)
  if (n === null) return fallback
  return n.toFixed(decimals)
}
