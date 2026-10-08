import { getIdentity } from '../auth/identity'
import type { CatalogEntry, GVR, K8sObject, WatchEnvelope } from '../contract/types'
import type {
  Client,
  ExecSession,
  PortForwardSession,
  ResourceRef,
  Unsubscribe,
  WatchOptions,
} from './Client'

const CATALOG: CatalogEntry[] = [
  {
    group: 'core',
    version: 'v1',
    resource: 'pods',
    kind: 'Pod',
    namespaced: true,
    verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'],
  },
  {
    group: 'apps',
    version: 'v1',
    resource: 'deployments',
    kind: 'Deployment',
    namespaced: true,
    verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'],
  },
  {
    group: 'core',
    version: 'v1',
    resource: 'namespaces',
    kind: 'Namespace',
    namespaced: false,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'core',
    version: 'v1',
    resource: 'events',
    kind: 'Event',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'tekton.dev',
    version: 'v1',
    resource: 'pipelineruns',
    kind: 'PipelineRun',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'argoproj.io',
    version: 'v1alpha1',
    resource: 'applications',
    kind: 'Application',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'core',
    version: 'v1',
    resource: 'nodes',
    kind: 'Node',
    namespaced: false,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'core',
    version: 'v1',
    resource: 'services',
    kind: 'Service',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'core',
    version: 'v1',
    resource: 'configmaps',
    kind: 'ConfigMap',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'core',
    version: 'v1',
    resource: 'secrets',
    kind: 'Secret',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'core',
    version: 'v1',
    resource: 'persistentvolumes',
    kind: 'PersistentVolume',
    namespaced: false,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'core',
    version: 'v1',
    resource: 'persistentvolumeclaims',
    kind: 'PersistentVolumeClaim',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'storage.k8s.io',
    version: 'v1',
    resource: 'storageclasses',
    kind: 'StorageClass',
    namespaced: false,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'core',
    version: 'v1',
    resource: 'serviceaccounts',
    kind: 'ServiceAccount',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'rbac.authorization.k8s.io',
    version: 'v1',
    resource: 'roles',
    kind: 'Role',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'rbac.authorization.k8s.io',
    version: 'v1',
    resource: 'rolebindings',
    kind: 'RoleBinding',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'route.openshift.io',
    version: 'v1',
    resource: 'routes',
    kind: 'Route',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'core',
    version: 'v1',
    resource: 'resourcequotas',
    kind: 'ResourceQuota',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
]

interface MockTask {
  name: string
  succeeded: boolean
  steps: { name: string; status: 'Completed' | 'Error' }[]
}

function pipelineRun(
  name: string,
  ok: boolean,
  reason: string,
  startTime: string,
  completionTime: string,
  taskRuns: MockTask[],
  scan?: Record<string, number>,
): K8sObject {
  return {
    apiVersion: 'tekton.dev/v1',
    kind: 'PipelineRun',
    metadata: { name, namespace: 'default', uid: `pr/${name}`, creationTimestamp: startTime },
    spec: { pipelineRef: { name: 'build-and-push' } },
    status: {
      conditions: [{ type: 'Succeeded', status: ok ? 'True' : 'False', reason }],
      startTime,
      completionTime,
      taskRuns,
      results: scan ? [{ name: 'image-SCAN_OUTPUT', value: JSON.stringify(scan) }] : [],
    },
  }
}

function pod(name: string, ns: string, phase: string): K8sObject {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name,
      namespace: ns,
      uid: `${ns}/${name}`,
      creationTimestamp: new Date().toISOString(),
    },
    spec: { containers: [{ name: 'app' }] },
    status: { phase },
  }
}

function event(
  name: string,
  ns: string,
  involvedName: string,
  reason: string,
  message: string,
  lastTimestamp: string,
  type: 'Normal' | 'Warning' = 'Normal',
): K8sObject {
  return {
    apiVersion: 'v1',
    kind: 'Event',
    metadata: { name, namespace: ns, uid: `ev/${name}` },
    involvedObject: { kind: 'Pod', name: involvedName, namespace: ns },
    reason,
    message,
    lastTimestamp,
    type,
  }
}

interface MockArgoRes {
  group: string
  version: string
  kind: string
  name: string
  namespace: string
  status: string
  health: string
}

function argoApp(
  name: string,
  sync: 'Synced' | 'OutOfSync',
  health: 'Healthy' | 'Degraded' | 'Progressing',
  destNs: string,
  resources: MockArgoRes[],
): K8sObject {
  return {
    apiVersion: 'argoproj.io/v1alpha1',
    kind: 'Application',
    metadata: {
      name,
      namespace: 'argocd',
      uid: `app/${name}`,
      creationTimestamp: '2026-10-01T00:00:00Z',
    },
    spec: {
      project: 'default',
      source: {
        repoURL: `https://git.example.com/kestrel/${name}.git`,
        path: `deploy/${name}`,
        targetRevision: 'main',
      },
      destination: { server: 'https://kubernetes.default.svc', namespace: destNs },
    },
    status: { sync: { status: sync }, health: { status: health }, resources },
  }
}

interface NodeSeed {
  name: string
  role: 'control-plane' | 'worker'
  ready: boolean
  cpu: number
  memory: number
  pods: number
  zone: string
  instanceType: string
  taints: { key: string; value: string; effect: string }[]
}

// Sample metrics live at status.usage (integer-percent strings + pod count). A real
// backend without metrics-server omits status.usage and the UI shows "n/a".
function node(s: NodeSeed): K8sObject {
  const big = s.instanceType.includes('4xlarge')
  const cpu = big ? '16' : '8'
  const memory = big ? '64Gi' : '32Gi'
  return {
    apiVersion: 'v1',
    kind: 'Node',
    metadata: {
      name: s.name,
      uid: `node/${s.name}`,
      creationTimestamp: '2026-09-01T00:00:00Z',
      labels: {
        [`node-role.kubernetes.io/${s.role}`]: '',
        'topology.kubernetes.io/zone': s.zone,
        'node.kubernetes.io/instance-type': s.instanceType,
      },
    },
    spec: { taints: s.taints },
    status: {
      conditions: [
        {
          type: 'Ready',
          status: s.ready ? 'True' : 'False',
          reason: s.ready ? 'KubeletReady' : 'KubeletNotReady',
        },
        { type: 'MemoryPressure', status: 'False', reason: 'KubeletHasSufficientMemory' },
        {
          type: 'DiskPressure',
          status: s.ready ? 'False' : 'True',
          reason: 'KubeletHasDiskPressure',
        },
      ],
      capacity: { cpu, memory, pods: '110' },
      allocatable: { cpu, memory, pods: '110' },
      nodeInfo: { osImage: 'Linux 9.2', kubeletVersion: 'v1.29.3', architecture: 'amd64' },
      usage: { cpu: String(s.cpu), memory: String(s.memory), pods: String(s.pods) },
    },
  }
}

const NODE_SEEDS: NodeSeed[] = [
  {
    name: 'master-01',
    role: 'control-plane',
    ready: true,
    cpu: 12,
    memory: 43,
    pods: 14,
    zone: 'us-east-1a',
    instanceType: 'm6i.2xlarge',
    taints: [{ key: 'node-role.kubernetes.io/control-plane', value: '', effect: 'NoSchedule' }],
  },
  {
    name: 'master-02',
    role: 'control-plane',
    ready: true,
    cpu: 15,
    memory: 49,
    pods: 16,
    zone: 'us-east-1b',
    instanceType: 'm6i.2xlarge',
    taints: [],
  },
  {
    name: 'master-03',
    role: 'control-plane',
    ready: true,
    cpu: 11,
    memory: 44,
    pods: 13,
    zone: 'us-east-1c',
    instanceType: 'm6i.2xlarge',
    taints: [],
  },
  {
    name: 'worker-01',
    role: 'worker',
    ready: true,
    cpu: 67,
    memory: 71,
    pods: 32,
    zone: 'us-east-1b',
    instanceType: 'm6i.4xlarge',
    taints: [],
  },
  {
    name: 'worker-02',
    role: 'worker',
    ready: true,
    cpu: 45,
    memory: 58,
    pods: 28,
    zone: 'us-east-1c',
    instanceType: 'm6i.4xlarge',
    taints: [],
  },
  {
    name: 'worker-03',
    role: 'worker',
    ready: false,
    cpu: 91,
    memory: 87,
    pods: 19,
    zone: 'us-east-1a',
    instanceType: 'm6i.4xlarge',
    taints: [{ key: 'dedicated', value: 'gpu', effect: 'NoSchedule' }],
  },
]

function ns(name: string): K8sObject {
  return {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: { name, uid: `ns/${name}`, creationTimestamp: new Date().toISOString() },
    status: { phase: 'Active' },
  }
}

function gen(
  apiVersion: string,
  kind: string,
  name: string,
  namespace: string | undefined,
  extra: Record<string, unknown> = {},
): K8sObject {
  return {
    apiVersion,
    kind,
    metadata: {
      name,
      ...(namespace ? { namespace } : {}),
      uid: `${kind}/${namespace ?? '-'}/${name}`,
      creationTimestamp: '2026-09-15T00:00:00Z',
    },
    ...extra,
  } as K8sObject
}

function quota(ns: string, hard: Record<string, string>, used: Record<string, string>): K8sObject {
  return gen('v1', 'ResourceQuota', `${ns}-quota`, ns, { spec: { hard }, status: { hard, used } })
}

function genSeeds(): [string, K8sObject][] {
  const objs: K8sObject[] = [
    gen('v1', 'Service', 'web', 'default', {
      spec: { type: 'ClusterIP', clusterIP: '10.0.0.11', ports: [{ port: 80, protocol: 'TCP' }] },
    }),
    gen('v1', 'Service', 'cart', 'shop', {
      spec: {
        type: 'LoadBalancer',
        clusterIP: '10.0.0.21',
        ports: [{ port: 443, protocol: 'TCP' }],
      },
    }),
    gen('v1', 'ConfigMap', 'app-config', 'default', { data: { LOG_LEVEL: 'info' } }),
    gen('v1', 'ConfigMap', 'payments-config', 'shop', { data: { REGION: 'eu' } }),
    gen('v1', 'Secret', 'db-credentials', 'shop', { type: 'Opaque', data: { password: '' } }),
    gen('v1', 'Secret', 'registry-pull', 'default', { type: 'kubernetes.io/dockerconfigjson' }),
    gen('v1', 'PersistentVolume', 'pv-data-1', undefined, {
      spec: { capacity: { storage: '10Gi' }, storageClassName: 'fast' },
      status: { phase: 'Bound' },
    }),
    gen('v1', 'PersistentVolumeClaim', 'data-search-0', 'shop', {
      spec: { storageClassName: 'fast', volumeName: 'pv-data-1' },
      status: { phase: 'Bound', capacity: { storage: '10Gi' } },
    }),
    gen('storage.k8s.io/v1', 'StorageClass', 'fast', undefined, {
      provisioner: 'kubernetes.io/no-provisioner',
      reclaimPolicy: 'Delete',
    }),
    gen('v1', 'ServiceAccount', 'default', 'default', {}),
    gen('v1', 'ServiceAccount', 'deployer', 'shop', {}),
    gen('rbac.authorization.k8s.io/v1', 'Role', 'pod-reader', 'default', {
      rules: [{ apiGroups: [''], resources: ['pods'], verbs: ['get', 'list'] }],
    }),
    gen('rbac.authorization.k8s.io/v1', 'RoleBinding', 'read-pods', 'default', {
      roleRef: { kind: 'Role', name: 'pod-reader' },
      subjects: [{ kind: 'ServiceAccount', name: 'default' }],
    }),
    gen('route.openshift.io/v1', 'Route', 'shop-web', 'shop', {
      spec: { host: 'shop.example.com', to: { kind: 'Service', name: 'cart' }, tls: {} },
    }),
    quota(
      'shop',
      { cpu: '4', memory: '8Gi', pods: '20' },
      { cpu: '1.8', memory: '2300Mi', pods: '9' },
    ),
    quota('default', { cpu: '2', pods: '10' }, { cpu: '1900m', pods: '9' }),
  ]
  return objs.map((o) => [`gen/${o.kind}/${o.metadata.namespace ?? '-'}/${o.metadata.name}`, o])
}

export function createMockClient(opts: { tickMs?: number } = {}): Client {
  const tickMs = opts.tickMs ?? 2000
  const store = new Map<string, K8sObject>([
    ['default/web-1', pod('web-1', 'default', 'Running')],
    ['default/web-2', pod('web-2', 'default', 'Pending')],
    ['ns/default', ns('default')],
    ['ns/kube-system', ns('kube-system')],
    ['ns/shop', ns('shop')],
    ...genSeeds(),
    [
      'pr/build-101',
      pipelineRun(
        'build-101',
        true,
        'Succeeded',
        '2026-10-08T08:00:00Z',
        '2026-10-08T08:05:00Z',
        [
          {
            name: 'clone',
            succeeded: true,
            steps: [{ name: 'git-clone', status: 'Completed' }],
          },
          {
            name: 'build',
            succeeded: true,
            steps: [
              { name: 'compile', status: 'Completed' },
              { name: 'push', status: 'Completed' },
            ],
          },
          { name: 'scan', succeeded: true, steps: [{ name: 'trivy', status: 'Completed' }] },
        ],
        { critical: 2, high: 5, medium: 3, low: 10 },
      ),
    ],
    [
      'pr/build-102',
      pipelineRun('build-102', false, 'Failed', '2026-10-08T09:00:00Z', '2026-10-08T09:02:00Z', [
        { name: 'clone', succeeded: true, steps: [{ name: 'git-clone', status: 'Completed' }] },
        {
          name: 'build',
          succeeded: false,
          steps: [
            { name: 'compile', status: 'Error' },
            { name: 'push', status: 'Error' },
          ],
        },
      ]),
    ],
    [
      'pr/build-103',
      pipelineRun(
        'build-103',
        true,
        'Succeeded',
        '2026-10-08T10:00:00Z',
        '2026-10-08T10:04:00Z',
        [
          { name: 'clone', succeeded: true, steps: [{ name: 'git-clone', status: 'Completed' }] },
          { name: 'scan', succeeded: true, steps: [{ name: 'trivy', status: 'Completed' }] },
        ],
        { critical: 0, high: 0, medium: 1, low: 4 },
      ),
    ],
    [
      'app/guestbook',
      argoApp('guestbook', 'Synced', 'Healthy', 'default', [
        {
          group: 'apps',
          version: 'v1',
          kind: 'Deployment',
          name: 'guestbook-ui',
          namespace: 'default',
          status: 'Synced',
          health: 'Healthy',
        },
        {
          group: '',
          version: 'v1',
          kind: 'Service',
          name: 'guestbook-ui',
          namespace: 'default',
          status: 'Synced',
          health: 'Healthy',
        },
      ]),
    ],
    [
      'app/payments',
      argoApp('payments', 'OutOfSync', 'Degraded', 'shop', [
        {
          group: 'apps',
          version: 'v1',
          kind: 'Deployment',
          name: 'payments-api',
          namespace: 'shop',
          status: 'OutOfSync',
          health: 'Degraded',
        },
        {
          group: '',
          version: 'v1',
          kind: 'Service',
          name: 'payments-api',
          namespace: 'shop',
          status: 'Synced',
          health: 'Healthy',
        },
        {
          group: '',
          version: 'v1',
          kind: 'ConfigMap',
          name: 'payments-config',
          namespace: 'shop',
          status: 'OutOfSync',
          health: 'Healthy',
        },
      ]),
    ],
    [
      'app/search',
      argoApp('search', 'Synced', 'Progressing', 'shop', [
        {
          group: 'apps',
          version: 'v1',
          kind: 'StatefulSet',
          name: 'search-index',
          namespace: 'shop',
          status: 'Synced',
          health: 'Progressing',
        },
      ]),
    ],
    ...NODE_SEEDS.map((n): [string, K8sObject] => [`node/${n.name}`, node(n)]),
    [
      'ev/shop-oom',
      event(
        'shop-oom',
        'shop',
        'cart-7',
        'OOMKilled',
        'Container exceeded memory limit',
        '2026-10-08T09:30:00Z',
        'Warning',
      ),
    ],
    [
      'ev/shop-pull',
      event(
        'shop-pull',
        'shop',
        'cart-7',
        'BackOff',
        'Back-off pulling image',
        '2026-10-08T09:40:00Z',
        'Warning',
      ),
    ],
    [
      'ev/ks-sched',
      event(
        'ks-sched',
        'kube-system',
        'coredns-1',
        'Scheduled',
        'Successfully assigned',
        '2026-10-08T09:10:00Z',
      ),
    ],
    [
      'ev/shop-started',
      event(
        'shop-started',
        'shop',
        'cart-8',
        'Started',
        'Started container app',
        '2026-10-08T09:50:00Z',
      ),
    ],
    [
      'ev/web-1.1',
      event(
        'web-1.1',
        'default',
        'web-1',
        'Scheduled',
        'Successfully assigned',
        '2020-01-01T00:00:00Z',
      ),
    ],
    [
      'ev/web-1.2',
      event(
        'web-1.2',
        'default',
        'web-1',
        'Pulled',
        'Container image pulled',
        '2020-01-01T00:01:00Z',
      ),
    ],
    [
      'ev/web-2.1',
      event(
        'web-2.1',
        'default',
        'web-2',
        'Scheduled',
        'Successfully assigned',
        '2020-01-01T00:00:30Z',
      ),
    ],
  ])
  let counter = 0

  return {
    async catalog() {
      return CATALOG
    },
    async get(ref: ResourceRef) {
      const o = store.get(`${ref.namespace}/${ref.name}`)
      if (!o)
        throw { error: `${ref.resource} "${ref.name}" not found`, code: 404, reason: 'NotFound' }
      return o
    },
    async apply(obj: K8sObject, opts?: { dryRun?: boolean }) {
      if (opts?.dryRun) return obj
      const key = `${obj.metadata.namespace}/${obj.metadata.name}`
      store.set(key, obj)
      return obj
    },
    async delete(ref: ResourceRef) {
      store.delete(`${ref.namespace}/${ref.name}`)
    },
    canI: async (req) => {
      if (getIdentity()?.role === 'viewer') {
        return {
          allowed: !(
            req.verb === 'create' ||
            req.verb === 'update' ||
            req.verb === 'delete' ||
            req.verb === 'patch'
          ),
        }
      }
      return { allowed: !(req.verb === 'delete' && req.namespace === 'kube-system') }
    },
    logs(_ref: ResourceRef, onLine: (line: string) => void): Unsubscribe {
      const id = setInterval(() => onLine(`log line ${++counter}`), tickMs)
      return () => clearInterval(id)
    },
    exec(): ExecSession {
      let cb: ((data: string) => void) | undefined
      return {
        onData(fn) {
          cb = fn
          cb('Connected to echo shell.\r\n$ ')
        },
        send(data) {
          cb?.(data)
        },
        resize() {},
        close() {
          cb = undefined
        },
      }
    },
    portForward(ref: ResourceRef, localPort: number, remotePort: number): PortForwardSession {
      const s: PortForwardSession = {
        id: `pf-${++counter}`,
        ref,
        localPort,
        remotePort,
        status: 'active',
        close() {
          s.status = 'closed'
        },
      }
      return s
    },
    watch(gvr: GVR, _opts: WatchOptions, onEvent: (e: WatchEnvelope) => void): Unsubscribe {
      const wantKind = CATALOG.find(
        (c) => c.group === gvr.group && c.version === gvr.version && c.resource === gvr.resource,
      )?.kind
      const matches = (o: K8sObject) => !wantKind || o.kind === wantKind
      for (const object of store.values()) if (matches(object)) onEvent({ type: 'added', object })
      const id = setInterval(() => {
        const o = store.get('default/web-2')
        if (!o || !matches(o)) return
        const next: K8sObject = {
          ...o,
          status: { phase: o.status?.phase === 'Running' ? 'Pending' : 'Running' },
        }
        store.set('default/web-2', next)
        onEvent({ type: 'modified', object: next })
      }, tickMs)
      return () => clearInterval(id)
    },
  }
}
