import type { K8sObject } from '../contract/types'
export function DetailPanel({ object }: { object: K8sObject }) {
  return (
    <p style={{ color: 'var(--text-muted)' }}>Detail for {object.metadata.name} — coming in #14.</p>
  )
}
