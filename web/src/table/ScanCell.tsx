const SEVERITIES = [
  { key: 'critical', label: 'C', color: 'var(--risk-fg)' },
  { key: 'high', label: 'H', color: 'var(--risk-fg)' },
  { key: 'medium', label: 'M', color: 'var(--warn-fg)' },
  { key: 'low', label: 'L', color: 'var(--text-muted)' },
] as const

export function ScanCell({ value }: { value: string }) {
  let counts: Record<string, number> = {}
  try {
    counts = JSON.parse(value) as Record<string, number>
  } catch {
    counts = {}
  }
  if (!counts || typeof counts !== 'object' || Object.keys(counts).length === 0) return <>—</>
  return (
    <span style={{ display: 'inline-flex', gap: 8, fontSize: 12 }}>
      {SEVERITIES.map((s) => (
        <span key={s.key} style={{ color: s.color }} title={s.key}>
          {s.label} {counts[s.key] ?? 0}
        </span>
      ))}
    </span>
  )
}
