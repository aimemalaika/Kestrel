import { useSelection } from '../state/selection'

export function ResourceView() {
  const { namespace, gvr } = useSelection()
  return (
    <div style={{ padding: 'var(--space-6)' }}>
      <h2 style={{ color: 'var(--brand-600)' }}>
        {gvr ? `${gvr.group}/${gvr.version}/${gvr.resource}` : 'No resource selected'}
      </h2>
      <p style={{ color: 'var(--text-muted)' }}>namespace: {namespace ?? '—'}</p>
      <p style={{ color: 'var(--text-muted)' }}>The live table lands in U2.</p>
    </div>
  )
}
