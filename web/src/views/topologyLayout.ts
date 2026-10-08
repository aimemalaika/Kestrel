import type { K8sObject } from '../contract/types'

export type TopoKind = 'Service' | 'Deployment' | 'ReplicaSet' | 'Pod'
export type Health = 'healthy' | 'degraded' | 'down' | 'unknown'

export interface TopoNode {
  id: string
  kind: TopoKind
  name: string
  namespace: string
  health: Health
  col: number
  x: number
  y: number
  detail: { label: string; value: string }[]
}
export interface TopoEdge {
  from: string
  to: string
}
export interface Topology {
  nodes: TopoNode[]
  edges: TopoEdge[]
  width: number
  height: number
}

export const NODE_W = 160
export const NODE_H = 44
const COL_GAP = 60
const ROW_GAP = 14
const PAD = 16
const KIND_COL: Record<TopoKind, number> = { Service: 0, Deployment: 1, ReplicaSet: 2, Pod: 3 }

const nodeId = (kind: TopoKind, o: K8sObject) =>
  `${kind}/${o.metadata.namespace ?? ''}/${o.metadata.name}`

function phase(p: K8sObject): string | undefined {
  return (p as unknown as { status?: { phase?: string } }).status?.phase
}

function podHealth(p: K8sObject): Health {
  const ph = phase(p)
  if (!ph) return 'unknown'
  if (ph === 'Running' || ph === 'Succeeded') return 'healthy'
  if (ph === 'Failed') return 'down'
  return 'degraded'
}

function rollup(hs: Health[]): Health {
  if (hs.length === 0) return 'unknown'
  const known = hs.filter((h) => h !== 'unknown')
  if (known.length === 0) return 'unknown'
  if (known.every((h) => h === 'healthy')) return 'healthy'
  if (known.every((h) => h === 'down')) return 'down'
  return 'degraded'
}

function owners(o: K8sObject): { kind: string; name: string }[] {
  const r = (o.metadata as { ownerReferences?: { kind: string; name: string }[] }).ownerReferences
  return Array.isArray(r) ? r : []
}

function labelsOf(o: K8sObject): Record<string, string> {
  return (o.metadata as { labels?: Record<string, string> }).labels ?? {}
}

export function buildTopology(input: {
  deployments: K8sObject[]
  replicasets: K8sObject[]
  pods: K8sObject[]
  services: K8sObject[]
}): Topology {
  const { deployments, replicasets, pods, services } = input
  const nodes: TopoNode[] = []
  const edges: TopoEdge[] = []
  const byId = new Map<string, TopoNode>()
  const add = (kind: TopoKind, o: K8sObject, health: Health, detail: TopoNode['detail']) => {
    const n: TopoNode = {
      id: nodeId(kind, o),
      kind,
      name: o.metadata.name,
      namespace: o.metadata.namespace ?? '',
      health,
      col: KIND_COL[kind],
      x: 0,
      y: 0,
      detail,
    }
    nodes.push(n)
    byId.set(n.id, n)
    return n
  }

  const podNodes = pods.map((p) =>
    add('Pod', p, podHealth(p), [{ label: 'Phase', value: phase(p) ?? '—' }]),
  )
  const podByNode = new Map<K8sObject, TopoNode>(pods.map((p, i) => [p, podNodes[i]]))

  // Parent links: pod -> ReplicaSet, ReplicaSet -> Deployment (ownerReferences).
  const rsNodes = replicasets.map((r) => add('ReplicaSet', r, 'unknown', []))
  const depNodes = deployments.map((d) => add('Deployment', d, 'unknown', []))
  const kids = new Map<string, TopoNode[]>()
  const link = (parent: TopoNode, child: TopoNode) => {
    edges.push({ from: parent.id, to: child.id })
    kids.set(parent.id, [...(kids.get(parent.id) ?? []), child])
  }
  const findOwner = (o: K8sObject, kind: TopoKind): TopoNode | undefined => {
    const ref = owners(o).find((x) => x.kind === kind)
    return ref ? byId.get(`${kind}/${o.metadata.namespace ?? ''}/${ref.name}`) : undefined
  }
  pods.forEach((p) => {
    const rs = findOwner(p, 'ReplicaSet')
    if (rs) link(rs, podByNode.get(p)!)
  })
  replicasets.forEach((r, i) => {
    const d = findOwner(r, 'Deployment')
    if (d) link(d, rsNodes[i])
  })
  // Roll health up (pods -> replicasets -> deployments).
  for (const rs of rsNodes) {
    const c = kids.get(rs.id) ?? []
    rs.health = rollup(c.map((x) => x.health))
    rs.detail = [
      {
        label: 'Pods',
        value: `${c.filter((x) => x.health === 'healthy').length} / ${c.length} healthy`,
      },
    ]
  }
  for (const d of depNodes) {
    const c = kids.get(d.id) ?? []
    d.health = rollup(c.map((x) => x.health))
    d.detail = [{ label: 'ReplicaSets', value: String(c.length) }]
  }

  // Services: edge to each Deployment (or owning root) whose pods match the selector.
  const rootOf = (n: TopoNode): TopoNode => {
    const parent = edges.find((e) => e.to === n.id)
    return parent ? rootOf(byId.get(parent.from)!) : n
  }
  for (const s of services) {
    const sel = (s as unknown as { spec?: { selector?: Record<string, string> } }).spec?.selector
    const entries = Object.entries(sel ?? {})
    const sn = add('Service', s, 'unknown', [
      { label: 'Selector', value: entries.map(([k, v]) => `${k}=${v}`).join(', ') || '—' },
    ])
    if (entries.length === 0) continue
    const targets = new Set<string>()
    pods.forEach((p) => {
      const l = labelsOf(p)
      if (p.metadata.namespace === s.metadata.namespace && entries.every(([k, v]) => l[k] === v))
        targets.add(rootOf(podByNode.get(p)!).id)
    })
    targets.forEach((t) => edges.push({ from: sn.id, to: t }))
    sn.health = rollup([...targets].map((t) => byId.get(t)!.health))
  }

  // Layered layout: column by kind, rows in stable name order; children sit near parents.
  const cols: TopoNode[][] = [[], [], [], []]
  nodes.forEach((n) => cols[n.col].push(n))
  cols.forEach((c) => c.sort((a, b) => a.name.localeCompare(b.name)))
  let maxRows = 0
  cols.forEach((c, ci) => {
    c.forEach((n, ri) => {
      n.x = PAD + ci * (NODE_W + COL_GAP)
      n.y = PAD + ri * (NODE_H + ROW_GAP)
    })
    maxRows = Math.max(maxRows, c.length)
  })
  return {
    nodes,
    edges,
    width: PAD * 2 + cols.length * NODE_W + (cols.length - 1) * COL_GAP,
    height: PAD * 2 + Math.max(1, maxRows) * NODE_H + Math.max(0, maxRows - 1) * ROW_GAP,
  }
}
