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
    expect(headers('Deployment')).toEqual([
      'Name',
      'Pods',
      'Ready',
      'Replicas',
      'Strategy',
      'Image',
      'Age',
    ])
    expect(headers('Service')).toEqual(['Name', 'Type', 'ClusterIP', 'Ports', 'Age'])
    expect(headers('ConfigMap')).toEqual(['Name', 'Keys', 'Age'])
    expect(headers('Secret')).toEqual(['Name', 'Type', 'Age'])
    expect(headers('ServiceAccount')).toEqual(['Name', 'Secrets', 'Image Pull Secrets', 'Age'])
    expect(headers('Role')).toEqual(['Name', 'Type', 'Rules', 'Age'])
    expect(headers('ClusterRole')).toEqual(['Name', 'Type', 'Rules', 'Age'])
    expect(headers('RoleBinding')).toEqual(['Name', 'Role Ref', 'Subject', 'Age'])
    expect(headers('StorageClass')).toEqual([
      'Name',
      'Provisioner',
      'Reclaim Policy',
      'Volume Binding',
      'Default',
      'Age',
    ])
    expect(headers('PersistentVolumeClaim')).toEqual([
      'Name',
      'Status',
      'Capacity',
      'Access Mode',
      'StorageClass',
      'Age',
    ])
    expect(headers('PersistentVolume')).toEqual(
      expect.arrayContaining(['Status', 'Capacity', 'Access Mode', 'Claim', 'StorageClass']),
    )
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
    expect(val('Deployment', 'Pods', d)).toBe('2/3')
    expect(val('Deployment', 'Replicas', d)).toBe('3')
    const kinds = columnSpecs('Deployment', { namespaceSelected: false }).map((c) => c.kind)
    expect(kinds).toEqual(expect.arrayContaining(['podsquares', 'scale', 'readyfrac', 'strategy']))
  })
  it('derives service ports and route tls', () => {
    const svc: K8sObject = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: 's' },
      spec: { type: 'ClusterIP', ports: [{ port: 80, protocol: 'TCP' }] },
    }
    expect(val('Service', 'Ports', svc)).toBe('80/TCP')
    const svc2: K8sObject = {
      ...svc,
      spec: { ports: [{ port: 80, targetPort: 8080, protocol: 'TCP', nodePort: 30080 }] },
    }
    expect(val('Service', 'Ports', svc2)).toBe('80:8080:30080/TCP')
    const r: K8sObject = {
      apiVersion: 'route.openshift.io/v1',
      kind: 'Route',
      metadata: { name: 'r' },
      spec: { host: 'h', tls: {} },
    }
    expect(val('Route', 'TLS', r)).toBe('Enabled')
    expect(val('Route', 'TLS', { ...r, spec: { host: 'h' } })).toBe('None')
  })
  it('derives route status, configmap keys, sc default, pv claim', () => {
    const route = (conditions: unknown[]): K8sObject => ({
      apiVersion: 'route.openshift.io/v1',
      kind: 'Route',
      metadata: { name: 'r' },
      status: { ingress: [{ conditions }] },
    })
    const st = (o: K8sObject) =>
      columnSpecs('Route', { namespaceSelected: true })
        .find((c) => c.id === 'status')!
        .value(o)
    expect(st(route([{ type: 'Admitted', status: 'True' }]))).toBe('Accepted')
    expect(st(route([{ type: 'Admitted', status: 'False' }]))).toBe('Rejected')
    const cm: K8sObject = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'c' },
      data: { a: '1', b: '2' },
    }
    expect(val('ConfigMap', 'Keys', cm)).toBe('2')
    const sc: K8sObject = {
      apiVersion: 'storage.k8s.io/v1',
      kind: 'StorageClass',
      metadata: {
        name: 's',
        annotations: { 'storageclass.kubernetes.io/is-default-class': 'true' },
      },
    }
    expect(val('StorageClass', 'Default', sc)).toBe('true')
    const pv: K8sObject = {
      apiVersion: 'v1',
      kind: 'PersistentVolume',
      metadata: { name: 'pv' },
      spec: { claimRef: { namespace: 'ns', name: 'c1' }, accessModes: ['ReadWriteOnce'] },
    }
    expect(val('PersistentVolume', 'Claim', pv)).toBe('ns/c1')
    expect(val('PersistentVolume', 'Access Mode', pv)).toBe('RWO')
  })
})
