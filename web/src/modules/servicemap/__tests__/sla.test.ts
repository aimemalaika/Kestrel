import { describe, it, expect } from 'vitest'
import { parseServiceMap } from '../parse'
import { projectSla } from '../sla'
import { SAMPLE_YAML } from '../sample'
import type { ServiceMapModel } from '../types'

describe('projectSla', () => {
  it('matches the design worked example', () => {
    const r = parseServiceMap(SAMPLE_YAML)
    if (!r.ok) throw new Error('bad sample')
    const m = projectSla(r.model)
    expect(m.get('ledger')!.projected).toBeCloseTo(99.99, 4)
    expect(m.get('payments')!.projected).toBeCloseTo(99.94, 2)
    const c = m.get('checkout')!
    expect(c.projected).toBeCloseTo(99.84, 2)
    expect(c.declared).toBe(99.9)
    expect(c.limitedBy).toBe('payments')
    expect(c.path).toEqual(['ledger', 'payments', 'checkout'])
  })
  it('soft deps do not multiply', () => {
    const model: ServiceMapModel = {
      name: 't',
      services: [
        { id: 'a', displayName: 'a', slo: 99.9, dependsOn: [{ id: 'b', critical: false }] },
        { id: 'b', displayName: 'b', slo: 50, dependsOn: [] },
      ],
    }
    const a = projectSla(model).get('a')!
    expect(a.projected).toBeCloseTo(99.9, 6)
    expect(a.limitedBy).toBeUndefined()
  })
})
