import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useResourceStream } from '../table/useResourceStream'
import { TOPOLOGY_EDGES } from '../modules/topology/topologyEdges'
import { Card, EmptyState, Icon, SecondaryBtn, ViewHeader } from '../ui'
import {
  layoutTopology,
  toWorkload,
  type Health,
  type PlacedNode,
  type WorkloadType,
} from './topologyLayout'

const DEPLOYMENTS = { group: 'apps', version: 'v1', resource: 'deployments' }
const STATEFULSETS = { group: 'apps', version: 'v1', resource: 'statefulsets' }
const DAEMONSETS = { group: 'apps', version: 'v1', resource: 'daemonsets' }

const TYPE_COLOR: Record<WorkloadType, string> = {
  Deployment: '#38bdf8',
  StatefulSet: '#a78bfa',
  DaemonSet: '#fb923c',
}
const TYPE_GLYPH: Record<WorkloadType, string> = {
  Deployment: 'D',
  StatefulSet: 'S',
  DaemonSet: 'DS',
}
const TYPE_RESOURCE: Record<WorkloadType, string> = {
  Deployment: 'deployments',
  StatefulSet: 'statefulsets',
  DaemonSet: 'daemonsets',
}
const HEALTH_COLOR: Record<Health, string> = {
  healthy: '#34d399',
  degraded: '#fbbf24',
  down: '#f87171',
}
const R_RING = 42
const CIRC = 2 * Math.PI * R_RING
const ALL = 'all'

function drawerPath(n: PlacedNode): string {
  return `/ns/${n.namespace}/apps/v1/${TYPE_RESOURCE[n.type]}/${n.name}`
}

export function TopologyView() {
  const [nsFilter, setNsFilter] = useState(ALL)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const deps = useResourceStream(DEPLOYMENTS, undefined)
  const sts = useResourceStream(STATEFULSETS, undefined)
  const dss = useResourceStream(DAEMONSETS, undefined)

  const all = useMemo(
    () => [
      ...deps.rows.map((o) => toWorkload(o, 'Deployment')),
      ...sts.rows.map((o) => toWorkload(o, 'StatefulSet')),
      ...dss.rows.map((o) => toWorkload(o, 'DaemonSet')),
    ],
    [deps.rows, sts.rows, dss.rows],
  )
  const nsNames = useMemo(() => Array.from(new Set(all.map((w) => w.namespace))).sort(), [all])
  const topo = useMemo(
    () =>
      layoutTopology(
        nsFilter === ALL ? all : all.filter((w) => w.namespace === nsFilter),
        TOPOLOGY_EDGES,
      ),
    [all, nsFilter],
  )
  const selected = topo.nodes.find((n) => n.id === selectedId) ?? null
  const btn =
    'text-zinc-400 hover:text-zinc-200 w-6 h-6 flex items-center justify-center text-sm rounded focus-visible:ring-2 focus-visible:ring-brand/60'

  return (
    <div>
      <ViewHeader title="Topology" />
      <div className="flex gap-4" style={{ minHeight: 500 }}>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <select
              aria-label="Namespace"
              value={nsFilter}
              onChange={(e) => {
                setNsFilter(e.target.value)
                setSelectedId(null)
              }}
              className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              <option value={ALL}>All Namespaces</option>
              {nsNames.map((ns) => (
                <option key={ns} value={ns}>
                  {ns}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-3 mr-3">
                {(Object.keys(TYPE_COLOR) as WorkloadType[]).map((k) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: TYPE_COLOR[k] }}
                    />
                    <span className="text-[10px] text-zinc-500">{k}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                  <span className="text-[10px] text-zinc-500">Route</span>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-lg px-1 py-0.5">
                <button
                  aria-label="Zoom out"
                  onClick={() => setZoom((z) => Math.max(50, z - 10))}
                  className={btn}
                >
                  -
                </button>
                <span className="text-xs text-zinc-400 w-10 text-center tabular-nums">{zoom}%</span>
                <button
                  aria-label="Zoom in"
                  onClick={() => setZoom((z) => Math.min(150, z + 10))}
                  className={btn}
                >
                  +
                </button>
              </div>
              <SecondaryBtn onClick={() => setZoom(100)}>Fit</SecondaryBtn>
            </div>
          </div>
          <Card className="flex-1 p-4 overflow-auto">
            {topo.nodes.length === 0 ? (
              <EmptyState title="No workloads" hint="Nothing to map" />
            ) : (
              <div
                data-testid="topology-canvas"
                style={{
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: 'top left',
                  transition: 'transform 0.2s',
                }}
              >
                <svg
                  width={topo.width}
                  height={topo.height}
                  role="group"
                  aria-label="Topology graph"
                  onClick={() => setSelectedId(null)}
                >
                  {topo.boxes.map((b) => (
                    <g key={b.namespace} data-testid={`ns-box-${b.namespace}`}>
                      <rect
                        x={b.x}
                        y={b.y}
                        width={b.w}
                        height={b.h}
                        rx={12}
                        fill={b.color}
                        fillOpacity={0.04}
                        stroke={b.color}
                        strokeOpacity={0.3}
                        strokeWidth={1.5}
                        strokeDasharray="6 4"
                      />
                      <text
                        x={b.x + 12}
                        y={b.y + 20}
                        fontSize={11}
                        fill={b.color}
                        fillOpacity={0.85}
                        fontWeight={600}
                      >
                        {b.label}
                      </text>
                    </g>
                  ))}
                  {topo.edges.map((e) => (
                    <line
                      key={`${e.from}>${e.to}`}
                      data-testid="topology-edge"
                      x1={e.x1}
                      y1={e.y1}
                      x2={e.x2}
                      y2={e.y2}
                      stroke="#71717a"
                      strokeOpacity={0.5}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />
                  ))}
                  {topo.nodes.map((n) => {
                    const color = TYPE_COLOR[n.type]
                    const ring = HEALTH_COLOR[n.health]
                    const frac = n.desired > 0 ? Math.min(1, n.ready / n.desired) : 0
                    const arc = n.health === 'down' ? CIRC : frac * CIRC
                    const sel = n.id === selectedId
                    const select = () => setSelectedId(n.id)
                    return (
                      <g
                        key={n.id}
                        data-testid={`node-${n.name}`}
                        transform={`translate(${n.x},${n.y})`}
                        role="button"
                        tabIndex={0}
                        aria-label={`${n.type} ${n.name}`}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          select()
                        }}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault()
                            select()
                          }
                        }}
                        className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand/60"
                        style={{ cursor: 'pointer' }}
                      >
                        {sel && (
                          <circle
                            r={R_RING + 8}
                            fill="none"
                            stroke="#ee0000"
                            strokeWidth={2}
                            strokeDasharray="5 3"
                            opacity={0.8}
                          />
                        )}
                        <circle
                          r={R_RING}
                          fill="none"
                          stroke={n.health === 'down' ? '#52525b' : 'rgba(255,255,255,0.06)'}
                          strokeWidth={6}
                        />
                        {arc > 0 && n.health !== 'down' && (
                          <circle
                            data-testid={`ring-${n.name}`}
                            r={R_RING}
                            fill="none"
                            stroke={ring}
                            strokeWidth={6}
                            strokeDasharray={`${arc} ${CIRC - arc}`}
                            strokeDashoffset={-(CIRC / 4)}
                            strokeLinecap="round"
                          />
                        )}
                        <path
                          d="M0,-30 L26,-15 L26,15 L0,30 L-26,15 L-26,-15 Z"
                          fill="#1a1f2e"
                          stroke={color}
                          strokeWidth={1.5}
                        />
                        <text
                          y={5}
                          textAnchor="middle"
                          fontSize={13}
                          fontWeight={700}
                          fill={color}
                          fontFamily="monospace"
                        >
                          {TYPE_GLYPH[n.type]}
                        </text>
                        {n.health === 'down' && (
                          <circle cx={-26} cy={-26} r={4} fill="#ef4444" data-testid="down-dot" />
                        )}
                        {n.exposed && (
                          <g transform="translate(22,-26)" data-testid={`route-${n.name}`}>
                            <circle r={7} fill="#0ea5e9" />
                            <text
                              y={3}
                              textAnchor="middle"
                              fontSize={8}
                              fill="white"
                              fontWeight="bold"
                            >
                              R
                            </text>
                          </g>
                        )}
                        <text
                          data-testid={`count-${n.name}`}
                          y={R_RING + 14}
                          textAnchor="middle"
                          fontSize={10}
                          fill={ring}
                          fontWeight={600}
                        >
                          {n.ready}/{n.desired}
                        </text>
                        <text
                          y={R_RING + 27}
                          textAnchor="middle"
                          fontSize={11}
                          fill="#e2e8f0"
                          fontWeight={500}
                        >
                          {n.name.length > 14 ? `${n.name.slice(0, 13)}…` : n.name}
                        </text>
                        <text y={R_RING + 39} textAnchor="middle" fontSize={9} fill="#71717a">
                          {n.type}
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
                  className="text-zinc-500 hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-brand/60 rounded"
                >
                  <Icon name="close" className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-3 text-xs">
                {[
                  { label: 'Type', value: selected.type },
                  { label: 'Namespace', value: selected.namespace },
                  { label: 'Pods', value: `${selected.ready}/${selected.desired} ready` },
                  { label: 'Health', value: selected.health },
                  { label: 'Route', value: selected.exposed ? 'Exposed' : 'None' },
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
