import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useResourceStream } from '../table/useResourceStream'
import { Card, EmptyState, Icon, SecondaryBtn, ViewHeader } from '../ui'
import {
  buildTopology,
  NODE_H,
  NODE_W,
  type Health,
  type TopoKind,
  type TopoNode,
} from './topologyLayout'

const NAMESPACES = { group: 'core', version: 'v1', resource: 'namespaces' }
const DEPLOYMENTS = { group: 'apps', version: 'v1', resource: 'deployments' }
const REPLICASETS = { group: 'apps', version: 'v1', resource: 'replicasets' }
const PODS = { group: 'core', version: 'v1', resource: 'pods' }
const SERVICES = { group: 'core', version: 'v1', resource: 'services' }

const HEALTH_COLOR: Record<Health, string> = {
  healthy: '#34d399',
  degraded: '#fbbf24',
  down: '#f87171',
  unknown: '#71717a',
}
const KIND_COLOR: Record<TopoKind, string> = {
  Service: '#0ea5e9',
  Deployment: '#38bdf8',
  ReplicaSet: '#a78bfa',
  Pod: '#a1a1aa',
}
const KIND_PATH: Record<TopoKind, { group: string; version: string; resource: string }> = {
  Service: SERVICES,
  Deployment: DEPLOYMENTS,
  ReplicaSet: REPLICASETS,
  Pod: PODS,
}

function drawerPath(n: TopoNode): string {
  const g = KIND_PATH[n.kind]
  return `/ns/${n.namespace}/${g.group}/${g.version}/${g.resource}/${n.name}`
}

export function TopologyView() {
  const [namespace, setNamespace] = useState('default')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const { rows: nss } = useResourceStream(NAMESPACES, undefined)
  const deps = useResourceStream(DEPLOYMENTS, namespace)
  const rss = useResourceStream(REPLICASETS, namespace)
  const pods = useResourceStream(PODS, namespace)
  const svcs = useResourceStream(SERVICES, namespace)

  const topo = useMemo(
    () =>
      buildTopology({
        deployments: deps.rows,
        replicasets: rss.rows,
        pods: pods.rows,
        services: svcs.rows,
      }),
    [deps.rows, rss.rows, pods.rows, svcs.rows],
  )
  const nsNames = Array.from(new Set([namespace, ...nss.map((n) => n.metadata.name)])).sort()
  const byId = new Map(topo.nodes.map((n) => [n.id, n]))
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null
  const hasWorkloads = deps.rows.length + rss.rows.length + pods.rows.length > 0

  return (
    <div>
      <ViewHeader title="Topology" />
      <div className="flex gap-4" style={{ minHeight: 500 }}>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <select
              aria-label="Namespace"
              value={namespace}
              onChange={(e) => {
                setNamespace(e.target.value)
                setSelectedId(null)
              }}
              className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-300 focus:outline-none"
            >
              {nsNames.map((ns) => (
                <option key={ns} value={ns}>
                  {ns}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-3 mr-3">
                {(Object.keys(KIND_COLOR) as TopoKind[]).map((k) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: KIND_COLOR[k] }}
                    />
                    <span className="text-[10px] text-zinc-500">{k}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-lg px-1 py-0.5">
                <button
                  aria-label="Zoom out"
                  onClick={() => setZoom((z) => Math.max(50, z - 10))}
                  className="text-zinc-400 hover:text-zinc-200 w-6 h-6 flex items-center justify-center text-sm"
                >
                  -
                </button>
                <span className="text-xs text-zinc-400 w-10 text-center tabular-nums">{zoom}%</span>
                <button
                  aria-label="Zoom in"
                  onClick={() => setZoom((z) => Math.min(150, z + 10))}
                  className="text-zinc-400 hover:text-zinc-200 w-6 h-6 flex items-center justify-center text-sm"
                >
                  +
                </button>
              </div>
              <SecondaryBtn onClick={() => setZoom(100)}>Fit</SecondaryBtn>
            </div>
          </div>
          <Card className="flex-1 p-4 overflow-auto">
            {!hasWorkloads ? (
              <EmptyState title="No workloads" hint={`Nothing to map in namespace ${namespace}`} />
            ) : (
              <div
                data-testid="topology-canvas"
                style={{
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: 'top left',
                  transition: 'transform 0.2s',
                }}
              >
                <svg width={topo.width} height={topo.height} role="img" aria-label="Topology graph">
                  {topo.edges.map((e) => {
                    const a = byId.get(e.from)!
                    const b = byId.get(e.to)!
                    const x1 = a.x + NODE_W
                    const y1 = a.y + NODE_H / 2
                    const x2 = b.x
                    const y2 = b.y + NODE_H / 2
                    const mx = (x1 + x2) / 2
                    return (
                      <path
                        key={`${e.from}>${e.to}`}
                        d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                        fill="none"
                        stroke="#3f3f46"
                        strokeWidth={1.5}
                      />
                    )
                  })}
                  {topo.nodes.map((n) => {
                    const sel = n.id === selectedId
                    return (
                      <g
                        key={n.id}
                        data-testid={`node-${n.kind}-${n.name}`}
                        transform={`translate(${n.x},${n.y})`}
                        onClick={() => setSelectedId(n.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <rect
                          width={NODE_W}
                          height={NODE_H}
                          rx={8}
                          fill="#18181b"
                          stroke={sel ? KIND_COLOR[n.kind] : '#3f3f46'}
                          strokeWidth={sel ? 2 : 1}
                        />
                        <circle
                          cx={18}
                          cy={NODE_H / 2}
                          r={9}
                          fill="none"
                          stroke={HEALTH_COLOR[n.health]}
                          strokeWidth={2.5}
                        />
                        <circle cx={18} cy={NODE_H / 2} r={3} fill={KIND_COLOR[n.kind]} />
                        <text x={34} y={19} fontSize={11} fill="#e4e4e7" fontWeight={600}>
                          {n.name.length > 18 ? `${n.name.slice(0, 17)}…` : n.name}
                        </text>
                        <text x={34} y={33} fontSize={9} fill="#71717a">
                          {n.kind}
                        </text>
                      </g>
                    )
                  })}
                </svg>
              </div>
            )}
          </Card>
        </div>
        {selected && (
          <div className="w-72 shrink-0" data-testid="topology-panel">
            <Card className="h-full">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <span className="text-sm font-semibold text-zinc-200 truncate">
                  {selected.name}
                </span>
                <button
                  aria-label="Close panel"
                  onClick={() => setSelectedId(null)}
                  className="text-zinc-500 hover:text-zinc-200"
                >
                  <Icon name="close" className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-3 text-xs">
                {[
                  { label: 'Kind', value: selected.kind },
                  { label: 'Namespace', value: selected.namespace },
                  { label: 'Health', value: selected.health },
                  ...selected.detail,
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between gap-3">
                    <span className="text-zinc-500">{label}</span>
                    <span className="text-zinc-200 font-medium text-right break-all">{value}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-zinc-800">
                  <Link to={drawerPath(selected)} className="text-sky-400 hover:text-sky-300">
                    Open details
                  </Link>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
