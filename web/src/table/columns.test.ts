import { describe, it, expect } from 'vitest'
import { columnSpecs, getPath, ageString, scanSummary } from './columns'
import type { K8sObject } from '../contract/types'

const pod: K8sObject = {
  apiVersion: 'v1',
  kind: 'Pod',
  metadata: { name: 'web-1', namespace: 'default', creationTimestamp: '2020-01-01T00:00:00Z' },
  spec: { nodeName: 'node-1' },
  status: { phase: 'Running' },
}

describe('getPath', () => {
  it('reads dot paths and returns undefined for misses', () => {
    expect(getPath(pod, 'status.phase')).toBe('Running')
    expect(getPath(pod, 'spec.nodeName')).toBe('node-1')
    expect(getPath(pod, 'spec.missing.deep')).toBeUndefined()
  })
})

describe('ageString', () => {
  it('formats elapsed time', () => {
    const now = Date.parse('2020-01-01T00:00:45Z')
    expect(ageString('2020-01-01T00:00:00Z', now)).toBe('45s')
    expect(ageString('2020-01-01T00:00:00Z', Date.parse('2020-01-01T02:00:00Z'))).toBe('2h')
    expect(ageString(undefined)).toBe('—')
  })
})

describe('columnSpecs', () => {
  it('default columns + Pod hints, omits Namespace when a namespace is selected', () => {
    const cols = columnSpecs('Pod', { namespaceSelected: true })
    const ids = cols.map((c) => c.id)
    expect(ids).toContain('name')
    expect(ids).not.toContain('namespace')
    expect(ids).toContain('status.phase')
    expect(ids).toContain('status')
    expect(ids).toContain('age')
    expect(cols.find((c) => c.id === 'name')!.value(pod)).toBe('web-1')
  })

  it('includes Namespace when none selected; unknown kind gets defaults only', () => {
    const cols = columnSpecs('Widget', { namespaceSelected: false })
    const ids = cols.map((c) => c.id)
    expect(ids).toContain('namespace')
    expect(ids).toEqual(['name', 'namespace', 'status', 'age'])
  })
})

describe('scanSummary / scan column', () => {
  const run: K8sObject = {
    apiVersion: 'tekton.dev/v1',
    kind: 'PipelineRun',
    metadata: { name: 'r1' },
    status: {
      results: [{ name: 'IMAGE_SCAN_OUTPUT', value: '{"critical":1,"high":2,"medium":3,"low":4}' }],
    },
  }
  it('parses SCAN_OUTPUT counts', () => {
    expect(scanSummary(run)).toEqual({ critical: 1, high: 2, medium: 3, low: 4 })
  })
  it('returns undefined when absent', () => {
    expect(scanSummary(pod)).toBeUndefined()
  })
  it('adds scan column only for PipelineRun', () => {
    const ids = (k: string) => columnSpecs(k, { namespaceSelected: true }).map((c) => c.id)
    expect(ids('PipelineRun')).toContain('scan')
    expect(ids('Pod')).not.toContain('scan')
  })
})

describe('per-kind rich columns', () => {
  const headers = (k: string) => columnSpecs(k, { namespaceSelected: true }).map((c) => c.header)
  it('declares per-kind column sets', () => {
    expect(headers('Pod')).toEqual(
      expect.arrayContaining(['Ready', 'Restarts', 'CPU', 'Memory', 'Node', 'Age']),
    )
    expect(headers('Deployment')).toEqual(
      expect.arrayContaining(['Ready', 'Up-to-date', 'Available', 'Strategy', 'Image']),
    )
    expect(headers('Service')).toEqual(expect.arrayContaining(['Type', 'ClusterIP', 'Ports']))
    expect(headers('Route')).toEqual(
      expect.arrayContaining(['Host', 'Service', 'Port', 'TLS', 'Status']),
    )
    expect(headers('PersistentVolumeClaim')).toEqual(
      expect.arrayContaining(['Status', 'Capacity', 'StorageClass']),
    )
    expect(headers('PersistentVolume')).toEqual(
      expect.arrayContaining(['Capacity', 'Reclaim', 'Status']),
    )
    expect(headers('StorageClass')).toContain('Provisioner')
  })
  const val = (k: string, h: string, o: K8sObject) =>
    columnSpecs(k, { namespaceSelected: true })
      .find((c) => c.header === h)!
      .value(o)
  it('pod without status.usage shows n/a; with usage shows percent', () => {
    expect(val('Pod', 'CPU', pod)).toBe('n/a')
    const withU = { ...pod, status: { phase: 'Running', usage: { cpu: '34', memory: '52' } } }
    expect(val('Pod', 'CPU', withU)).toBe('34')
    expect(val('Pod', 'Memory', withU)).toBe('52')
  })
  it('derives pod ready/restarts and deployment ready', () => {
    const p: K8sObject = {
      ...pod,
      spec: { containers: [{ name: 'a' }, { name: 'b' }] },
      status: {
        phase: 'Running',
        containerStatuses: [
          { ready: true, restartCount: 2 },
          { ready: false, restartCount: 4 },
        ],
      },
    }
    expect(val('Pod', 'Ready', p)).toBe('1/2')
    expect(val('Pod', 'Restarts', p)).toBe('6')
    const d: K8sObject = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'd' },
      spec: { replicas: 3 },
      status: { readyReplicas: 2 },
    }
    expect(val('Deployment', 'Ready', d)).toBe('2/3')
  })
  it('derives service ports and route tls', () => {
    const svc: K8sObject = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: 's' },
      spec: { type: 'ClusterIP', ports: [{ port: 80, protocol: 'TCP' }] },
    }
    expect(val('Service', 'Ports', svc)).toBe('80/TCP')
    const r: K8sObject = {
      apiVersion: 'route.openshift.io/v1',
      kind: 'Route',
      metadata: { name: 'r' },
      spec: { host: 'h', tls: {} },
    }
    expect(val('Route', 'TLS', r)).toBe('Enabled')
  })
})
