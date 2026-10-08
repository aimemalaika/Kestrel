import type { ResourceRef } from '../client/Client'
export function Terminal({ pod }: { pod: ResourceRef }) {
  return <p style={{ color: 'var(--text-muted)' }}>Terminal for {pod.name} — coming in #19.</p>
}
