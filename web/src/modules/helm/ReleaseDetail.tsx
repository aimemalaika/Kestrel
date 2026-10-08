import { useEffect, useState } from 'react'
import { StatusPill } from '../../table/StatusPill'
import type { HelmClient, ReleaseDetail as Detail } from './HelmClient'

const pre = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-badge)',
  padding: 'var(--space-3)',
  overflowX: 'auto',
  margin: 0,
} as const

export function ReleaseDetail({
  client,
  namespace,
  name,
}: {
  client: HelmClient
  namespace: string
  name: string
}) {
  const [d, setD] = useState<Detail | null>(null)
  useEffect(() => {
    let active = true
    client.getRelease(namespace, name).then((r) => active && setD(r))
    return () => {
      active = false
    }
  }, [client, namespace, name])

  if (!d) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>{d.name}</h2>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'max-content 1fr',
          gap: 'var(--space-2) var(--space-4)',
        }}
      >
        <dt>Revision</dt>
        <dd style={{ margin: 0 }}>{d.revision}</dd>
        <dt>Status</dt>
        <dd style={{ margin: 0 }}>
          <StatusPill value={d.status} />
        </dd>
        <dt>Chart</dt>
        <dd style={{ margin: 0 }}>
          {d.chart}-{d.chartVersion}
        </dd>
        <dt>App version</dt>
        <dd style={{ margin: 0 }}>{d.appVersion}</dd>
        <dt>Updated</dt>
        <dd style={{ margin: 0 }}>{d.updated}</dd>
      </dl>
      <h3>Notes</h3>
      <pre style={pre}>{d.notes}</pre>
      <h3>Values</h3>
      <pre style={pre}>{d.values}</pre>
      <h3>Manifest</h3>
      <p style={{ color: 'var(--text-muted)' }}>{d.manifestSummary}</p>
    </div>
  )
}
