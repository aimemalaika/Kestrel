import { describe, it, expect } from 'vitest'
import { rbacSubjects } from './subjects'
import type { K8sObject } from '../../contract/types'

const b = (name: string, namespace: string | undefined, role: string, subjects: unknown[]) =>
  ({ metadata: { name, namespace }, roleRef: { name: role }, subjects }) as unknown as K8sObject

describe('rbacSubjects', () => {
  const rbs = [
    b('rb1', 'shop', 'edit', [
      { kind: 'User', name: 'bob' },
      { kind: 'User', name: 'bob' },
      { kind: 'Group', name: 'devs' },
      { kind: 'ServiceAccount', name: 'sa', namespace: 'shop' },
    ]),
  ]
  const crbs = [
    b('crb1', undefined, 'cluster-reader', [{ kind: 'User', name: 'alice' }]),
    b('crb2', undefined, 'view', [
      { kind: 'User', name: 'bob' },
      { kind: 'Group', name: 'admins' },
    ]),
    b('crb3', undefined, 'none', []),
  ]
  it('collects distinct users sorted, with their bindings', () => {
    const u = rbacSubjects(rbs, crbs, 'User')
    expect(u.map((s) => s.name)).toEqual(['alice', 'bob'])
    expect(u[1].bindings).toEqual([
      { name: 'rb1', namespace: 'shop', role: 'edit' },
      { name: 'crb2', namespace: undefined, role: 'view' },
    ])
  })
  it('collects groups only', () => {
    expect(rbacSubjects(rbs, crbs, 'Group').map((s) => s.name)).toEqual(['admins', 'devs'])
  })
  it('handles missing subjects', () => {
    expect(rbacSubjects([b('x', 'a', 'r', [])], [], 'User')).toEqual([])
  })
})
