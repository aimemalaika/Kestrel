import type { K8sObject } from '../contract/types'
import type { WorkloadEdge } from '../modules/topology/topologyEdges'

export type WorkloadType = 'Deployment' | 'StatefulSet' | 'DaemonSet'
export type Health = 'healthy' | 'degraded' | 'down'

export interface Workload {
  id: string
  name: string
  namespace: string
  type: WorkloadType
  ready: number
  desired: number
  health: Health
  exposed: boolean
}
export interface PlacedNode extends Workload {
  x: number
  y: number
}
export interface NsBox {
  namespace: string
  label: string
  color: string
  x: number
  y: number
  w: number
  h: number
}
export interface PlacedEdge {
  from: string
  to: string
  x1: number
  y1: number
  x2: number
  y2: number
}
export interface Topology {
  nodes: PlacedNode[]
  boxes: NsBox[]
  edges: PlacedEdge[]
  width: number
  height: number
}

export const NS_COLORS: Record<string, string> = {
  production: '#34d399',
  staging: '#38bdf8',
  monitoring: '#a78bfa',
}
const FALLBACK_COLORS = ['#fbbf24', '#f472b6', '#2dd4bf', '#fb923c']
const NS_ORDER = ['production', 'staging', 'monitoring']

const CELL_W = 150
const CELL_H = 150
const BOX_PAD = 20
const BOX_HEAD = 32
const BOX_GAP = 40
const MARGIN = 20

type Spec = { replicas?: number }
type Status = {
  readyReplicas?: number
  numberReady?: number
  desiredNumberScheduled?: number
}

export function healthOf(ready: number, desired: number): Health {
  if (desired > 0 && ready >= desired) return 'healthy'
  if (ready <= 0) return 'down'
  return 'degraded'
}

export function toWorkload(o: K8sObject, type: WorkloadType): Workload {
  const spec = ((o as unknown as { spec?: Spec }).spec ?? {}) as Spec
  const st = ((o as unknown as { status?: Status }).status ?? {}) as Status
  const desired = type === 'DaemonSet' ? (st.desiredNumberScheduled ?? 0) : (spec.replicas ?? 0)
  const ready = type === 'DaemonSet' ? (st.numberReady ?? 0) : (st.readyReplicas ?? 0)
  const ns = o.metadata.namespace ?? ''
  const ann = (o.metadata as { annotations?: Record<string, string> }).annotations ?? {}
  return {
    id: `${ns}/${o.metadata.name}`,
    name: o.metadata.name,
    namespace: ns,
    type,
    ready,
    desired,
    health: healthOf(ready, desired),
    exposed: ann['kestrel.io/exposed'] === 'true',
  }
}

export function nsColor(ns: string, index: number): string {
  return NS_COLORS[ns] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

function nsRank(ns: string): number {
  const i = NS_ORDER.indexOf(ns)
  return i < 0 ? NS_ORDER.length : i
}

export function layoutTopology(workloads: Workload[], edges: WorkloadEdge[]): Topology {
  const groups = new Map<string, Workload[]>()
  for (const w of workloads) groups.set(w.namespace, [...(groups.get(w.namespace) ?? []), w])
  const names = [...groups.keys()].sort((a, b) => nsRank(a) - nsRank(b) || a.localeCompare(b))

  const nodes: PlacedNode[] = []
  const boxes: NsBox[] = []
  let cursor = MARGIN
  let maxH = 0
  names.forEach((ns, i) => {
    const items = [...groups.get(ns)!].sort((a, b) => a.name.localeCompare(b.name))
    const cols = Math.min(items.length, items.length > 4 ? 3 : 2)
    const rows = Math.ceil(items.length / cols)
    const w = BOX_PAD * 2 + cols * CELL_W
    const h = BOX_HEAD + BOX_PAD + rows * CELL_H
    boxes.push({
      namespace: ns,
      label: ns,
      color: nsColor(ns, i),
      x: cursor,
      y: MARGIN,
      w,
      h,
    })
    items.forEach((it, k) => {
      nodes.push({
        ...it,
        x: cursor + BOX_PAD + (k % cols) * CELL_W + CELL_W / 2,
        y: MARGIN + BOX_HEAD + Math.floor(k / cols) * CELL_H + 50,
      })
    })
    cursor += w + BOX_GAP
    maxH = Math.max(maxH, h)
  })

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const placed: PlacedEdge[] = []
  for (const e of edges) {
    const a = byId.get(e.from)
    const b = byId.get(e.to)
    if (!a || !b) continue
    placed.push({ from: e.from, to: e.to, x1: a.x, y1: a.y, x2: b.x, y2: b.y })
  }
  return {
    nodes,
    boxes,
    edges: placed,
    width: Math.max(cursor - BOX_GAP + MARGIN, 2 * MARGIN),
    height: maxH + 2 * MARGIN,
  }
}
