import { useResourceStream } from '../table/useResourceStream'
import type { K8sObject } from '../contract/types'
import { useNodeMetrics } from '../modules/observe/useNodeMetrics'
import { Card, Icon, MiniBar, Mono, Table, TD, TR, ViewHeader } from '../ui'

const NODES = { group: 'core', version: 'v1', resource: 'nodes' }

const CARDS = [
  { label: 'CPU %', key: 'cpu', bar: 'bg-violet-500' },
  { label: 'Memory %', key: 'mem', bar: 'bg-emerald-500' },
  { label: 'Storage %', key: 'storage', bar: 'bg-sky-500' },
] as const

function Cell({ value }: { value?: number }) {
  return value === undefined ? (
    <span className="text-xs text-zinc-500">n/a</span>
  ) : (
    <MiniBar value={value} className="w-24" />
  )
}

export function DashboardsView() {
  const metrics = useNodeMetrics()
  const { rows } = useResourceStream(NODES, undefined)
  const nodes = [...(rows as K8sObject[])].sort((a, b) =>
    a.metadata.name.localeCompare(b.metadata.name),
  )

  return (
    <div className="space-y-4">
      <ViewHeader title="Cluster Summary" />
      {!metrics.enabled && (
        <p role="note" className="text-xs text-zinc-500">
          No metrics source connected (set --prometheus-url).
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-testid="cluster-cards">
        {CARDS.map((m) => {
          const v = metrics.cluster[m.key]
          const rounded = v === undefined ? undefined : Math.round(v)
          return (
            <Card key={m.label} className="p-4">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">{m.label}</p>
              <p className="text-xl font-bold text-white mb-2">
                {rounded === undefined ? 'n/a' : `${rounded}%`}
              </p>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${m.bar} rounded-full`}
                  style={{ width: `${rounded ?? 0}%` }}
                />
              </div>
            </Card>
          )
        })}
      </div>
      {metrics.grafanaUrl && (
        <Card className="p-4 flex items-center justify-between gap-4">
          <p className="text-xs text-zinc-400">
            Detailed dashboards, app metrics, logs &amp; traces live in Grafana.
          </p>
          <a
            href={metrics.grafanaUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-400 hover:underline"
          >
            <Icon name="external" className="w-4 h-4" /> Open in Grafana
          </a>
        </Card>
      )}
      <Table aria-label="Node usage" headers={['Name', 'CPU %', 'Memory %', 'Storage %']}>
        {nodes.map((n) => {
          const m = metrics.byNode.get(n.metadata.name)
          return (
            <TR key={n.metadata.uid ?? n.metadata.name}>
              <TD>
                <Mono>{n.metadata.name}</Mono>
              </TD>
              <TD>
                <Cell value={m?.cpu} />
              </TD>
              <TD>
                <Cell value={m?.mem} />
              </TD>
              <TD>
                <Cell value={m?.storage} />
              </TD>
            </TR>
          )
        })}
      </Table>
    </div>
  )
}
