import { describe, it, expect } from 'vitest'
import { columnSpecs, getPath, ageString, scanSummary, durationString } from './columns'
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
    expect(ids).not.toContain('status.phase')
    expect(ids).toContain('status')
    expect(ids).toContain('age')
    expect(cols.find((c) => c.id === 'name')!.value(pod)).toBe('web-1')
  })

  it('Pod has a single Status column at position 3, no duplicate Phase', () => {
    const cols = columnSpecs('Pod', { namespaceSelected: false })
    const ids = cols.map((c) => c.id)
    expect(ids).toEqual([
      'name',
      'namespace',
      'status',
      'ready',
      'restarts',
      'status.usage.cpu',
      'status.usage.memory',
      'spec.nodeName',
      'age',
    ])
    expect(ids.filter((id) => id === 'status.phase')).toHaveLength(0)
    const sel = columnSpecs('Pod', { namespaceSelected: true }).map((c) => c.id)
    expect(sel).toEqual([
      'name',
      'status',
      'ready',
      'restarts',
      'status.usage.cpu',
      'status.usage.memory',
      'spec.nodeName',
      'age',
    ])
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
    const headersNs = (k: string) =>
      columnSpecs(k, { namespaceSelected: false }).map((c) => c.header)
    expect(headersNs('Role')).toEqual(['Name', 'Type', 'Namespace', 'Rules', 'Age'])
    expect(headersNs('ClusterRole')).toEqual(['Name', 'Type', 'Namespace', 'Rules', 'Age'])
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
    expect(headers('PersistentVolume')).toEqual([
      'Name',
      'Capacity',
      'Access Mode',
      'Status',
      'Claim',
      'StorageClass',
      'Age',
    ])
    expect(headers('PersistentVolume')).not.toContain('Reclaim')
    expect(headers('Route')).toEqual(
      expect.arrayContaining(['Host', 'Service', 'Port', 'TLS', 'Status']),
    )
    expect(headers('PersistentVolumeClaim')).toEqual(
      expect.arrayContaining(['Status', 'Capacity', 'StorageClass']),
    )
    expect(headers('StorageClass')).toContain('Provisioner')
  })
  it('StatefulSet/DaemonSet derive readiness; no blank status.phase pill', () => {
    const sts: K8sObject = {
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: { name: 's' },
      spec: { replicas: 3 },
      status: { readyReplicas: 2 },
    }
    const ids = columnSpecs('StatefulSet', { namespaceSelected: true }).map((c) => c.id)
    expect(ids).not.toContain('status') // generic phase column removed
    const v = (h: string, o: K8sObject) =>
      columnSpecs(o.kind, { namespaceSelected: true })
        .find((c) => c.header === h)!
        .value(o)
    expect(v('Ready', sts)).toBe('2/3')
    const ds: K8sObject = {
      apiVersion: 'apps/v1',
      kind: 'DaemonSet',
      metadata: { name: 'd' },
      status: { numberReady: 4, desiredNumberScheduled: 6 },
    }
    expect(v('Ready', ds)).toBe('4/6')
  })
  it('Ingress shows hosts/address, not a status.phase pill', () => {
    const ing: K8sObject = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: { name: 'i' },
      spec: { rules: [{ host: 'a.example.com' }, { host: 'b.example.com' }] },
      status: { loadBalancer: { ingress: [{ ip: '10.233.0.5' }] } },
    }
    const ids = columnSpecs('Ingress', { namespaceSelected: true }).map((c) => c.id)
    expect(ids).not.toContain('status')
    const v = (h: string) =>
      columnSpecs('Ingress', { namespaceSelected: true })
        .find((c) => c.header === h)!
        .value(ing)
    expect(v('Hosts')).toBe('a.example.com, b.example.com')
    expect(v('Address')).toBe('10.233.0.5')
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

describe('Tekton core columns', () => {
  const run = (kind: string, status: Record<string, unknown> = {}): K8sObject => ({
    apiVersion: 'tekton.dev/v1',
    kind,
    metadata: { name: 'r' },
    status,
  })
  const statusOf = (kind: string, conds: unknown[]) =>
    columnSpecs(kind, { namespaceSelected: true })
      .find((c) => c.id === 'status')!
      .value(run(kind, { conditions: conds }))

  it('derives run status from the Succeeded condition', () => {
    expect(statusOf('PipelineRun', [{ type: 'Succeeded', status: 'True' }])).toBe('Succeeded')
    expect(statusOf('PipelineRun', [{ type: 'Succeeded', status: 'False' }])).toBe('Failed')
    expect(
      statusOf('PipelineRun', [
        { type: 'Succeeded', status: 'False', reason: 'PipelineRunCancelled' },
      ]),
    ).toBe('Cancelled')
    expect(statusOf('TaskRun', [{ type: 'Succeeded', status: 'Unknown', reason: 'Running' }])).toBe(
      'Running',
    )
    expect(statusOf('CustomRun', [])).toBe('—')
  })

  it('has the expected column order for runs', () => {
    const h = (k: string) => columnSpecs(k, { namespaceSelected: false }).map((c) => c.header)
    expect(h('PipelineRun')).toEqual([
      'Name',
      'Namespace',
      'Status',
      'Pipeline',
      'Started',
      'Duration',
      'Vulnerabilities',
      'Age',
    ])
    expect(h('TaskRun')).toEqual([
      'Name',
      'Namespace',
      'Status',
      'Task',
      'Started',
      'Duration',
      'Pod',
      'Age',
    ])
  })

  it('Pipeline/Task/StepAction have no Status column; counts derive', () => {
    const h = (k: string) => columnSpecs(k, { namespaceSelected: true }).map((c) => c.header)
    expect(h('Pipeline')).toEqual(['Name', 'Tasks', 'Age'])
    expect(h('Task')).toEqual(['Name', 'Steps', 'Age'])
    expect(h('StepAction')).toEqual(['Name', 'Image', 'Age'])
    const p: K8sObject = {
      apiVersion: 'tekton.dev/v1',
      kind: 'Pipeline',
      metadata: { name: 'p' },
      spec: { tasks: [{}, {}, {}] },
    }
    expect(
      columnSpecs('Pipeline', { namespaceSelected: true })
        .find((c) => c.header === 'Tasks')!
        .value(p),
    ).toBe('3')
  })

  it('durationString is stable with explicit timestamps', () => {
    const o = run('TaskRun', {
      startTime: '2020-01-01T00:00:00Z',
      completionTime: '2020-01-01T01:02:03Z',
    })
    expect(durationString(o)).toBe('1h2m3s')
    expect(
      durationString(
        run('TaskRun', { startTime: '2020-01-01T00:00:00Z' }),
        Date.parse('2020-01-01T00:01:05Z'),
      ),
    ).toBe('1m5s')
    expect(durationString(run('TaskRun'))).toBeUndefined()
  })
})

describe('Tekton Triggers columns', () => {
  const el = (conds: unknown[]): K8sObject => ({
    apiVersion: 'triggers.tekton.dev/v1beta1',
    kind: 'EventListener',
    metadata: { name: 'l' },
    status: { address: { url: 'http://el.ns.svc:8080' }, conditions: conds },
  })
  const specs = (k: string) => columnSpecs(k, { namespaceSelected: true })

  it('EventListener shows Address and a Ready-derived status', () => {
    const cols = specs('EventListener')
    expect(cols.map((c) => c.header)).toContain('Address')
    expect(cols.find((c) => c.header === 'Address')!.value(el([]))).toBe('http://el.ns.svc:8080')
    const st = cols.find((c) => c.id === 'status')!
    expect(st.value(el([{ type: 'Ready', status: 'True' }]))).toBe('Ready')
    expect(st.value(el([{ type: 'Ready', status: 'False' }]))).toBe('NotReady')
    expect(st.value(el([{ type: 'Ready', status: 'Unknown' }]))).toBe('Pending')
    expect(st.value(el([]))).toBe('—')
  })

  it('config kinds have no Status column', () => {
    for (const k of [
      'Trigger',
      'TriggerBinding',
      'TriggerTemplate',
      'ClusterTriggerBinding',
      'Interceptor',
      'ClusterInterceptor',
    ]) {
      expect(specs(k).some((c) => c.id === 'status')).toBe(false)
    }
  })
})

describe('Supply Chain columns', () => {
  const specs = (k: string) => columnSpecs(k, { namespaceSelected: true })
  const rr = (labels: Record<string, string> | undefined, conds: unknown[]): K8sObject => ({
    apiVersion: 'resolution.tekton.dev/v1beta1',
    kind: 'ResolutionRequest',
    metadata: { name: 'r', labels },
    status: { conditions: conds },
  })

  it('ResolutionRequest shows Resolver from the label and a Succeeded-derived status', () => {
    const cols = specs('ResolutionRequest')
    const resolver = cols.find((c) => c.header === 'Resolver')!
    expect(resolver.value(rr({ 'resolution.tekton.dev/type': 'git' }, []))).toBe('git')
    expect(resolver.value(rr(undefined, []))).toBe('—')
    const st = cols.find((c) => c.id === 'status')!
    expect(st.value(rr({}, [{ type: 'Succeeded', status: 'True' }]))).toBe('Succeeded')
    expect(st.value(rr({}, [{ type: 'Succeeded', status: 'False' }]))).toBe('Failed')
    expect(st.value(rr({}, [{ type: 'Succeeded', status: 'Unknown' }]))).toBe('Running')
  })

  it('VerificationPolicy shows Mode and Authorities and no Status column', () => {
    const cols = specs('VerificationPolicy')
    const o: K8sObject = {
      apiVersion: 'tekton.dev/v1alpha1',
      kind: 'VerificationPolicy',
      metadata: { name: 'p' },
      spec: { mode: 'enforce', authorities: [{ name: 'a' }, { name: 'b' }] },
    }
    expect(cols.find((c) => c.header === 'Mode')!.value(o)).toBe('enforce')
    expect(cols.find((c) => c.header === 'Authorities')!.value(o)).toBe('2')
    expect(cols.some((c) => c.id === 'status')).toBe(false)
  })
})

describe('ManualApprovalGate columns', () => {
  const g: K8sObject = {
    apiVersion: 'openshift-pipelines.org/v1alpha1',
    kind: 'ManualApprovalGate',
    metadata: { name: 'g' },
    spec: { approvalsRequired: 2, approvers: ['a', 'b', 'c'] },
    status: { state: 'pending' },
  }
  it('shows State from status.state, Required and Approvers count', () => {
    const cols = columnSpecs('ManualApprovalGate', { namespaceSelected: true })
    expect(cols.map((c) => c.header)).toEqual(['Name', 'Status', 'Required', 'Approvers', 'Age'])
    expect(cols.find((c) => c.id === 'status')!.value(g)).toBe('pending')
    expect(cols.find((c) => c.header === 'Required')!.value(g)).toBe('2')
    expect(cols.find((c) => c.header === 'Approvers')!.value(g)).toBe('3')
  })
})
