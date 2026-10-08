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
    gen(osMachine, 'MachineSet', 'worker-us-east-1b', 'cluster-machines', {
      spec: { replicas: 2 },
      status: { replicas: 2, readyReplicas: 2, availableReplicas: 2 },
    }),
    gen(osMachine, 'MachineSet', 'worker-us-east-1a', 'cluster-machines', {
      spec: { replicas: 1 },
      status: { replicas: 1, readyReplicas: 0, availableReplicas: 0 },
    }),
    gen('build.openshift.io/v1', 'Build', 'shop-web-1', 'shop', {
      spec: { strategy: { type: 'Docker' } },
      status: { phase: 'Complete', startTimestamp: ts(1), completionTimestamp: ts(2) },
    }),
    gen('build.openshift.io/v1', 'Build', 'shop-web-2', 'shop', {
      spec: { strategy: { type: 'Docker' } },
      status: { phase: 'Running', startTimestamp: ts(5) },
    }),
    gen('build.openshift.io/v1', 'Build', 'api-1', 'default', {
      spec: { strategy: { type: 'Source' } },
      status: { phase: 'Failed', startTimestamp: ts(3), completionTimestamp: ts(4) },
    }),
    gen('build.openshift.io/v1', 'BuildConfig', 'shop-web', 'shop', {
      spec: { strategy: { type: 'Docker' }, source: { type: 'Git' } },
      status: { lastVersion: 2 },
    }),
    gen('build.openshift.io/v1', 'BuildConfig', 'api', 'default', {
      spec: { strategy: { type: 'Source' }, source: { type: 'Git' } },
      status: { lastVersion: 1 },
    }),
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
    gen('config.openshift.io/v1', 'ClusterOperator', 'dns', undefined, {
      status: {
        versions: [{ name: 'operator', version: '4.15.0' }],
        conditions: [cond('Available'), cond('Progressing', 'False'), cond('Degraded', 'False')],
      },
    }),
    gen('config.openshift.io/v1', 'ClusterOperator', 'ingress', undefined, {
      status: {
        versions: [{ name: 'operator', version: '4.15.0' }],
        conditions: [cond('Available'), cond('Progressing', 'True'), cond('Degraded', 'False')],
      },
    }),
    gen('config.openshift.io/v1', 'ClusterOperator', 'storage', undefined, {
      status: {
        versions: [{ name: 'operator', version: '4.14.9' }],
        conditions: [cond('Available', 'False'), cond('Progressing', 'False'), cond('Degraded')],
      },
    }),
    gen('config.openshift.io/v1', 'ClusterVersion', 'version', undefined, {
      spec: { channel: 'stable-4.15', clusterID: '00000000-0000-0000-0000-000000000001' },
      status: {
        desired: { version: '4.15.0' },
        conditions: [cond('Available'), cond('Progressing', 'False')],
        history: [{ state: 'Completed', version: '4.15.0', startedTime: ts(0) }],
      },
    }),
    gen(
      'operators.coreos.com/v1alpha1',
      'ClusterServiceVersion',
      'metrics-operator.v1.4.0',
      'shop',
      {
        spec: {
          displayName: 'Metrics Operator',
          version: '1.4.0',
          provider: { name: 'Example Org' },
        },
        status: { phase: 'Succeeded', reason: 'InstallSucceeded' },
      },
    ),
    gen(
      'operators.coreos.com/v1alpha1',
      'ClusterServiceVersion',
      'backup-operator.v0.9.2',
      'default',
      {
        spec: {
          displayName: 'Backup Operator',
          version: '0.9.2',
          provider: { name: 'Example Org' },
        },
        status: { phase: 'Installing', reason: 'InstallWaiting' },
      },
    ),
  ]
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
    ...moreSeeds(),
  ]
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
      ([n, pns, ph, o]) => [`${pns}/${n}`, pod(n, pns, ph, o)] as [string, K8sObject],
    ),
    ['ns/default', ns('default')],
    ['ns/kube-system', ns('kube-system')],
    ['ns/shop', ns('shop')],
    ['ns/production', ns('production')],
    ['ns/staging', ns('staging')],
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
