import type { K8sObject } from '../contract/types'
import { useResourceStream } from '../table/useResourceStream'

export function EventsView({ object }: { object: K8sObject }) {
  const ns = object.metadata.namespace
  const { rows } = useResourceStream({ group: 'core', version: 'v1', resource: 'events' }, ns)
  const events = rows
    .filter((e) => {
      const io = e.involvedObject as { name?: string } | undefined
      return io?.name === object.metadata.name
    })
    .sort((a, b) => String(b.lastTimestamp).localeCompare(String(a.lastTimestamp)))

  if (!events.length) return <p style={{ color: 'var(--text-muted)' }}>No events.</p>
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {events.map((e) => (
        <li
          key={e.metadata.uid ?? e.metadata.name}
          style={{ padding: 'var(--space-3) 0', borderBottom: '1px solid var(--border)' }}
        >
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <strong style={{ color: 'var(--text)' }}>{String(e.reason ?? '')}</strong>
            <span style={{ color: 'var(--text-muted)' }}>{String(e.lastTimestamp ?? '')}</span>
          </div>
          <div style={{ color: 'var(--text-muted)' }}>{String(e.message ?? '')}</div>
        </li>
      ))}
    </ul>
  )
}
