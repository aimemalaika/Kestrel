import { useEffect, useState } from 'react'
import { createClient } from '../client/createClient'
import type { WatchEnvelope } from '../contract/types'

export function StreamDebugView() {
  const [events, setEvents] = useState<WatchEnvelope[]>([])
  useEffect(() => {
    const client = createClient()
    const stop = client.watch(
      { group: 'core', version: 'v1', resource: 'pods' },
      { namespace: 'default' },
      (e) => setEvents((prev) => [...prev.slice(-49), e]),
    )
    return stop
  }, [])
  return (
    <div style={{ padding: 'var(--space-6)' }}>
      <h1 style={{ color: 'var(--brand-600)' }}>Kestrel — stream debug</h1>
      <ol>
        {events.map((e, i) => (
          <li key={i}>
            <code>{e.type}</code>{' '}
            {'object' in e
              ? `${e.object.kind}/${e.object.metadata.name} (${String(e.object.status?.phase ?? '')})`
              : JSON.stringify(e)}
          </li>
        ))}
      </ol>
    </div>
  )
}
