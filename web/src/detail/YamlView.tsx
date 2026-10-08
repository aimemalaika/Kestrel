import type { K8sObject } from '../contract/types'
export function YamlView({ object }: { object: K8sObject }) {
  return (
    <pre style={{ color: 'var(--text-muted)' }}>
      YAML for {object.metadata.name} — coming in #15.
    </pre>
  )
}
