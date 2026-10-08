import { describe, it, expect } from 'vitest'
import { sectionFor, bucketCatalog } from './categoryMap'
import type { CatalogEntry } from '../contract/types'

const entry = (group: string, kind: string, resource: string): CatalogEntry => ({
  group,
  version: 'v1',
  resource,
  kind,
  namespaced: true,
  verbs: ['list', 'watch'],
})

describe('sectionFor', () => {
  it('maps known kinds to their section', () => {
    expect(sectionFor({ group: 'apps', kind: 'Deployment' })).toBe('Workloads')
    expect(sectionFor({ group: 'core', kind: 'ConfigMap' })).toBe('Config')
    expect(sectionFor({ group: 'core', kind: 'Service' })).toBe('Network')
    expect(sectionFor({ group: 'core', kind: 'PersistentVolumeClaim' })).toBe('Storage')
    expect(sectionFor({ group: 'rbac.authorization.k8s.io', kind: 'Role' })).toBe('Access Control')
    expect(sectionFor({ group: 'core', kind: 'Node' })).toBe('Cluster')
  })

  it('buckets unmapped kinds under Custom Resources', () => {
    expect(sectionFor({ group: 'tekton.dev', kind: 'PipelineRun' })).toBe('Custom Resources')
  })
})

describe('bucketCatalog', () => {
  it('groups entries by section in SECTION_ORDER, omitting empty sections', () => {
    const buckets = bucketCatalog([
      entry('apps', 'Deployment', 'deployments'),
      entry('core', 'ConfigMap', 'configmaps'),
      entry('tekton.dev', 'PipelineRun', 'pipelineruns'),
    ])
    expect(buckets.map((b) => b.section)).toEqual(['Workloads', 'Config', 'Custom Resources'])
    expect(buckets[0].items).toHaveLength(1)
  })
})
