import { describe, it, expect } from 'vitest'
import { buildTopology } from './topologyLayout'
import type { K8sObject } from '../contract/types'

const o = (name: string, extra: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) =>
  ({ metadata: { name, namespace: 'a', ...meta }, ...extra }) as unknown as K8sObject

describe('buildTopology', () => {
  it('links owners, rolls up health, matches services', () => {
    const t = buildTopology({
      deployments: [o('web')],
      replicasets: [o('web-1', {}, { ownerReferences: [{ kind: 'Deployment', name: 'web' }] })],
      pods: [
        o(
          'web-1-a',
          { status: { phase: 'Running' } },
          { labels: { app: 'web' }, ownerReferences: [{ kind: 'ReplicaSet', name: 'web-1' }] },
        ),
        o(
          'web-1-b',
          { status: { phase: 'Pending' } },
          { labels: { app: 'web' }, ownerReferences: [{ kind: 'ReplicaSet', name: 'web-1' }] },
        ),
      ],
      services: [o('web-svc', { spec: { selector: { app: 'web' } } })],
    })
    expect(t.nodes).toHaveLength(5)
    expect(t.edges).toHaveLength(4)
    expect(t.nodes.find((n) => n.name === 'web')!.health).toBe('degraded')
    expect(t.edges).toContainEqual({ from: 'Service/a/web-svc', to: 'Deployment/a/web' })
  })
  it('unknown without pods', () => {
    const t = buildTopology({ deployments: [o('d')], replicasets: [], pods: [], services: [] })
    expect(t.nodes[0].health).toBe('unknown')
  })
})
