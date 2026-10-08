import { useResourceStream } from '../table/useResourceStream'
import { ageString, getPath } from '../table/columns'
import type { K8sObject } from '../contract/types'
import { StatCard, AreaChart, Card, CardHeader } from '../ui'

const PODS = { group: 'core', version: 'v1', resource: 'pods' }
const DEPLOYMENTS = { group: 'apps', version: 'v1', resource: 'deployments' }
const NODES = { group: 'core', version: 'v1', resource: 'nodes' }
const NAMESPACES = { group: 'core', version: 'v1', resource: 'namespaces' }
const SERVICES = { group: 'core', version: 'v1', resource: 'services' }
const EVENTS = { group: 'core', version: 'v1', resource: 'events' }

const PENDING = 'Metrics pending — not yet wired to a metrics source'
// Static flat placeholder series: keeps the AreaChart visuals without fabricating live numbers.
const FLAT_SERIES = Array.from({ length: 12 }, () => 0)

function nodeReady(n: K8sObject): boolean {
  const c = getPath(n, 'status.conditions')
  return Array.isArray(c) && c.some((x) => x?.type === 'Ready' && x?.status === 'True')
}

function ts(e: K8sObject): number {
  const t = Date.parse(String(e.lastTimestamp ?? e.metadata.creationTimestamp ?? ''))
  return Number.isNaN(t) ? 0 : t
}

const CHARTS = [
  { label: 'CPU Usage', color: '#a78bfa' },
  { label: 'Memory Usage', color: '#34d399' },
  { label: 'Network In', color: '#38bdf8' },
  { label: 'Network Out', color: '#fb923c' },
  { label: 'Disk I/O', color: '#f472b6' },
]

export function Overview() {
  const podsS = useResourceStream(PODS, undefined)
  const deploymentsS = useResourceStream(DEPLOYMENTS, undefined)
  const nodesS = useResourceStream(NODES, undefined)
  const namespacesS = useResourceStream(NAMESPACES, undefined)
  const servicesS = useResourceStream(SERVICES, undefined)
  const eventsS = useResourceStream(EVENTS, undefined)
  const pods = podsS.rows
  const deployments = deploymentsS.rows
  const nodes = nodesS.rows
  const namespaces = namespacesS.rows
  const services = servicesS.rows
  const events = [...eventsS.rows].sort((a, b) => ts(b) - ts(a)).slice(0, 7)
  const errored = [podsS, deploymentsS, nodesS, namespacesS, servicesS, eventsS].some(
    (s) => s.status === 'error',
  )

  const nodesReady = nodes.filter(nodeReady).length
  const notReady = nodes.length - nodesReady
  const podsRunning = pods.filter((p) => getPath(p, 'status.phase') === 'Running').length
  const podsDegraded = pods.length - podsRunning
  const deployUnavailable = deployments.filter((d) => {
    const want = Number(getPath(d, 'spec.replicas') ?? 1)
    const ready = Number(getPath(d, 'status.readyReplicas') ?? 0)
    return ready < want
  }).length
  const lb = services.filter((s) => getPath(s, 'spec.type') === 'LoadBalancer').length

  const podsByNs = new Map<string, number>()
  for (const p of pods) {
    const ns = p.metadata.namespace ?? ''
    podsByNs.set(ns, (podsByNs.get(ns) ?? 0) + 1)
  }

  const healthy = notReady === 0
  const tiles = [
    {
      label: 'Cluster Health',
      value: healthy ? 'Healthy' : 'Degraded',
      dot: healthy ? 'bg-emerald-400' : 'bg-red-400',
      note: `${nodesReady} / ${nodes.length} nodes ready`,
    },
    { label: 'API Server', value: 'n/a', dot: 'bg-zinc-500', note: 'Metrics pending' },
    { label: 'etcd', value: 'n/a', dot: 'bg-zinc-500', note: 'Metrics pending' },
    { label: 'Kestrel Version', value: 'n/a', dot: 'bg-violet-400', note: 'Version info pending' },
  ]

  const stats = [
    {
      label: 'Nodes',
      value: String(nodes.length),
      sub: `${notReady} NotReady`,
      color: 'text-amber-400',
      icon: 'node',
    },
    {
      label: 'Pods',
      value: String(pods.length),
      sub: `${podsDegraded} degraded`,
      color: 'text-emerald-400',
      icon: 'pod',
    },
    {
      label: 'Deployments',
      value: String(deployments.length),
      sub: `${deployUnavailable} unavailable`,
      color: 'text-sky-400',
      icon: 'deploy',
    },
    {
      label: 'Services',
      value: String(services.length),
      sub: `${lb} LoadBalancer`,
      color: 'text-blue-400',
      icon: 'service',
    },
    { label: 'Routes', value: 'n/a', sub: 'Routes pending', color: 'text-cyan-400', icon: 'route' },
    { label: 'Alerts', value: 'n/a', sub: 'Alerts pending', color: 'text-red-400', icon: 'alert' },
  ]

  return (
    <div className="space-y-5">
      {errored && <p className="text-xs text-zinc-500">Stream interrupted — resyncing…</p>}

      {/* Cluster status banner */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((item) => (
          <div
            key={item.label}
            className="bg-[#1a1f2e] border border-zinc-800/80 rounded-xl px-4 py-3 flex items-center gap-3"
          >
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.dot} animate-pulse`} />
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{item.label}</p>
              <p className="text-sm font-semibold text-zinc-100">{item.value}</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">{item.note}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {stats.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {CHARTS.map((m) => (
          <Card key={m.label} className="p-4">
            <div title={PENDING}>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">{m.label}</p>
              <p className="text-xl font-bold text-white mb-2">n/a</p>
              <AreaChart data={FLAT_SERIES} color={m.color} height={52} />
            </div>
          </Card>
        ))}
      </div>

      {/* Bottom 3-col layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Events */}
        <div className="col-span-2">
          <Card>
            <CardHeader title="Recent Events" />
            <div className="divide-y divide-zinc-800/50" data-testid="recent-events">
              {events.length === 0 && (
                <p className="px-5 py-2.5 text-xs text-zinc-600">No events.</p>
              )}
              {events.map((ev) => {
                const type = String(ev.type ?? 'Normal')
                const kind = String(getPath(ev, 'involvedObject.kind') ?? '')
                const name = String(getPath(ev, 'involvedObject.name') ?? '')
                return (
                  <div
                    key={ev.metadata.uid ?? `${ev.metadata.namespace}/${ev.metadata.name}`}
                    className="flex items-start gap-3 px-5 py-2.5"
                  >
                    <span
                      className={`shrink-0 mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${type === 'Warning' ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}
                    >
                      {type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-300 truncate">{String(ev.message ?? '')}</p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">
                        {String(ev.reason ?? '—')} ·{' '}
                        <span className="text-zinc-500">
                          {kind}/{name}
                        </span>
                      </p>
                    </div>
                    <span className="text-[10px] text-zinc-600 shrink-0">
                      {ageString(String(ev.lastTimestamp ?? ev.metadata.creationTimestamp ?? ''))}
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Namespace usage */}
          <Card>
            <CardHeader title="Namespace Resources" />
            <div className="p-4 space-y-3" data-testid="namespace-resources">
              {namespaces.slice(0, 4).map((ns) => (
                <div key={ns.metadata.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-zinc-300">{ns.metadata.name}</span>
                    <span className="text-[10px] text-zinc-500">
                      {podsByNs.get(ns.metadata.name) ?? 0} pods
                    </span>
                  </div>
                  <div className="space-y-1" title={PENDING}>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-600 w-8">CPU</span>
                      <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 rounded-full" style={{ width: 0 }} />
                      </div>
                      <span className="text-[10px] text-zinc-500 w-8 text-right">n/a</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-600 w-8">Mem</span>
                      <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: 0 }} />
                      </div>
                      <span className="text-[10px] text-zinc-500 w-8 text-right">n/a</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Active alerts */}
          <Card>
            <CardHeader title="Active Alerts" />
            <div className="divide-y divide-zinc-800/50">
              <p className="px-4 py-2.5 text-xs text-zinc-600" title={PENDING}>
                Alerts pending
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
