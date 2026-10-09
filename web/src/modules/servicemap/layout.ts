import type { ServiceMapModel } from './types'

export const NODE_W = 170
export const NODE_H = 64
const COL_GAP = 250
const ROW_GAP = 100
const PAD = 24

export interface LayoutNode {
  id: string
  x: number
  y: number
  w: number
  h: number
  layer: number
}
export interface LayoutEdge {
  from: string
  to: string
  points: [number, number][]
}

/** Layered DAG layout: layer = longest path to a leaf; callers sit left of dependencies. */
export function layoutGraph(model: ServiceMapModel): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const byId = new Map(model.services.map((s) => [s.id, s]))
  const layer = new Map<string, number>()
  const depth = (id: string, guard: Set<string>): number => {
    const c = layer.get(id)
    if (c !== undefined) return c
    if (guard.has(id)) return 0
    guard.add(id)
    let l = 0
    for (const d of byId.get(id)?.dependsOn ?? []) {
      if (byId.has(d.id)) l = Math.max(l, depth(d.id, guard) + 1)
    }
    guard.delete(id)
    layer.set(id, l)
    return l
  }
  for (const s of model.services) depth(s.id, new Set())
  const maxLayer = Math.max(0, ...layer.values())

  const slots = new Map<number, string[]>()
  for (const s of model.services) {
    const l = layer.get(s.id)!
    slots.set(l, [...(slots.get(l) ?? []), s.id])
  }
  const maxSlots = Math.max(1, ...Array.from(slots.values()).map((v) => v.length))
  const height = (maxSlots - 1) * ROW_GAP

  const nodes: LayoutNode[] = []
  for (const s of model.services) {
    const l = layer.get(s.id)!
    const col = slots.get(l)!
    const i = col.indexOf(s.id)
    const colHeight = (col.length - 1) * ROW_GAP
    nodes.push({
      id: s.id,
      layer: l,
      w: NODE_W,
      h: NODE_H,
      x: PAD + (maxLayer - l) * COL_GAP,
      y: PAD + (height - colHeight) / 2 + i * ROW_GAP,
    })
  }
  const pos = new Map(nodes.map((n) => [n.id, n]))
  const edges: LayoutEdge[] = []
  for (const s of model.services) {
    for (const d of s.dependsOn) {
      const a = pos.get(s.id)
      const b = pos.get(d.id)
      if (!a || !b) continue
      const x1 = a.x + a.w
      const y1 = a.y + a.h / 2
      const x2 = b.x
      const y2 = b.y + b.h / 2
      const mx = (x1 + x2) / 2
      edges.push({
        from: s.id,
        to: d.id,
        points: [
          [x1, y1],
          [mx, y1],
          [mx, y2],
          [x2, y2],
        ],
      })
    }
  }
  return { nodes, edges }
}

export function graphSize(nodes: LayoutNode[]): { width: number; height: number } {
  return {
    width: Math.max(0, ...nodes.map((n) => n.x + n.w)) + PAD,
    height: Math.max(0, ...nodes.map((n) => n.y + n.h)) + PAD,
  }
}
