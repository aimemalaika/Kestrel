import { useResourceStream } from '../table/useResourceStream'
import { ageString, getPath } from '../table/columns'
import type { K8sObject } from '../contract/types'
import { useInRouterContext, useNavigate } from 'react-router-dom'
import { StatCard, Icon, Card, CardHeader, SecondaryBtn, SeverityBadge } from '../ui'
import { useNodeMetrics } from '../modules/observe/useNodeMetrics'
import { firingAlerts } from '../modules/alerts/alertsMock'

const PODS = { group: 'core', version: 'v1', resource: 'pods' }
const DEPLOYMENTS = { group: 'apps', version: 'v1', resource: 'deployments' }
const NODES = { group: 'core', version: 'v1', resource: 'nodes' }
const NAMESPACES = { group: 'core', version: 'v1', resource: 'namespaces' }
const SERVICES = { group: 'core', version: 'v1', resource: 'services' }
const EVENTS = { group: 'core', version: 'v1', resource: 'events' }
const ROUTES = { group: 'route.openshift.io', version: 'v1', resource: 'routes' }
const QUOTAS = { group: 'core', version: 'v1', resource: 'resourcequotas' }

const SAMPLE = 'Sample data — no metrics source connected'
const NS_USAGE: Record<string, { cpu: number; mem: number }> = {
  default: { cpu: 18, mem: 32 },
  'kube-system': { cpu: 41, mem: 55 },
  production: { cpu: 72, mem: 81 },
  staging: { cpu: 36, mem: 47 },
  shop: { cpu: 54, mem: 63 },
}
const DEFAULT_USAGE = { cpu: 25, mem: 40 }

/** Parse a k8s CPU quantity ('1900m', '1.8', '16') into cores. */
function parseCpu(v: unknown): number {
  const s = String(v ?? '')
  const n = parseFloat(s)
  if (Number.isNaN(n)) return NaN
  return s.endsWith('m') ? n / 1000 : n
}

/** Parse a k8s memory quantity ('2300Mi', '19Gi') into MiB. */
function parseMem(v: unknown): number {
  const s = String(v ?? '')
  const n = parseFloat(s)
  if (Number.isNaN(n)) return NaN
  if (s.endsWith('Gi')) return n * 1024
  if (s.endsWith('Ti')) return n * 1024 * 1024
  if (s.endsWith('Ki')) return n / 1024
  if (s.endsWith('Mi')) return n
  return n / (1024 * 1024)
}

function pct(used: number, hard: number): number | undefined {
  if (!(hard > 0) || Number.isNaN(used)) return undefined
  return Math.min(100, Math.round((used / hard) * 100))
}

function ViewAllEvents() {
  if (!useInRouterContext()) {
    return <SecondaryBtn onClick={() => window.location.assign('/events')}>View all</SecondaryBtn>
  }
  return <RoutedViewAll />
}

function RoutedViewAll() {
  const navigate = useNavigate()
  return <SecondaryBtn onClick={() => navigate('/events')}>View all</SecondaryBtn>
}

function nodeReady(n: K8sObject): boolean {
  const c = getPath(n, 'status.conditions')
  return Array.isArray(c) && c.some((x) => x?.type === 'Ready' && x?.status === 'True')
}

function ts(e: K8sObject): number {
  const t = Date.parse(String(e.lastTimestamp ?? e.metadata.creationTimestamp ?? ''))
  return Number.isNaN(t) ? 0 : t
}

const CLUSTER_CARDS = [
  { label: 'CPU %', key: 'cpu', bar: 'bg-violet-500' },
  { label: 'Memory %', key: 'mem', bar: 'bg-emerald-500' },
  { label: 'Storage %', key: 'storage', bar: 'bg-sky-500' },
] as const

export function Overview() {
  const metrics = useNodeMetrics()
  const podsS = useResourceStream(PODS, undefined)
  const deploymentsS = useResourceStream(DEPLOYMENTS, undefined)
  const nodesS = useResourceStream(NODES, undefined)
  const namespacesS = useResourceStream(NAMESPACES, undefined)
  const servicesS = useResourceStream(SERVICES, undefined)
  const eventsS = useResourceStream(EVENTS, undefined)
  const routesS = useResourceStream(ROUTES, undefined)
  const quotasS = useResourceStream(QUOTAS, undefined)
  const pods = podsS.rows
  const deployments = deploymentsS.rows
  const nodes = nodesS.rows
  const namespaces = namespacesS.rows
  const services = servicesS.rows
  const events = [...eventsS.rows].sort((a, b) => ts(b) - ts(a)).slice(0, 7)
  const errored = [podsS, deploymentsS, nodesS, namespacesS, servicesS, eventsS, routesS].some(
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
  const routes = routesS.rows
  const routesAdmitted = routes.filter((r) => {
    const ing = getPath(r, 'status.ingress')
    return (
      Array.isArray(ing) &&
      ing.some(
        (i) =>
          Array.isArray(i?.conditions) &&
          i.conditions.some(
            (c: { type?: string; status?: string }) => c.type === 'Admitted' && c.status === 'True',
          ),
      )
    )
  }).length
  const quotaByNs = new Map<string, { cpu?: number; mem?: number }>()
  for (const q of quotasS.rows) {
    const used = getPath(q, 'status.used') as Record<string, string> | undefined
    const hard = getPath(q, 'status.hard') as Record<string, string> | undefined
    if (!used || !hard) continue
    quotaByNs.set(q.metadata.namespace ?? '', {
      cpu: pct(parseCpu(used.cpu), parseCpu(hard.cpu)),
      mem: pct(parseMem(used.memory), parseMem(hard.memory)),
    })
  }
  const lb = services.filter((s) => getPath(s, 'spec.type') === 'LoadBalancer').length

  const podsByNs = new Map<string, number>()
  for (const p of pods) {
    const ns = p.metadata.namespace ?? ''
    podsByNs.set(ns, (podsByNs.get(ns) ?? 0) + 1)
  }

  const alerts = firingAlerts()
  const healthy = notReady === 0
  const tiles = [
    {
      label: 'Cluster Health',
      value: healthy ? 'Healthy' : 'Degraded',
      dot: healthy ? 'bg-emerald-400' : 'bg-red-400',
      note: `${nodesReady} / ${nodes.length} nodes ready`,
    },
    { label: 'API Server', value: 'Healthy', dot: 'bg-emerald-400', note: 'p99 latency 42ms' },
    { label: 'etcd', value: 'Healthy', dot: 'bg-emerald-400', note: '3 / 3 members' },
    { label: 'Kestrel Version', value: 'v1.29.3', dot: 'bg-violet-400', note: 'Up to date' },
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
    {
      label: 'Routes',
      value: String(routes.length),
      sub: `${routesAdmitted} admitted`,
      color: 'text-cyan-400',
      icon: 'route',
    },
    {
      label: 'Alerts',
      value: String(alerts.length),
      sub: `${alerts.filter((a) => a.severity === 'critical').length} critical, ${alerts.filter((a) => a.severity === 'warning').length} warning`,
      color: 'text-red-400',
      icon: 'alert',
    },
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

      {/* Cluster resource cards */}
      {!metrics.enabled && (
        <p role="note" className="text-xs text-zinc-500">
          {SAMPLE}
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {CLUSTER_CARDS.map((m) => {
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
        {metrics.grafanaUrl && (
          <Card className="p-4 flex flex-col justify-between gap-2">
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
      </div>

      {/* Bottom 3-col layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Events */}
        <div className="col-span-2">
          <Card>
            <CardHeader title="Recent Events" action={<ViewAllEvents />} />
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
              {namespaces.slice(0, 4).map((ns) => {
                const q = quotaByNs.get(ns.metadata.name)
                const sample = NS_USAGE[ns.metadata.name] ?? DEFAULT_USAGE
                const cpu = q?.cpu ?? sample.cpu
                const mem = q?.mem ?? sample.mem
                const derived = q?.cpu !== undefined && q?.mem !== undefined
                return (
                  <div key={ns.metadata.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-zinc-300">{ns.metadata.name}</span>
                      <span className="text-[10px] text-zinc-500">
                        {podsByNs.get(ns.metadata.name) ?? 0} pods
                      </span>
                    </div>
                    <div
                      className="space-y-1"
                      title={derived ? 'From ResourceQuota usage' : SAMPLE}
                    >
                      {(
                        [
                          ['CPU', 'bg-violet-500', cpu],
                          ['Mem', 'bg-emerald-500', mem],
                        ] as const
                      ).map(([l, bg, v]) => (
                        <div key={l} className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-600 w-8">{l}</span>
                          <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${bg} rounded-full`}
                              style={{ width: `${v}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-zinc-500 w-8 text-right">{v}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Active alerts */}
          <Card>
            <CardHeader title="Active Alerts" />
            <div className="divide-y divide-zinc-800/50">
              {alerts.map((a) => (
                <div key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="shrink-0 mt-0.5">
                    <SeverityBadge sev={a.severity} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-300 truncate">{a.name}</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5 truncate">
                      {a.namespace} · {a.component}
                    </p>
                  </div>
                  <span className="text-[10px] text-zinc-600 shrink-0">{a.age}</span>
                </div>
              ))}
              <p className="px-4 py-2 text-[10px] text-zinc-600">Sample data</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
