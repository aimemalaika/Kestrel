import { describe, expect, it } from 'vitest'
import { VERBS } from './RBACClient'
import { rulesToMatrix } from './rulesToMatrix'

const allowed = (r: { verbs: Record<string, { allowed: boolean }> }) =>
  VERBS.filter((v) => r.verbs[v].allowed)

describe('rulesToMatrix', () => {
  it('expands explicit resources and verbs', () => {
    const { resources } = rulesToMatrix([
      { apiGroups: [''], resources: ['pods', 'services'], verbs: ['get', 'list'] },
      { apiGroups: [''], resources: ['pods'], verbs: ['watch'] },
    ])
    expect(resources.map((r) => r.resource)).toEqual(['pods', 'services'])
    expect(allowed(resources[0])).toEqual(['get', 'list', 'watch'])
    expect(allowed(resources[1])).toEqual(['get', 'list'])
    expect(resources[0].verbs.get.binding).toBeUndefined()
  })
  it('expands * verbs and * resources/groups', () => {
    const { resources } = rulesToMatrix([{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }])
    expect(resources).toHaveLength(1)
    expect(resources[0].group).toBe('*')
    expect(resources[0].resource).toBe('*')
    expect(allowed(resources[0])).toEqual(VERBS)
  })
  it('surfaces resourceNames and nonResourceURLs', () => {
    const out = rulesToMatrix([
      { apiGroups: [''], resources: ['configmaps'], verbs: ['get'], resourceNames: ['a', 'b'] },
      { nonResourceURLs: ['/metrics', '/healthz'], verbs: ['get'] },
    ])
    expect(out.resources[0].verbs.get.resourceNames).toEqual(['a', 'b'])
    expect(out.nonResourceURLs).toEqual(['/healthz', '/metrics'])
  })
  it('keeps resourceNames per verb', () => {
    const { resources } = rulesToMatrix([
      { apiGroups: [''], resources: ['secrets'], verbs: ['get'], resourceNames: ['x'] },
      { apiGroups: [''], resources: ['secrets'], verbs: ['delete'] },
    ])
    expect(resources[0].verbs.get.resourceNames).toEqual(['x'])
    expect(resources[0].verbs.delete.allowed).toBe(true)
    expect(resources[0].verbs.delete.resourceNames).toBeUndefined()
  })
  it('lets an unrestricted grant win over a restricted one', () => {
    const { resources } = rulesToMatrix([
      { apiGroups: [''], resources: ['secrets'], verbs: ['get'], resourceNames: ['x'] },
      { apiGroups: [''], resources: ['secrets'], verbs: ['get'] },
      { apiGroups: [''], resources: ['secrets'], verbs: ['get'], resourceNames: ['y'] },
    ])
    expect(resources[0].verbs.get.allowed).toBe(true)
    expect(resources[0].verbs.get.resourceNames).toBeUndefined()
  })
  it('unions names across restricted rules', () => {
    const { resources } = rulesToMatrix([
      { apiGroups: [''], resources: ['secrets'], verbs: ['get'], resourceNames: ['x'] },
      { apiGroups: [''], resources: ['secrets'], verbs: ['get'], resourceNames: ['y'] },
    ])
    expect(resources[0].verbs.get.resourceNames).toEqual(['x', 'y'])
  })
  it('handles undefined rules', () => {
    expect(rulesToMatrix(undefined)).toEqual({ resources: [], nonResourceURLs: [] })
  })
})
