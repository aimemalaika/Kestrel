import type { K8sObject } from '../contract/types'
export function EventsView({ object }: { object: K8sObject }) {
  return (
    <p style={{ color: 'var(--text-muted)' }}>Events for {object.metadata.name} — coming in #16.</p>
  )
}
