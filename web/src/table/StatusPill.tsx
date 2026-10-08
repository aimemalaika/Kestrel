const TONE: Record<string, { fg: string; bg: string }> = {
  Running: { fg: 'var(--ok-fg)', bg: 'var(--ok-bg)' },
  Active: { fg: 'var(--ok-fg)', bg: 'var(--ok-bg)' },
  Succeeded: { fg: 'var(--ok-fg)', bg: 'var(--ok-bg)' },
  Pending: { fg: 'var(--warn-fg)', bg: 'var(--warn-bg)' },
  Failed: { fg: 'var(--risk-fg)', bg: 'var(--risk-bg)' },
}

export function StatusPill({ value }: { value: string }) {
  const tone = TONE[value] ?? { fg: 'var(--neutral-fg)', bg: 'var(--neutral-bg)' }
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 'var(--r-pill)',
        fontSize: 12,
        color: tone.fg,
        background: tone.bg,
      }}
    >
      {value}
    </span>
  )
}
