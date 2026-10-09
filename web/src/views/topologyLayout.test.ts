import { describe, it, expect } from 'vitest'
import { healthOf, layoutTopology, toWorkload, type Workload } from './topologyLayout'
import type { K8sObject } from '../contract/types'

const w = (ns: string, name: string): Workload => ({
  id: `${ns}/${name}`,
  name,
  namespace: ns,
  type: 'Deployment',
  ready: 1,
  desired: 1,
  health: 'healthy',
  exposed: false,
})

describe('topologyLayout', () => {
  it('computes health from ready/desired', () => {
    expect(healthOf(3, 3)).toBe('healthy')
    expect(healthOf(0, 2)).toBe('down')
    expect(healthOf(1, 2)).toBe('degraded')
  })
  it('maps workload objects', () => {
    const o = {
      metadata: { name: 'a', namespace: 'x', annotations: { 'kestrel.io/exposed': 'true' } },
      spec: { replicas: 2 },
      status: { readyReplicas: 0 },
    } as unknown as K8sObject
    const r = toWorkload(o, 'Deployment')
    expect(r).toMatchObject({ id: 'x/a', health: 'down', exposed: true, desired: 2 })
  })
  it('groups by namespace, orders boxes, keeps nodes inside, drops dangling edges', () => {
    const t = layoutTopology(
      [w('monitoring', 'p'), w('staging', 's'), w('production', 'a'), w('production', 'b')],
      [
        { from: 'production/a', to: 'staging/s' },
        { from: 'production/a', to: 'nope/x' },
      ],
    )
    expect(t.boxes.map((b) => b.namespace)).toEqual(['production', 'staging', 'monitoring'])
    for (const n of t.nodes) {
      const b = t.boxes.find((x) => x.namespace === n.namespace)!
      expect(n.x).toBeGreaterThan(b.x)
      expect(n.x).toBeLessThan(b.x + b.w)
      expect(n.y).toBeLessThan(b.y + b.h)
    }
    expect(t.edges).toHaveLength(1)
    expect(layoutTopology([w('production', 'a')], [])).toEqual(
      layoutTopology([w('production', 'a')], []),
    )
  })
})
