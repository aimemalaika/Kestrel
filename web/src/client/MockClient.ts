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
    group: 'apps',
    version: 'v1',
    resource: 'replicasets',
    kind: 'ReplicaSet',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
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
  {
    group: 'apps',
    version: 'v1',
    resource: 'statefulsets',
    kind: 'StatefulSet',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'apps',
    version: 'v1',
    resource: 'daemonsets',
    kind: 'DaemonSet',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'batch',
    version: 'v1',
    resource: 'jobs',
    kind: 'Job',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'batch',
    version: 'v1',
    resource: 'cronjobs',
    kind: 'CronJob',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'networking.k8s.io',
    version: 'v1',
    resource: 'ingresses',
    kind: 'Ingress',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'networking.k8s.io',
    version: 'v1',
    resource: 'networkpolicies',
    kind: 'NetworkPolicy',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'snapshot.storage.k8s.io',
    version: 'v1',
    resource: 'volumesnapshots',
    kind: 'VolumeSnapshot',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'tekton.dev',
    version: 'v1',
    resource: 'tasks',
    kind: 'Task',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'tekton.dev',
    version: 'v1',
    resource: 'taskruns',
    kind: 'TaskRun',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'tekton.dev',
    version: 'v1',
    resource: 'pipelines',
    kind: 'Pipeline',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'rbac.authorization.k8s.io',
    version: 'v1',
    resource: 'clusterroles',
    kind: 'ClusterRole',
    namespaced: false,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'rbac.authorization.k8s.io',
    version: 'v1',
    resource: 'clusterrolebindings',
    kind: 'ClusterRoleBinding',
    namespaced: false,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'apiextensions.k8s.io',
    version: 'v1',
    resource: 'customresourcedefinitions',
    kind: 'CustomResourceDefinition',
    namespaced: false,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'user.openshift.io',
    version: 'v1',
    resource: 'users',
    kind: 'User',
    namespaced: false,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'user.openshift.io',
    version: 'v1',
    resource: 'groups',
    kind: 'Group',
    namespaced: false,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'core',
    version: 'v1',
    resource: 'limitranges',
    kind: 'LimitRange',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'machine.openshift.io',
    version: 'v1beta1',
    resource: 'machines',
    kind: 'Machine',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'machine.openshift.io',
    version: 'v1beta1',
    resource: 'machinesets',
    kind: 'MachineSet',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'build.openshift.io',
    version: 'v1',
    resource: 'builds',
    kind: 'Build',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'build.openshift.io',
    version: 'v1',
    resource: 'buildconfigs',
    kind: 'BuildConfig',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'image.openshift.io',
    version: 'v1',
    resource: 'imagestreams',
    kind: 'ImageStream',
    namespaced: true,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'config.openshift.io',
    version: 'v1',
    resource: 'clusteroperators',
    kind: 'ClusterOperator',
    namespaced: false,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'config.openshift.io',
    version: 'v1',
    resource: 'clusterversions',
    kind: 'ClusterVersion',
    namespaced: false,
    verbs: ['get', 'list', 'watch'],
  },
  {
    group: 'operators.coreos.com',
    version: 'v1alpha1',
    resource: 'clusterserviceversions',
    kind: 'ClusterServiceVersion',
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
  o: { ns?: string; trigger?: 'Push' | 'Manual' | 'Schedule'; running?: boolean } = {},
): K8sObject {
  const running = o.running === true
  return {
    apiVersion: 'tekton.dev/v1',
    kind: 'PipelineRun',
    metadata: {
      name,
      namespace: o.ns ?? 'default',
      uid: `pr/${name}`,
      creationTimestamp: startTime,
      ...(o.trigger ? { annotations: { 'tekton.dev/trigger': o.trigger } } : {}),
    },
    spec: { pipelineRef: { name: 'build-and-push' } },
    status: {
      conditions: [
        { type: 'Succeeded', status: running ? 'Unknown' : ok ? 'True' : 'False', reason },
      ],
      startTime,
      ...(running ? {} : { completionTime }),
      taskRuns,
      results: scan ? [{ name: 'image-SCAN_OUTPUT', value: JSON.stringify(scan) }] : [],
    },
  }
}

interface PodOpts {
  cpu?: string // raw quantity, e.g. "124m"
  memory?: string // raw quantity, e.g. "256Mi"
  node?: string
  containers?: number
  ready?: number
  restarts?: number
  ageDays?: number
}

function pod(name: string, ns: string, phase: string, o: PodOpts = {}): K8sObject {
  const total = o.containers ?? 1
  const readyCount = o.ready ?? (phase === 'Running' ? total : 0)
  const restarts = o.restarts ?? 0
  const containerStatuses = Array.from({ length: total }, (_, i) => ({
    name: `c${i + 1}`,
    ready: i < readyCount,
    restartCount: i === 0 ? restarts : 0,
  }))
  const created = new Date(Date.now() - (o.ageDays ?? 0) * 86400_000).toISOString()
  // Sample metrics at status.usage as RAW quantities (cpu millicores, memory Mi/Gi),
  // shown verbatim. A real backend without metrics-server omits status.usage → "n/a".
  const hasMetrics = o.cpu !== undefined
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name, namespace: ns, uid: `${ns}/${name}`, creationTimestamp: created },
    spec: { containers: containerStatuses.map((c) => ({ name: c.name })), nodeName: o.node },
    status: {
      phase,
      containerStatuses,
      ...(hasMetrics ? { usage: { cpu: o.cpu, memory: o.memory } } : {}),
    },
  }
}

// Realistic pod fleet (production/staging) so the Pods list matches the design.
const POD_SEEDS: Array<[string, string, string, PodOpts]> = [
  ['api-gateway-6d9f7-xk2lp', 'production', 'Running', { cpu: '124m', memory: '256Mi', node: 'worker-01', ageDays: 12 }], // prettier-ignore
  ['api-gateway-6d9f7-mn9qr', 'production', 'Running', { cpu: '118m', memory: '249Mi', node: 'worker-02', ageDays: 12 }], // prettier-ignore
  ['api-gateway-6d9f7-prtv2', 'production', 'Running', { cpu: '131m', memory: '261Mi', node: 'worker-01', ageDays: 12, restarts: 1 }], // prettier-ignore
  ['auth-service-84b9c-mn7qr', 'production', 'Running', { cpu: '85m', memory: '192Mi', node: 'worker-02', ageDays: 8, restarts: 1 }], // prettier-ignore
  ['auth-service-84b9c-xp3lm', 'production', 'Running', { cpu: '91m', memory: '198Mi', node: 'worker-03', ageDays: 8 }], // prettier-ignore
  ['frontend-5c6f-p9wjt', 'production', 'Running', { cpu: '210m', memory: '384Mi', node: 'worker-01', ageDays: 3, containers: 2, ready: 2 }], // prettier-ignore
  ['frontend-5c6f-k8mnx', 'production', 'Running', { cpu: '198m', memory: '371Mi', node: 'worker-02', ageDays: 3, containers: 2, ready: 2 }], // prettier-ignore
  ['postgres-0', 'production', 'Running', { cpu: '451m', memory: '1.2Gi', node: 'worker-03', ageDays: 45 }], // prettier-ignore
  ['redis-cache-79d4b-lkm2x', 'staging', 'Running', { cpu: '62m', memory: '128Mi', node: 'worker-02', ageDays: 5, restarts: 2 }], // prettier-ignore
  ['worker-job-1749203-8xnqp', 'staging', 'Completed', { cpu: '0m', memory: '0Mi', node: 'worker-01', ageDays: 0 }], // prettier-ignore
  ['ml-pipeline-9b7c-vf3yt', 'staging', 'CrashLoopBackOff', { cpu: '340m', memory: '768Mi', node: 'worker-03', ageDays: 1, restarts: 17 }], // prettier-ignore
  ['ml-pipeline-9b7c-qwmkp', 'staging', 'Pending', { cpu: '0m', memory: '0Mi', ageDays: 0 }], // prettier-ignore
]

function event(
  name: string,
  ns: string,
  involvedName: string,
  reason: string,
  message: string,
  lastTimestamp: string,
  type: 'Normal' | 'Warning' = 'Normal',
  involvedKind = 'Pod',
): K8sObject {
  return {
    apiVersion: 'v1',
    kind: 'Event',
    metadata: { name, namespace: ns, uid: `ev/${name}` },
    involvedObject: { kind: involvedKind, name: involvedName, namespace: ns },
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

function ns(name: string, ageDays: number, displayName?: string): K8sObject {
  return {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name,
      uid: `ns/${name}`,
      creationTimestamp: daysAgo(ageDays),
      ...(displayName ? { annotations: { 'openshift.io/display-name': displayName } } : {}),
    },
    status: { phase: 'Active' },
  }
}

function gen(
  apiVersion: string,
  kind: string,
  name: string,
  namespace: string | undefined,
  extra: Record<string, unknown> = {},
  ageDays?: number,
): K8sObject {
  return {
    apiVersion,
    kind,
    metadata: {
      name,
      ...(namespace ? { namespace } : {}),
      uid: `${kind}/${namespace ?? '-'}/${name}`,
      creationTimestamp: daysAgo(ageDays ?? hashAge(`${kind}/${name}`)),
    },
    ...extra,
  } as K8sObject
}

/** Seed helper with an explicit age: `aged(30, apiVersion, kind, name, ns, extra)`. */
function aged(
  ageDays: number,
  apiVersion: string,
  kind: string,
  name: string,
  namespace: string | undefined,
  extra: Record<string, unknown> = {},
  labels?: Record<string, string>,
  annotations?: Record<string, string>,
): K8sObject {
  const o = gen(apiVersion, kind, name, namespace, extra, ageDays)
  if (labels) o.metadata.labels = labels
  if (annotations) (o.metadata as unknown as Record<string, unknown>).annotations = annotations
  return o
}

/** Deterministic 1..90 day age for seeds that do not state one, so Ages vary. */
function hashAge(key: string): number {
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 9973
  return 1 + (h % 90)
}

// Deployment -> ReplicaSet -> Pod chains in `production` (for the topology graph).
const PROD_WORKLOADS = [
  { name: 'api-gateway', rs: 'api-gateway-6d9f7', replicas: 3, image: 'kestrel/api-gateway:2.4.1', ageDays: 12 }, // prettier-ignore
  { name: 'auth-service', rs: 'auth-service-84b9c', replicas: 2, image: 'kestrel/auth-service:1.9.0', ageDays: 8 }, // prettier-ignore
  { name: 'frontend-deploy', rs: 'frontend-5c6f', replicas: 4, image: 'kestrel/frontend:3.2.7', ageDays: 3 }, // prettier-ignore
]

const daysAgo = (d: number): string => new Date(Date.now() - d * 86400_000).toISOString()

function deploySeed(
  name: string,
  ns: string,
  desired: number,
  ready: number,
  strategy: 'RollingUpdate' | 'Recreate',
  image: string,
  ageDays: number,
): K8sObject {
  const d = gen('apps/v1', 'Deployment', name, ns, {
    spec: {
      replicas: desired,
      selector: { matchLabels: { app: name } },
      strategy: { type: strategy },
      template: {
        metadata: { labels: { app: name } },
        spec: { containers: [{ name, image }] },
      },
    },
    status: { replicas: desired, readyReplicas: ready, availableReplicas: ready },
  })
  d.metadata.creationTimestamp = daysAgo(ageDays)
  return d
}

function prodWorkloadSeeds(): [string, K8sObject][] {
  const out: [string, K8sObject][] = []
  for (const w of PROD_WORKLOADS) {
    const dep = deploySeed(w.name, 'production', w.replicas, w.replicas, 'RollingUpdate', w.image, w.ageDays) // prettier-ignore
    const rs = gen('apps/v1', 'ReplicaSet', w.rs, 'production', {
      spec: { replicas: w.replicas },
      status: { replicas: w.replicas, readyReplicas: w.replicas },
    })
    rs.metadata.labels = { app: w.name }
    ;(rs.metadata as unknown as Record<string, unknown>).ownerReferences = [
      { apiVersion: 'apps/v1', kind: 'Deployment', name: w.name, uid: dep.metadata.uid },
    ]
    ;(dep.metadata as unknown as Record<string, unknown>).annotations = {
      'kestrel.io/exposed': 'true',
    }
    out.push([`dep/production/${w.name}`, dep], [`rs/production/${w.rs}`, rs])
  }
  const sts = (name: string, ns: string, desired: number, ready: number): [string, K8sObject] => [
    `sts/${ns}/${name}`,
    gen('apps/v1', 'StatefulSet', name, ns, {
      spec: { replicas: desired, serviceName: name },
      status: { replicas: desired, readyReplicas: ready },
    }),
  ]
  const dp = (
    name: string,
    ns: string,
    desired: number,
    ready: number,
    strategy: 'RollingUpdate' | 'Recreate',
    image: string,
    ageDays: number,
  ): [string, K8sObject] => [
    `dep/${ns}/${name}`,
    deploySeed(name, ns, desired, ready, strategy, image, ageDays),
  ]
  out.push(
    sts('postgres', 'production', 1, 1),
    dp('redis-cache', 'staging', 1, 1, 'Recreate', 'redis:7.2-alpine', 5),
    dp('ml-pipeline', 'staging', 2, 0, 'RollingUpdate', 'kestrel/ml-pipeline:0.8.3', 1),
    dp('notification-svc', 'staging', 1, 1, 'RollingUpdate', 'kestrel/notification-svc:1.3.2', 7),
    dp('grafana', 'monitoring', 1, 1, 'Recreate', 'grafana/grafana:10.4.2', 60),
    sts('prometheus', 'monitoring', 1, 1),
  )
  return out
}

function ownProdPod(p: K8sObject): K8sObject {
  const w = PROD_WORKLOADS.find((x) => p.metadata.name.startsWith(`${x.rs}-`))
  if (!w || p.metadata.namespace !== 'production') return p
  p.metadata.labels = { app: w.name }
  ;(p.metadata as unknown as Record<string, unknown>).ownerReferences = [
    {
      apiVersion: 'apps/v1',
      kind: 'ReplicaSet',
      name: w.rs,
      uid: `ReplicaSet/production/${w.rs}`,
    },
  ]
  return p
}

function quota(ns: string, hard: Record<string, string>, used: Record<string, string>): K8sObject {
  return gen('v1', 'ResourceQuota', `${ns}-quota`, ns, { spec: { hard }, status: { hard, used } })
}

const cfgData = (n: number, prefix = 'KEY'): Record<string, string> =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}_${i + 1}`, `value-${i + 1}`]))

const tcp = 'TCP'
const rbacV1 = 'rbac.authorization.k8s.io/v1'
const routeV1 = 'route.openshift.io/v1'

function route(
  ageDays: number,
  name: string,
  ns: string,
  host: string,
  svc: string,
  targetPort: string | number,
  termination: string | undefined,
  admitted: boolean,
): K8sObject {
  return aged(ageDays, routeV1, 'Route', name, ns, {
    spec: {
      host,
      to: { kind: 'Service', name: svc, weight: 100 },
      port: { targetPort },
      ...(termination ? { tls: { termination } } : {}),
    },
    status: {
      ingress: [
        {
          host,
          routerName: 'default',
          conditions: [
            {
              type: 'Admitted',
              status: admitted ? 'True' : 'False',
              ...(admitted ? {} : { reason: 'HostAlreadyClaimed' }),
            },
          ],
        },
      ],
    },
  })
}

function coreSeeds(): K8sObject[] {
  const svc = (
    age: number,
    name: string,
    ns: string,
    type: string,
    clusterIP: string,
    ports: Record<string, unknown>[],
  ) => aged(age, 'v1', 'Service', name, ns, { spec: { type, clusterIP, ports, selector: { app: name } } }) // prettier-ignore
  const pv = (
    age: number,
    name: string,
    size: string,
    mode: string,
    sc: string,
    reclaim: string,
    phase: string,
    claim?: [string, string],
  ) =>
    aged(age, 'v1', 'PersistentVolume', name, undefined, {
      spec: {
        capacity: { storage: size },
        accessModes: [mode],
        storageClassName: sc,
        persistentVolumeReclaimPolicy: reclaim,
        ...(claim ? { claimRef: { namespace: claim[0], name: claim[1] } } : {}),
      },
      status: { phase },
    })
  const pvc = (
    age: number,
    name: string,
    ns: string,
    size: string,
    mode: string,
    sc: string,
    phase: string,
    vol?: string,
  ) =>
    aged(age, 'v1', 'PersistentVolumeClaim', name, ns, {
      spec: {
        accessModes: [mode],
        resources: { requests: { storage: size } },
        storageClassName: sc,
        ...(vol ? { volumeName: vol } : {}),
      },
      status: { phase, ...(phase === 'Bound' ? { capacity: { storage: size } } : {}) },
    })
  const sc = (
    age: number,
    name: string,
    prov: string,
    reclaim: string,
    mode: string,
    def = false,
  ) =>
    // prettier-ignore
    aged(
      age,
      'storage.k8s.io/v1',
      'StorageClass',
      name,
      undefined,
      { provisioner: prov, reclaimPolicy: reclaim, volumeBindingMode: mode },
      undefined,
      def ? { 'storageclass.kubernetes.io/is-default-class': 'true' } : undefined,
    )
  const sa = (age: number, name: string, ns: string, secrets: string[], pull: string[]) =>
    aged(age, 'v1', 'ServiceAccount', name, ns, {
      secrets: secrets.map((n) => ({ name: n })),
      imagePullSecrets: pull.map((n) => ({ name: n })),
    })
  const rule = (resources: string[], verbs: string[], apiGroups = ['']) => ({ apiGroups, resources, verbs }) // prettier-ignore
  const binding = (
    age: number,
    name: string,
    ns: string,
    role: string,
    subjects: [string, string][],
  ) =>
    // prettier-ignore
    aged(age, rbacV1, 'RoleBinding', name, ns, {
      roleRef: { kind: 'Role', name: role },
      subjects: subjects.map(([kind, n]) => ({ kind, name: n })),
    })
  return [
    // Services
    svc(110, 'web', 'default', 'ClusterIP', '10.0.0.11', [{ port: 80, targetPort: 8080, protocol: tcp }]), // prettier-ignore
    svc(40, 'cart', 'shop', 'LoadBalancer', '10.0.0.21', [
      { name: 'https', port: 443, targetPort: 8443, protocol: tcp },
      { name: 'http', port: 80, targetPort: 8080, protocol: tcp },
      { name: 'metrics', port: 9090, targetPort: 9090, protocol: tcp },
    ]),
    svc(88, 'api-gateway', 'production', 'ClusterIP', '10.0.1.14', [{ port: 8080, targetPort: 8080, protocol: tcp }]), // prettier-ignore
    svc(85, 'auth-service', 'production', 'NodePort', '10.0.1.33', [{ port: 9000, targetPort: 9000, nodePort: 30900, protocol: tcp }]), // prettier-ignore
    svc(55, 'redis-cache', 'staging', 'ClusterIP', '10.0.2.8', [{ port: 6379, targetPort: 6379, protocol: tcp }]), // prettier-ignore
    svc(58, 'notification-svc', 'staging', 'NodePort', '10.0.2.19', [{ port: 8081, targetPort: 8081, nodePort: 30881, protocol: tcp }]), // prettier-ignore
    svc(72, 'grafana', 'monitoring', 'ClusterIP', '10.0.3.5', [{ port: 3000, targetPort: 3000, protocol: tcp }]), // prettier-ignore
    svc(98, 'router-default', 'ingress', 'LoadBalancer', '10.0.4.2', [
      { name: 'http', port: 80, targetPort: 80, protocol: tcp },
      { name: 'https', port: 443, targetPort: 443, protocol: tcp },
    ]),
    // Routes (one Rejected, one without TLS)
    route(40, 'shop-web', 'shop', 'shop.example.com', 'cart', 'https', 'edge', true),
    route(85, 'api', 'production', 'api.example.com', 'api-gateway', 8080, 'reencrypt', true),
    route(84, 'auth', 'production', 'auth.example.com', 'auth-service', 9000, 'passthrough', true),
    route(50, 'notify', 'staging', 'notify.staging.example.com', 'notification-svc', 8081, undefined, true), // prettier-ignore
    route(30, 'dashboards', 'monitoring', 'dash.example.com', 'grafana', 3000, 'edge', true),
    route(2, 'legacy-web', 'default', 'shop.example.com', 'web', 8080, 'edge', false),
    // ConfigMaps (1..20 keys)
    aged(110, 'v1', 'ConfigMap', 'app-config', 'default', { data: { LOG_LEVEL: 'info' } }),
    aged(40, 'v1', 'ConfigMap', 'payments-config', 'shop', { data: { REGION: 'eu', CURRENCY: 'EUR', RETRIES: '3' } }), // prettier-ignore
    aged(80, 'v1', 'ConfigMap', 'gateway-routes', 'production', { data: cfgData(20, 'ROUTE') }),
    aged(78, 'v1', 'ConfigMap', 'feature-flags', 'production', { data: cfgData(9, 'FLAG') }),
    aged(30, 'v1', 'ConfigMap', 'staging-env', 'staging', { data: cfgData(5, 'ENV') }),
    aged(70, 'v1', 'ConfigMap', 'dashboards-provisioning', 'monitoring', { data: cfgData(14, 'DASH') }), // prettier-ignore
    // Secrets
    aged(40, 'v1', 'Secret', 'db-credentials', 'shop', { type: 'Opaque', data: { password: '', username: '' } }), // prettier-ignore
    aged(110, 'v1', 'Secret', 'registry-pull', 'default', { type: 'kubernetes.io/dockerconfigjson', data: { '.dockerconfigjson': '' } }), // prettier-ignore
    aged(60, 'v1', 'Secret', 'api-tls', 'production', { type: 'kubernetes.io/tls', data: { 'tls.crt': '', 'tls.key': '' } }), // prettier-ignore
    aged(55, 'v1', 'Secret', 'staging-registry', 'staging', { type: 'kubernetes.io/dockerconfigjson', data: { '.dockerconfigjson': '' } }), // prettier-ignore
    aged(20, 'v1', 'Secret', 'grafana-admin', 'monitoring', { type: 'Opaque', data: { user: '', password: '', token: '' } }), // prettier-ignore
    // Storage
    pv(100, 'pv-data-1', '10Gi', 'ReadWriteOnce', 'fast', 'Retain', 'Bound', ['shop', 'data-search-0']), // prettier-ignore
    pv(90, 'pv-pg-1', '50Gi', 'ReadWriteOnce', 'standard', 'Delete', 'Bound', ['production', 'data-postgres-0']), // prettier-ignore
    pv(70, 'pv-prom-1', '100Gi', 'ReadWriteOnce', 'standard', 'Delete', 'Bound', ['monitoring', 'prometheus-data']), // prettier-ignore
    pv(45, 'pv-shared-1', '200Gi', 'ReadWriteMany', 'bulk', 'Retain', 'Available'),
    pv(150, 'pv-old-1', '5Gi', 'ReadWriteOnce', 'fast', 'Retain', 'Released', ['staging', 'cache-old']), // prettier-ignore
    pvc(100, 'data-search-0', 'shop', '10Gi', 'ReadWriteOnce', 'fast', 'Bound', 'pv-data-1'),
    pvc(90, 'data-postgres-0', 'production', '50Gi', 'ReadWriteOnce', 'standard', 'Bound', 'pv-pg-1'), // prettier-ignore
    pvc(70, 'prometheus-data', 'monitoring', '100Gi', 'ReadWriteOnce', 'standard', 'Bound', 'pv-prom-1'), // prettier-ignore
    pvc(12, 'media-uploads', 'production', '200Gi', 'ReadWriteMany', 'bulk', 'Pending'),
    pvc(1, 'ml-scratch', 'staging', '20Gi', 'ReadWriteOnce', 'fast', 'Pending'),
    sc(200, 'fast', 'kubernetes.io/no-provisioner', 'Delete', 'WaitForFirstConsumer'),
    sc(200, 'standard', 'csi.example.com/block', 'Delete', 'Immediate', true),
    sc(150, 'bulk', 'csi.example.com/file', 'Retain', 'Immediate'),
    // Identity / RBAC
    sa(110, 'default', 'default', ['default-token-x7k2p'], ['registry-pull']),
    sa(40, 'deployer', 'shop', ['deployer-token-a1b2c'], []),
    sa(90, 'default', 'production', ['default-token-q9w8e'], ['registry-pull']),
    sa(85, 'api-gateway', 'production', ['api-gateway-token-m3n4b', 'api-tls'], ['registry-pull']),
    sa(58, 'builder', 'staging', ['builder-token-z5x6c'], ['staging-registry']),
    sa(70, 'prometheus', 'monitoring', ['prometheus-token-v7b8n'], []),
    sa(72, 'grafana', 'monitoring', ['grafana-token-l1k2j', 'grafana-admin'], ['registry-pull']),
    aged(110, rbacV1, 'Role', 'pod-reader', 'default', { rules: [rule(['pods'], ['get', 'list'])] }), // prettier-ignore
    aged(85, rbacV1, 'Role', 'deployer', 'production', {
      rules: [
        rule(
          ['deployments', 'replicasets'],
          ['get', 'list', 'create', 'update', 'patch'],
          ['apps'],
        ),
        rule(['pods', 'pods/log'], ['get', 'list', 'watch']),
        rule(['configmaps', 'secrets'], ['get', 'list']),
      ],
    }),
    aged(70, rbacV1, 'Role', 'metrics-reader', 'monitoring', {
      rules: [rule(['pods', 'services', 'endpoints'], ['get', 'list', 'watch']), rule(['nodes/metrics'], ['get'])], // prettier-ignore
    }),
    aged(58, rbacV1, 'Role', 'namespace-admin', 'staging', {
      rules: [
        rule(['*'], ['*']),
        rule(['deployments'], ['*'], ['apps']),
        rule(['jobs'], ['*'], ['batch']),
        rule(['routes'], ['*'], ['route.openshift.io']),
        rule(['events'], ['get', 'list']),
      ],
    }),
    binding(110, 'read-pods', 'default', 'pod-reader', [['ServiceAccount', 'default']]),
    binding(85, 'deployers', 'production', 'deployer', [['ServiceAccount', 'api-gateway'], ['Group', 'developers']]), // prettier-ignore
    binding(70, 'metrics-read', 'monitoring', 'metrics-reader', [['ServiceAccount', 'prometheus']]), // prettier-ignore
    binding(58, 'staging-admins', 'staging', 'namespace-admin', [['User', 'alice'], ['Group', 'platform-admins'], ['ServiceAccount', 'builder']]), // prettier-ignore
    // Quotas
    quota('shop', { cpu: '4', memory: '8Gi', pods: '20', persistentvolumeclaims: '5' }, { cpu: '1.8', memory: '2300Mi', pods: '9', persistentvolumeclaims: '1' }), // prettier-ignore
    quota('default', { cpu: '2', pods: '10' }, { cpu: '1900m', pods: '9' }),
    quota('production', { cpu: '16', memory: '32Gi', pods: '40', persistentvolumeclaims: '10' }, { cpu: '9400m', memory: '19Gi', pods: '24', persistentvolumeclaims: '4' }), // prettier-ignore
    quota('staging', { cpu: '8', memory: '16Gi', pods: '25', persistentvolumeclaims: '6' }, { cpu: '7600m', memory: '9Gi', pods: '18', persistentvolumeclaims: '2' }), // prettier-ignore
  ]
}

function machineBuildSeeds(): K8sObject[] {
  const osMachine = 'machine.openshift.io/v1beta1'
  const bld = 'build.openshift.io/v1'
  const ms = (age: number, name: string, zone: string, type: string, want: number, ready: number) =>
    aged(
      age,
      osMachine,
      'MachineSet',
      name,
      'cluster-machines',
      {
        spec: {
          replicas: want,
          template: {
            spec: { providerSpec: { value: { placement: { availabilityZone: zone }, instanceType: type } } }, // prettier-ignore
          },
        },
        status: { replicas: want, readyReplicas: ready, availableReplicas: ready },
      },
      { 'machine.example.io/zone': zone, 'machine.example.io/instance-type': type },
    )
  const build = (
    age: number,
    name: string,
    ns: string,
    bc: string,
    phase: string,
    strategy: string,
    trigger: string,
    commit: string,
  ) =>
    aged(
      age,
      bld,
      'Build',
      name,
      ns,
      {
        spec: { strategy: { type: strategy }, triggeredBy: [{ message: trigger }], commit },
        status: {
          phase,
          startTimestamp: daysAgo(age),
          ...(phase === 'Running' || phase === 'New' ? {} : { completionTimestamp: daysAgo(age - 0.01) }), // prettier-ignore
        },
      },
      { buildconfig: bc },
    )
  const bc = (
    age: number,
    name: string,
    ns: string,
    strategy: string,
    source: string,
    last: number,
    lastStatus: string,
  ) =>
    // prettier-ignore
    aged(age, bld, 'BuildConfig', name, ns, {
      spec: { strategy: { type: strategy }, source: { type: source, git: { uri: `https://git.example.com/${ns}/${name}.git` } } }, // prettier-ignore
      status: { lastVersion: last, lastBuildPhase: lastStatus },
    })
  return [
    ms(60, 'worker-us-east-1b', 'us-east-1b', 'm5.xlarge', 2, 2),
    ms(60, 'worker-us-east-1a', 'us-east-1a', 'm5.2xlarge', 1, 0),
    ms(30, 'worker-us-east-1c', 'us-east-1c', 'c5.xlarge', 3, 3),
    build(10, 'shop-web-1', 'shop', 'shop-web', 'Complete', 'Docker', 'Image change', 'a1b2c3d'),
    build(0.2, 'shop-web-2', 'shop', 'shop-web', 'Running', 'Docker', 'Generic webhook', 'e4f5a6b'),
    build(4, 'api-1', 'default', 'api', 'Failed', 'Source', 'Manual', 'c7d8e9f'),
    build(6, 'api-2', 'default', 'api', 'Cancelled', 'Source', 'Manual', '0a1b2c3'),
    build(
      0.05,
      'frontend-1',
      'production',
      'frontend',
      'New',
      'Docker',
      'Config change',
      '4d5e6f7',
    ),
    build(2, 'frontend-0', 'production', 'frontend', 'Complete', 'Docker', 'Push event', '8a9b0c1'),
    bc(40, 'shop-web', 'shop', 'Docker', 'Git', 2, 'Running'),
    bc(110, 'api', 'default', 'Source', 'Git', 2, 'Cancelled'),
    bc(85, 'frontend', 'production', 'Docker', 'Git', 1, 'New'),
    bc(58, 'ml-pipeline', 'staging', 'Custom', 'Binary', 7, 'Complete'),
    bc(70, 'notifier', 'staging', 'Source', 'Git', 3, 'Failed'),
  ]
}

function clusterSeeds(): K8sObject[] {
  const cond = (type: string, status = 'True', message?: string) => ({
    type,
    status,
    ...(message ? { message } : {}),
  })
  const op = (
    age: number,
    name: string,
    version: string,
    avail: boolean,
    prog: boolean,
    degraded: boolean,
    message?: string,
  ) =>
    aged(age, 'config.openshift.io/v1', 'ClusterOperator', name, undefined, {
      status: {
        versions: [{ name: 'operator', version }],
        conditions: [
          cond('Available', avail ? 'True' : 'False'),
          cond('Progressing', prog ? 'True' : 'False', prog ? message : undefined),
          cond('Degraded', degraded ? 'True' : 'False', degraded ? message : undefined),
        ],
      },
    })
  const csv = (
    age: number,
    name: string,
    ns: string,
    display: string,
    version: string,
    phase: string,
    channel: string,
    kinds: string[],
  ) =>
    aged(age, 'operators.coreos.com/v1alpha1', 'ClusterServiceVersion', name, ns, {
      spec: {
        displayName: display,
        version,
        provider: { name: 'Example Org' },
        channel,
        customresourcedefinitions: { owned: kinds.map((kind) => ({ kind, name: `${kind.toLowerCase()}s.example.com`, version: 'v1' })) }, // prettier-ignore
      },
      status: { phase, channel, reason: phase === 'Succeeded' ? 'InstallSucceeded' : 'InstallWaiting' }, // prettier-ignore
    })
  return [
    op(120, 'dns', 'v1.29.3', true, false, false),
    op(120, 'ingress', 'v1.29.3', true, true, false, 'Rolling out router deployment 2 of 3'),
    op(
      120,
      'storage',
      'v1.29.2',
      false,
      false,
      true,
      'Storage driver pods are not ready on 1 node',
    ),
    op(120, 'authentication', 'v1.29.3', true, false, false),
    op(120, 'network', 'v1.29.3', true, false, false),
    op(120, 'monitoring', 'v1.29.3', true, true, false, 'Updating metrics stack to the latest version'), // prettier-ignore
    op(120, 'kube-apiserver', 'v1.29.3', true, false, false),
    op(120, 'etcd', 'v1.29.3', true, false, false),
    op(120, 'image-registry', 'v1.29.1', true, false, true, 'Registry storage backend is unreachable'), // prettier-ignore
    op(120, 'node-tuning', 'v1.29.3', true, false, false),
    aged(120, 'config.openshift.io/v1', 'ClusterVersion', 'version', undefined, {
      spec: { channel: 'stable', clusterID: '00000000-0000-0000-0000-000000000001' },
      status: {
        desired: { version: 'v1.29.3' },
        availableUpdates: [{ version: 'v1.29.5' }, { version: 'v1.30.0' }],
        conditions: [cond('Available'), cond('Progressing', 'False')],
        history: [{ state: 'Completed', version: 'v1.29.3', startedTime: daysAgo(30) }],
      },
    }),
    csv(50, 'metrics-operator.v1.4.0', 'shop', 'Metrics Operator', '1.4.0', 'Succeeded', 'stable', ['MetricsConfig', 'Scraper']), // prettier-ignore
    csv(20, 'backup-operator.v0.9.2', 'default', 'Backup Operator', '0.9.2', 'Installing', 'beta', ['BackupPolicy']), // prettier-ignore
    csv(90, 'cert-operator.v2.1.0', 'production', 'Certificate Manager', '2.1.0', 'Succeeded', 'stable', ['Certificate', 'Issuer', 'ClusterIssuer']), // prettier-ignore
    csv(65, 'db-operator.v3.0.1', 'production', 'Database Operator', '3.0.1', 'Failed', 'stable', ['DatabaseCluster', 'DatabaseBackup']), // prettier-ignore
    csv(30, 'pipeline-operator.v1.12.0', 'staging', 'Pipeline Operator', '1.12.0', 'Succeeded', 'latest', ['Pipeline', 'Task', 'PipelineRun', 'TaskRun']), // prettier-ignore
  ]
}

function moreSeeds(): K8sObject[] {
  const ts = (n: number) => new Date(Date.UTC(2026, 8, 15, 0, 0, 0) + n * 3600_000).toISOString()
  const cond = (type: string, status = 'True') => ({ type, status })
  const rbac = 'rbac.authorization.k8s.io/v1'
  const tkn = 'tekton.dev/v1'
  const osMachine = 'machine.openshift.io/v1beta1'
  return [
    gen('apps/v1', 'StatefulSet', 'search', 'shop', {
      spec: { replicas: 3, serviceName: 'search' },
      status: { replicas: 3, readyReplicas: 3 },
    }),
    gen('apps/v1', 'StatefulSet', 'cache', 'default', {
      spec: { replicas: 2, serviceName: 'cache' },
      status: { replicas: 2, readyReplicas: 1 },
    }),
    gen('apps/v1', 'DaemonSet', 'log-agent', 'kube-system', {
      status: { desiredNumberScheduled: 6, currentNumberScheduled: 6, numberReady: 5 },
    }),
    gen('apps/v1', 'DaemonSet', 'node-monitor', 'kube-system', {
      status: { desiredNumberScheduled: 6, currentNumberScheduled: 6, numberReady: 6 },
    }),
    gen('batch/v1', 'Job', 'db-migrate', 'shop', {
      spec: { completions: 1, parallelism: 1 },
      status: { succeeded: 1, active: 0, failed: 0, completionTime: ts(2) },
    }),
    gen('batch/v1', 'Job', 'report-gen', 'default', {
      spec: { completions: 3, parallelism: 1 },
      status: { succeeded: 1, active: 1, failed: 0 },
    }),
    gen('batch/v1', 'Job', 'cleanup', 'default', {
      spec: { completions: 1 },
      status: { succeeded: 0, active: 0, failed: 2 },
    }),
    gen('batch/v1', 'CronJob', 'nightly-backup', 'shop', {
      spec: { schedule: '0 2 * * *', suspend: false },
      status: { lastScheduleTime: ts(20), active: [] },
    }),
    gen('batch/v1', 'CronJob', 'hourly-sync', 'default', {
      spec: { schedule: '0 * * * *', suspend: true },
      status: { lastScheduleTime: ts(10) },
    }),
    gen('networking.k8s.io/v1', 'Ingress', 'shop-ingress', 'shop', {
      spec: {
        ingressClassName: 'default',
        rules: [{ host: 'shop.example.com', http: { paths: [{ path: '/', pathType: 'Prefix' }] } }],
      },
      status: { loadBalancer: { ingress: [{ ip: '203.0.113.10' }] } },
    }),
    gen('networking.k8s.io/v1', 'Ingress', 'web-ingress', 'default', {
      spec: { rules: [{ host: 'www.example.com' }] },
      status: { loadBalancer: {} },
    }),
    gen('networking.k8s.io/v1', 'NetworkPolicy', 'deny-all', 'shop', {
      spec: { podSelector: {}, policyTypes: ['Ingress'] },
    }),
    gen('networking.k8s.io/v1', 'NetworkPolicy', 'allow-web', 'default', {
      spec: { podSelector: { matchLabels: { app: 'web' } }, policyTypes: ['Ingress', 'Egress'] },
    }),
    gen('snapshot.storage.k8s.io/v1', 'VolumeSnapshot', 'search-snap-1', 'shop', {
      spec: { source: { persistentVolumeClaimName: 'data-search-0' } },
      status: { readyToUse: true, restoreSize: '10Gi' },
    }),
    gen('snapshot.storage.k8s.io/v1', 'VolumeSnapshot', 'search-snap-2', 'shop', {
      spec: { source: { persistentVolumeClaimName: 'data-search-0' } },
      status: { readyToUse: false },
    }),
    gen(tkn, 'Task', 'git-clone', 'shop', {
      spec: { steps: [{ name: 'clone' }], params: [{ name: 'url' }] },
    }),
    gen(tkn, 'Task', 'build-image', 'shop', {
      spec: { steps: [{ name: 'build' }, { name: 'push' }] },
    }),
    gen(tkn, 'TaskRun', 'git-clone-run-1', 'shop', {
      spec: { taskRef: { name: 'git-clone' } },
      status: {
        startTime: ts(1),
        completionTime: ts(2),
        conditions: [{ type: 'Succeeded', status: 'True', reason: 'Succeeded' }],
      },
    }),
    gen(tkn, 'TaskRun', 'build-image-run-1', 'shop', {
      spec: { taskRef: { name: 'build-image' } },
      status: {
        startTime: ts(3),
        conditions: [{ type: 'Succeeded', status: 'Unknown', reason: 'Running' }],
      },
    }),
    gen(tkn, 'Pipeline', 'build-and-deploy', 'shop', {
      spec: { tasks: [{ name: 'clone' }, { name: 'build' }, { name: 'deploy' }] },
    }),
    gen(tkn, 'Pipeline', 'lint-and-test', 'default', {
      spec: { tasks: [{ name: 'lint' }, { name: 'test' }] },
    }),
    gen(rbac, 'ClusterRole', 'cluster-reader', undefined, {
      rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['get', 'list', 'watch'] }],
    }),
    gen(rbac, 'ClusterRole', 'cluster-admin', undefined, {
      rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }],
    }),
    gen(rbac, 'ClusterRoleBinding', 'admins-binding', undefined, {
      roleRef: { kind: 'ClusterRole', name: 'cluster-admin' },
      subjects: [{ kind: 'Group', name: 'platform-admins' }],
    }),
    gen(rbac, 'ClusterRoleBinding', 'readers-binding', undefined, {
      roleRef: { kind: 'ClusterRole', name: 'cluster-reader' },
      subjects: [{ kind: 'User', name: 'alice' }],
    }),
    gen('apiextensions.k8s.io/v1', 'CustomResourceDefinition', 'widgets.example.com', undefined, {
      spec: {
        group: 'example.com',
        scope: 'Namespaced',
        names: { kind: 'Widget', plural: 'widgets' },
        versions: [{ name: 'v1', served: true, storage: true }],
      },
      status: { conditions: [cond('Established')] },
    }),
    gen('apiextensions.k8s.io/v1', 'CustomResourceDefinition', 'gadgets.example.com', undefined, {
      spec: {
        group: 'example.com',
        scope: 'Cluster',
        names: { kind: 'Gadget', plural: 'gadgets' },
        versions: [{ name: 'v1beta1', served: true, storage: true }],
      },
      status: { conditions: [cond('Established')] },
    }),
    gen('user.openshift.io/v1', 'User', 'alice', undefined, {
      fullName: 'Alice Example',
      identities: ['local:alice'],
      groups: ['platform-admins'],
    }),
    gen('user.openshift.io/v1', 'User', 'bob', undefined, {
      fullName: 'Bob Example',
      identities: ['local:bob'],
      groups: [],
    }),
    gen('user.openshift.io/v1', 'Group', 'platform-admins', undefined, { users: ['alice'] }),
    gen('user.openshift.io/v1', 'Group', 'developers', undefined, { users: ['alice', 'bob'] }),
    gen('v1', 'LimitRange', 'shop-limits', 'shop', {
      spec: {
        limits: [{ type: 'Container', default: { cpu: '500m', memory: '512Mi' } }],
      },
    }),
    gen('v1', 'LimitRange', 'default-limits', 'default', {
      spec: { limits: [{ type: 'Container', default: { cpu: '250m', memory: '256Mi' } }] },
    }),
    gen(osMachine, 'Machine', 'worker-01-machine', 'cluster-machines', {
      spec: { providerID: 'cloud:///us-east-1b/i-0a1' },
      status: { phase: 'Running', nodeRef: { name: 'worker-01' } },
    }),
    gen(osMachine, 'Machine', 'worker-02-machine', 'cluster-machines', {
      spec: { providerID: 'cloud:///us-east-1c/i-0b2' },
      status: { phase: 'Running', nodeRef: { name: 'worker-02' } },
    }),
    gen(osMachine, 'Machine', 'worker-03-machine', 'cluster-machines', {
      spec: { providerID: 'cloud:///us-east-1a/i-0c3' },
      status: { phase: 'Provisioning' },
    }),
    ...machineBuildSeeds(),
    gen('image.openshift.io/v1', 'ImageStream', 'shop-web', 'shop', {
      status: {
        dockerImageRepository: 'registry.example.com/shop/shop-web',
        tags: [{ tag: 'latest' }, { tag: 'v1' }],
      },
    }),
    gen('image.openshift.io/v1', 'ImageStream', 'api', 'default', {
      status: {
        dockerImageRepository: 'registry.example.com/default/api',
        tags: [{ tag: 'latest' }],
      },
    }),
    ...clusterSeeds(),
  ]
}

function genSeeds(): [string, K8sObject][] {
  const objs: K8sObject[] = [...coreSeeds(), ...moreSeeds()]
  return objs.map((o) => [`gen/${o.kind}/${o.metadata.namespace ?? '-'}/${o.metadata.name}`, o])
}

export function createMockClient(opts: { tickMs?: number } = {}): Client {
  const tickMs = opts.tickMs ?? 2000
  const store = new Map<string, K8sObject>([
    [
      'default/web-1',
      pod('web-1', 'default', 'Running', {
        cpu: '34m',
        memory: '96Mi',
        node: 'worker-01',
        ageDays: 20,
      }),
    ],
    ['default/web-2', pod('web-2', 'default', 'Pending', { ageDays: 0 })],
    ...POD_SEEDS.map(
      ([n, pns, ph, o]) => [`${pns}/${n}`, ownProdPod(pod(n, pns, ph, o))] as [string, K8sObject],
    ),
    ...prodWorkloadSeeds(),
    ['ns/default', ns('default', 120, 'Default')],
    ['ns/kube-system', ns('kube-system', 120, 'Kube System')],
    ['ns/shop', ns('shop', 45, 'Shop Storefront')],
    ['ns/production', ns('production', 90, 'Production')],
    ['ns/staging', ns('staging', 60, 'Staging')],
    ['ns/monitoring', ns('monitoring', 75, 'Monitoring Stack')],
    ['ns/ingress', ns('ingress', 100, 'Ingress Controllers')],
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
      'pr/deploy-prod-201',
      pipelineRun(
        'deploy-prod-201',
        true,
        'Succeeded',
        '2026-10-07T14:00:00Z',
        '2026-10-07T14:09:00Z',
        [
          { name: 'clone', succeeded: true, steps: [{ name: 'git-clone', status: 'Completed' }] },
          { name: 'deploy', succeeded: true, steps: [{ name: 'rollout', status: 'Completed' }] },
        ],
        undefined,
        { ns: 'production', trigger: 'Push' },
      ),
    ],
    [
      'pr/deploy-prod-202',
      pipelineRun(
        'deploy-prod-202',
        true,
        'Running',
        '2026-10-08T10:30:00Z',
        '',
        [{ name: 'clone', succeeded: true, steps: [{ name: 'git-clone', status: 'Completed' }] }],
        undefined,
        { ns: 'production', trigger: 'Manual', running: true },
      ),
    ],
    [
      'pr/smoke-stg-77',
      pipelineRun(
        'smoke-stg-77',
        false,
        'Cancelled',
        '2026-10-08T07:00:00Z',
        '2026-10-08T07:01:00Z',
        [{ name: 'clone', succeeded: true, steps: [{ name: 'git-clone', status: 'Completed' }] }],
        undefined,
        { ns: 'staging', trigger: 'Manual' },
      ),
    ],
    [
      'pr/build-stg-78',
      pipelineRun(
        'build-stg-78',
        true,
        'Succeeded',
        '2026-10-08T06:00:00Z',
        '2026-10-08T06:06:00Z',
        [{ name: 'build', succeeded: true, steps: [{ name: 'compile', status: 'Completed' }] }],
        { critical: 0, high: 1, medium: 2, low: 6 },
        { ns: 'staging', trigger: 'Push' },
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
    ['ev/node-notready', event('node-notready', 'default', 'worker-03', 'NodeNotReady', 'Node worker-03 status is now NodeNotReady', '2026-10-08T09:55:00Z', 'Warning', 'Node')], // prettier-ignore
    ['ev/node-ready', event('node-ready', 'default', 'worker-01', 'NodeReady', 'Node worker-01 status is now NodeReady', '2026-10-08T08:00:00Z', 'Normal', 'Node')], // prettier-ignore
    ['ev/dep-scaled', event('dep-scaled', 'production', 'api-gateway', 'ScalingReplicaSet', 'Scaled up replica set api-gateway-6d9f7 to 3', '2026-10-08T09:20:00Z', 'Normal', 'Deployment')], // prettier-ignore
    ['ev/dep-failed', event('dep-failed', 'staging', 'ml-pipeline', 'ProgressDeadlineExceeded', 'Deployment does not have minimum availability', '2026-10-08T09:45:00Z', 'Warning', 'Deployment')], // prettier-ignore
    ['ev/prod-probe', event('prod-probe', 'production', 'frontend-5c6f-abcde', 'Unhealthy', 'Readiness probe failed: HTTP 503', '2026-10-08T09:35:00Z', 'Warning')], // prettier-ignore
    ['ev/stg-crash', event('stg-crash', 'staging', 'ml-pipeline-9b7c-vf3yt', 'BackOff', 'Back-off restarting failed container', '2026-10-08T09:58:00Z', 'Warning')], // prettier-ignore
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
