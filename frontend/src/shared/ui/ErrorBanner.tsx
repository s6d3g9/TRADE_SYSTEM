export default function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, border: '1px solid #f0b4b4', background: '#fff5f5' }}>
      <div style={{ fontWeight: 700 }}>Error</div>
      <div style={{ marginTop: 6 }}>{message}</div>
      {onRetry ? (
        <button
          onClick={onRetry}
          style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd' }}
        >
          Retry
        </button>
      ) : null}
    </div>
  )
}
