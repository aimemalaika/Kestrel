import { IDENTITY_PRESETS } from './identity'
import { useAuth } from './AuthProvider'

export function LoginScreen() {
  const { signIn } = useAuth()
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg)',
        color: 'var(--text)',
      }}
    >
      <div
        role="group"
        aria-label="Sign in"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 24,
          minWidth: 320,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 18 }}>Sign in to Kestrel</h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>Choose an identity.</p>
        {IDENTITY_PRESETS.map((p) => (
          <button
            key={p.user}
            type="button"
            onClick={() => signIn(p)}
            style={{
              textAlign: 'left',
              padding: '10px 12px',
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 600 }}>{p.user}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {p.role} · {p.groups.join(', ')}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
