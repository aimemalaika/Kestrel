import { useState } from 'react'
import { useSessions } from './SessionsProvider'
import type { ResourceRef } from '../client/Client'

// Prop is named `target` (not `ref`): React 18 reserves `ref` and would not pass it through.
export function PortForwardButton({ target }: { target: ResourceRef }) {
  const { start } = useSessions()
  const [local, setLocal] = useState('8080')
  const [remote, setRemote] = useState('80')
  const inputStyle = {
    width: 64,
    padding: '4px var(--space-2)',
    borderRadius: 'var(--r-badge)',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
  }
  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
      <input
        aria-label="local port"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        style={inputStyle}
      />
      <span style={{ color: 'var(--text-muted)' }}>→</span>
      <input
        aria-label="remote port"
        value={remote}
        onChange={(e) => setRemote(e.target.value)}
        style={inputStyle}
      />
      <button
        type="button"
        onClick={() => start(target, Number(local), Number(remote))}
        style={{
          background: 'var(--brand-600)',
          color: 'var(--surface)',
          border: 'none',
          borderRadius: 'var(--r-badge)',
          cursor: 'pointer',
          padding: '4px var(--space-3)',
        }}
      >
        Forward port
      </button>
    </div>
  )
}
