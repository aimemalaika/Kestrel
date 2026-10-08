import { Link } from 'react-router-dom'
import { NavTree } from '../nav/NavTree'

const linkStyle = {
  display: 'block',
  color: 'var(--text)',
  marginBottom: 'var(--space-2)',
  textDecoration: 'none',
} as const

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
      {[
        ['/overview', 'Overview'],
        ['/nodes', 'Nodes'],
        ['/events', 'Events'],
        ['/registry', 'Registry'],
        ['/helm', 'Helm'],
        ['/argo', 'Argo'],
      ].map(([to, label]) => (
        <Link key={to} to={to} style={linkStyle}>
          {label}
        </Link>
      ))}
      <div style={{ marginBottom: 'var(--space-4)' }} />
      <NavTree />
    </aside>
  )
}
