export default function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, border: '1px dashed #ddd' }}>
      <div style={{ fontWeight: 700 }}>{title}</div>
      {hint ? <div style={{ marginTop: 6, opacity: 0.75 }}>{hint}</div> : null}
    </div>
  )
}
