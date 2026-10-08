import type { K8sObject } from '../contract/types'
export default function YamlEditor({ object }: { object: K8sObject }) {
  return (
    <p style={{ color: 'var(--text-muted)' }}>Editor for {object.metadata.name} — coming in #22.</p>
  )
}
