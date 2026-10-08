import { describe, it, expect } from 'vitest'
import { layoutGraph } from '../layout'
import type { ServiceMapModel } from '../types'

const svc = (id: string, deps: string[] = []) => ({
  id,
  displayName: id,
  slo: 99,
  dependsOn: deps.map((d) => ({ id: d, critical: true })),
})

describe('layoutGraph', () => {
  it('lays a chain out in 3 layers (callers left)', () => {
    const m: ServiceMapModel = { name: 't', services: [svc('a', ['b']), svc('b', ['c']), svc('c')] }
    const { nodes, edges } = layoutGraph(m)
    const n = Object.fromEntries(nodes.map((x) => [x.id, x]))
    expect(n.c.layer).toBe(0)
    expect(n.b.layer).toBe(1)
    expect(n.a.layer).toBe(2)
    expect(n.a.x).toBeLessThan(n.b.x)
    expect(n.b.x).toBeLessThan(n.c.x)
    expect(edges).toHaveLength(2)
  })
  it('places diamond fork/join correctly', () => {
    const m: ServiceMapModel = {
      name: 't',
      services: [svc('top', ['l', 'r']), svc('l', ['bot']), svc('r', ['bot']), svc('bot')],
    }
    const n = Object.fromEntries(layoutGraph(m).nodes.map((x) => [x.id, x]))
    expect(n.l.x).toBe(n.r.x)
    expect(n.l.y).not.toBe(n.r.y)
    expect(n.top.x).toBeLessThan(n.l.x)
    expect(n.bot.x).toBeGreaterThan(n.l.x)
    expect(n.top.y).toBeCloseTo((n.l.y + n.r.y) / 2, 5)
  })
})
