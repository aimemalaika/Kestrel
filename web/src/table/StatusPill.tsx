const OK = { fg: 'var(--ok-fg)', bg: 'var(--ok-bg)' }
const WARN = { fg: 'var(--warn-fg)', bg: 'var(--warn-bg)' }
const RISK = { fg: 'var(--risk-fg)', bg: 'var(--risk-bg)' }
const NEUTRAL = { fg: 'var(--neutral-fg)', bg: 'var(--neutral-bg)' }

const TONE: Record<string, { fg: string; bg: string }> = {
  Running: OK,
  Active: OK,
  Succeeded: OK,
  Synced: OK,
  Healthy: OK,
  deployed: OK,
  Normal: OK,
  True: OK,
  Pending: WARN,
  Failed: RISK,
  OutOfSync: RISK,
  Degraded: RISK,
  failed: RISK,
  Warning: RISK,
  Error: RISK,
  False: RISK,
  Progressing: NEUTRAL,
  'pending-upgrade': NEUTRAL,
}

export function StatusPill({ value }: { value: string }) {
  const tone = TONE[value] ?? NEUTRAL
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
