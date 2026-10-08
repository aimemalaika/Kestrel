import type { ResourceRef } from '../client/Client'
export function LogViewer({ pod }: { pod: ResourceRef }) {
  return <p style={{ color: 'var(--text-muted)' }}>Logs for {pod.name} — coming in #18.</p>
}
