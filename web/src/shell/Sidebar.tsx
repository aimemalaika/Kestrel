import { Link } from 'react-router-dom'
import { NavTree } from '../nav/NavTree'

export function Sidebar() {
  return (
    <aside
      style={{
        width: 240,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        padding: 'var(--space-4)',
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--brand-600)', marginBottom: 'var(--space-4)' }}>
        Kestrel
      </div>
      <Link
        to="/registry"
        style={{
          display: 'block',
          color: 'var(--text)',
          marginBottom: 'var(--space-4)',
          textDecoration: 'none',
        }}
      >
        Registry
      </Link>
      <NavTree />
    </aside>
  )
}
