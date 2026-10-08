import { useEffect, useState } from 'react'
import { Card, CardHeader, StatusBadge } from '../../ui'
import type { HelmClient, ReleaseDetail as Detail } from './HelmClient'

const pre =
  'bg-zinc-950 border border-zinc-800 rounded-lg p-3 m-0 overflow-x-auto text-xs font-mono text-zinc-300'

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

  if (!d) return <p className="text-sm text-zinc-500">Loading…</p>
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-zinc-100 m-0">{d.name}</h2>
      <Card className="p-4">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-xs m-0">
          <dt className="text-zinc-500">Revision</dt>
          <dd className="m-0 text-zinc-200 tabular-nums">{d.revision}</dd>
          <dt className="text-zinc-500">Status</dt>
          <dd className="m-0">
            <StatusBadge status={d.status} />
          </dd>
          <dt className="text-zinc-500">Chart</dt>
          <dd className="m-0 font-mono text-zinc-300">
            {d.chart}-{d.chartVersion}
          </dd>
          <dt className="text-zinc-500">App version</dt>
          <dd className="m-0 text-zinc-300">{d.appVersion}</dd>
          <dt className="text-zinc-500">Updated</dt>
          <dd className="m-0 text-zinc-300">{d.updated}</dd>
        </dl>
      </Card>
      <Card>
        <CardHeader title="Notes" />
        <div className="p-4">
          <pre className={pre}>{d.notes}</pre>
        </div>
      </Card>
      <Card>
        <CardHeader title="Values" />
        <div className="p-4">
          <pre className={pre}>{d.values}</pre>
        </div>
      </Card>
      <Card>
        <CardHeader title="Manifest" />
        <p className="p-4 m-0 text-xs text-zinc-400">{d.manifestSummary}</p>
      </Card>
    </div>
  )
}
