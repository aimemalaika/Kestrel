import { useSessions } from './SessionsProvider'

export function SessionsDock() {
  const { sessions, stop } = useSessions()
  if (!sessions.length) return null
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        padding: 'var(--space-3) var(--space-6)',
        display: 'flex',
        gap: 'var(--space-4)',
        alignItems: 'center',
        zIndex: 20,
        flexWrap: 'wrap',
      }}
    >
      <strong style={{ color: 'var(--text)' }}>Port-forwards ({sessions.length})</strong>
      {sessions.map((s) => (
        <span
          key={s.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            color: 'var(--text-muted)',
          }}
        >
          {s.ref.name} {s.localPort}→{s.remotePort}
          <span style={{ color: 'var(--ok-fg)' }}>●</span>
          <button
            type="button"
            onClick={() => stop(s.id)}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-badge)',
              cursor: 'pointer',
              color: 'var(--text)',
              padding: '2px 8px',
            }}
          >
            stop
          </button>
        </span>
      ))}
    </div>
  )
}
