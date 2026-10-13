import type { K8sObject } from '../contract/types'

export type CellKind =
  | 'text'
  | 'status'
  | 'restarts'
  | 'mono'
  | 'podsquares'
  | 'scale'
  | 'readyfrac'
  | 'strategy'
  | 'svctype'
  | 'tls'
  | 'routehost'
  | 'keys'
  | 'rolekind'
  | 'rolemono'
  | 'check'

export interface ColumnHint {
  header: string
  /** Dot path; also the column id. */
  path: string
  /** Right-align (numeric) column. */
  numeric?: boolean
  /** Cell renderer kind (default 'text'). */
  cell?: CellKind
  /** Derived value; falls back to getPath(path) when omitted. */
  derive?: (o: K8sObject) => string | undefined
}

type Rec = Record<string, unknown>
const arr = (v: unknown): Rec[] => (Array.isArray(v) ? (v as Rec[]) : [])
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0)

function podReady(o: K8sObject): string {
  const total = arr(getPath(o, 'spec.containers')).length
  const cs = arr(getPath(o, 'status.containerStatuses'))
  const ready = cs.length
    ? cs.filter((c) => c.ready === true).length
    : getPath(o, 'status.phase') === 'Running'
      ? total
      : 0
  return `${ready}/${total}`
}

function podRestarts(o: K8sObject): string {
  return String(
    arr(getPath(o, 'status.containerStatuses')).reduce((n, c) => n + num(c.restartCount), 0),
  )
}

/** Pod usage lives at status.usage.{cpu,memory} as raw quantities (e.g. "124m", "256Mi"),
 *  shown verbatim like the design. Absent (real backend w/o metrics) → "n/a". */
function usage(field: 'cpu' | 'memory') {
  return (o: K8sObject): string => {
    const v = getPath(o, `status.usage.${field}`)
    return v === undefined || v === null || v === '' ? 'n/a' : String(v)
  }
}

function deployReady(o: K8sObject): string {
  return `${num(getPath(o, 'status.readyReplicas'))}/${num(getPath(o, 'spec.replicas') ?? getPath(o, 'status.replicas'))}`
}

function deployDesired(o: K8sObject): string {
  return String(num(getPath(o, 'spec.replicas') ?? getPath(o, 'status.replicas')))
}

/** StatefulSet readiness: status.readyReplicas / spec.replicas. */
function stsReady(o: K8sObject): string {
  return `${num(getPath(o, 'status.readyReplicas'))}/${num(getPath(o, 'spec.replicas') ?? getPath(o, 'status.replicas'))}`
}

/** DaemonSet readiness: status.numberReady / status.desiredNumberScheduled. */
function dsReady(o: K8sObject): string {
  return `${num(getPath(o, 'status.numberReady'))}/${num(getPath(o, 'status.desiredNumberScheduled'))}`
}

/** Ingress address: first status.loadBalancer.ingress ip|hostname, else undefined. */
function ingressAddress(o: K8sObject): string | undefined {
  const ing = arr(getPath(o, 'status.loadBalancer.ingress'))[0]
  return dash(ing?.ip ?? ing?.hostname)
}

/** Ingress hosts: comma-joined spec.rules[].host. */
function ingressHosts(o: K8sObject): string | undefined {
  const hosts = arr(getPath(o, 'spec.rules'))
    .map((r) => r.host)
    .filter(Boolean)
  return hosts.length ? hosts.join(', ') : undefined
}

function dash(v: unknown): string | undefined {
  return v === undefined || v === null || v === '' ? undefined : String(v)
}

function svcPorts(o: K8sObject): string | undefined {
  const ports = arr(getPath(o, 'spec.ports'))
  if (!ports.length) return undefined
  return ports
    .map((p) => {
      const target = p.targetPort !== undefined && p.targetPort !== null ? `:${p.targetPort}` : ''
      const node = p.nodePort ? `:${p.nodePort}` : ''
      return `${p.port}${target}${node}/${p.protocol ?? 'TCP'}`
    })
    .join(', ')
}

function routeStatus(o: K8sObject): string | undefined {
  const ingress = arr(getPath(o, 'status.ingress'))
  if (!ingress.length) return undefined
  const conds = ingress.flatMap((i) => arr(i.conditions)).filter((c) => c.type === 'Admitted')
  if (conds.some((c) => c.status === 'False')) return 'Rejected'
  return 'Accepted'
}

const count = (path: string) => (o: K8sObject) => {
  const v = getPath(o, path)
  return String(Array.isArray(v) ? v.length : 0)
}

function pvClaim(o: K8sObject): string | undefined {
  const ref = getPath(o, 'spec.claimRef') as Rec | undefined
  if (!ref || !ref.name) return undefined
  return ref.namespace ? `${ref.namespace}/${ref.name}` : String(ref.name)
}

// Access modes abbreviated like kubectl (ReadWriteOnce → RWO).
const ACCESS_ABBR: Record<string, string> = {
  ReadWriteOnce: 'RWO',
  ReadWriteMany: 'RWX',
  ReadOnlyMany: 'ROX',
  ReadWriteOncePod: 'RWOP',
}
function accessMode(o: K8sObject): string | undefined {
  const v = getPath(o, 'spec.accessModes')
  const m = Array.isArray(v) ? String(v[0]) : undefined
  return m ? (ACCESS_ABBR[m] ?? m) : undefined
}

// PVC capacity: bound PVCs report status.capacity; pending ones only a request.
function pvcCapacity(o: K8sObject): string | undefined {
  return dash(
    getPath(o, 'status.capacity.storage') ?? getPath(o, 'spec.resources.requests.storage'),
  )
}

export const DEFAULT_SC_ANNOTATION = 'storageclass.kubernetes.io/is-default-class'
export function isDefaultStorageClass(o: K8sObject): boolean {
  const a = o.metadata.annotations as Record<string, string> | undefined
  return a?.[DEFAULT_SC_ANNOTATION] === 'true'
}

/** Kinds that have no meaningful status: they get no Status column. */
const NO_STATUS_KINDS = new Set([
  'Deployment',
  'ConfigMap',
  'Secret',
  'ServiceAccount',
  'Role',
  'ClusterRole',
  'RoleBinding',
  'ClusterRoleBinding',
  'Service',
  'StorageClass',
  'StatefulSet',
  'DaemonSet',
  'Ingress',
  'Pipeline',
  'Task',
  'StepAction',
  'Trigger',
  'TriggerBinding',
  'TriggerTemplate',
  'ClusterTriggerBinding',
  'Interceptor',
  'ClusterInterceptor',
  'VerificationPolicy',
])

/** Kinds whose Status column sits right after Name/Namespace. */
const STATUS_FIRST_KINDS = new Set(['PersistentVolumeClaim', 'Pod'])

/** Kinds whose Type (first hint) is emitted before the generic Namespace column
 *  (mock order: Name, Type, Namespace, …). */
const TYPE_BEFORE_NAMESPACE_KINDS = new Set(['Role', 'ClusterRole'])

export function hasStatusColumn(kind: string): boolean {
  return !NO_STATUS_KINDS.has(kind)
}

const ROLE_HINTS: ColumnHint[] = [
  {
    header: 'Type',
    path: 'roleKind',
    cell: 'rolekind',
    derive: (o) => (o.kind === 'ClusterRole' ? 'ClusterRole' : 'Role'),
  },
  { header: 'Rules', path: 'rules', numeric: true, derive: count('rules') },
]

const BINDING_HINTS: ColumnHint[] = [
  { header: 'Role Ref', path: 'roleRef.name', cell: 'rolemono' },
  {
    header: 'Subject',
    path: 'subject',
    cell: 'mono',
    derive: (o) => dash(arr(getPath(o, 'subjects'))[0]?.name),
  },
]

export const COLUMN_HINTS: Record<string, ColumnHint[]> = {
  ResolutionRequest: [
    {
      header: 'Resolver',
      path: 'metadata.labels',
      derive: (o) => dash(o.metadata.labels?.['resolution.tekton.dev/type']),
    },
  ],
  VerificationPolicy: [
    { header: 'Mode', path: 'spec.mode' },
    {
      header: 'Authorities',
      path: 'spec.authorities',
      numeric: true,
      derive: count('spec.authorities'),
    },
  ],
  EventListener: [{ header: 'Address', path: 'status.address.url', cell: 'mono' }],
  ManualApprovalGate: [
    { header: 'State', path: 'status.state', cell: 'status' },
    { header: 'Required', path: 'spec.approvalsRequired', numeric: true },
    { header: 'Approvers', path: 'spec.approvers', numeric: true, derive: count('spec.approvers') },
  ],
  Pod: [
    { header: 'Ready', path: 'ready', numeric: true, derive: podReady },
    { header: 'Restarts', path: 'restarts', numeric: true, cell: 'restarts', derive: podRestarts },
    { header: 'CPU', path: 'status.usage.cpu', numeric: true, derive: usage('cpu') },
    { header: 'Memory', path: 'status.usage.memory', numeric: true, derive: usage('memory') },
    { header: 'Node', path: 'spec.nodeName' },
  ],
  Deployment: [
    { header: 'Pods', path: 'pods', cell: 'podsquares', derive: deployReady },
    { header: 'Ready', path: 'ready', numeric: true, cell: 'readyfrac', derive: deployReady },
    {
      header: 'Replicas',
      path: 'spec.replicas',
      numeric: true,
      cell: 'scale',
      derive: deployDesired,
    },
    { header: 'Strategy', path: 'spec.strategy.type', cell: 'strategy' },
    {
      header: 'Image',
      path: 'image',
      cell: 'mono',
      derive: (o) => dash(arr(getPath(o, 'spec.template.spec.containers'))[0]?.image),
    },
  ],
  StatefulSet: [
    { header: 'Ready', path: 'ready', numeric: true, cell: 'readyfrac', derive: stsReady },
    {
      header: 'Replicas',
      path: 'spec.replicas',
      numeric: true,
      cell: 'scale',
      derive: deployDesired,
    },
  ],
  DaemonSet: [
    { header: 'Ready', path: 'ready', numeric: true, cell: 'readyfrac', derive: dsReady },
    { header: 'Available', path: 'status.numberAvailable', numeric: true },
  ],
  Ingress: [
    { header: 'Hosts', path: 'hosts', cell: 'mono', derive: ingressHosts },
    { header: 'Address', path: 'address', cell: 'mono', derive: ingressAddress },
  ],
  Service: [
    { header: 'Type', path: 'spec.type', cell: 'svctype' },
    { header: 'ClusterIP', path: 'spec.clusterIP', cell: 'mono' },
    { header: 'Ports', path: 'ports', cell: 'mono', derive: svcPorts },
  ],
  Route: [
    { header: 'Host', path: 'spec.host', cell: 'routehost' },
    { header: 'Service', path: 'spec.to.name', cell: 'mono' },
    { header: 'Port', path: 'spec.port.targetPort', numeric: true },
    {
      header: 'TLS',
      path: 'spec.tls',
      cell: 'tls',
      derive: (o) => {
        const t = getPath(o, 'spec.tls')
        if (!t) return 'None'
        return dash((t as Rec).termination) ?? 'Enabled'
      },
    },
  ],
  ConfigMap: [
    {
      header: 'Keys',
      path: 'data',
      cell: 'keys',
      derive: (o) => {
        const d = getPath(o, 'data')
        return String(d && typeof d === 'object' ? Object.keys(d).length : 0)
      },
    },
  ],
  Secret: [{ header: 'Type', path: 'type', cell: 'mono' }],
  ServiceAccount: [
    { header: 'Secrets', path: 'secrets', numeric: true, derive: count('secrets') },
    {
      header: 'Image Pull Secrets',
      path: 'imagePullSecrets',
      numeric: true,
      derive: count('imagePullSecrets'),
    },
  ],
  Role: ROLE_HINTS,
  ClusterRole: ROLE_HINTS,
  RoleBinding: BINDING_HINTS,
  ClusterRoleBinding: BINDING_HINTS,
  PersistentVolumeClaim: [
    { header: 'Capacity', path: 'status.capacity.storage', derive: pvcCapacity },
    { header: 'Access Mode', path: 'spec.accessModes', derive: accessMode },
    { header: 'StorageClass', path: 'spec.storageClassName' },
  ],
  PersistentVolume: [
    { header: 'Capacity', path: 'spec.capacity.storage' },
    { header: 'Access Mode', path: 'spec.accessModes', derive: accessMode },
    // Inline status marker: expands into the generic Status column mid-list,
    // matching the ui/ mock order (…, Access Mode, Status, Claim, …).
    { header: 'Status', path: 'status', cell: 'status' },
    { header: 'Claim', path: 'spec.claimRef', cell: 'mono', derive: pvClaim },
    { header: 'StorageClass', path: 'spec.storageClassName' },
  ],
  StorageClass: [
    { header: 'Provisioner', path: 'provisioner', cell: 'mono' },
    { header: 'Reclaim Policy', path: 'reclaimPolicy' },
    { header: 'Volume Binding', path: 'volumeBindingMode' },
    {
      header: 'Default',
      path: 'default',
      cell: 'check',
      derive: (o) => (isDefaultStorageClass(o) ? 'true' : 'false'),
    },
  ],
  PipelineRun: [
    { header: 'Status', path: 'status', cell: 'status' },
    { header: 'Pipeline', path: 'spec.pipelineRef.name', cell: 'mono' },
    { header: 'Started', path: 'status.startTime', derive: startedString },
    { header: 'Duration', path: 'status.duration', derive: (o) => durationString(o) },
  ],
  TaskRun: [
    { header: 'Status', path: 'status', cell: 'status' },
    { header: 'Task', path: 'spec.taskRef.name', cell: 'mono' },
    { header: 'Started', path: 'status.startTime', derive: startedString },
    { header: 'Duration', path: 'status.duration', derive: (o) => durationString(o) },
    { header: 'Pod', path: 'status.podName', cell: 'mono' },
  ],
  Pipeline: [{ header: 'Tasks', path: 'spec.tasks', numeric: true, derive: count('spec.tasks') }],
  Task: [{ header: 'Steps', path: 'spec.steps', numeric: true, derive: count('spec.steps') }],
  StepAction: [{ header: 'Image', path: 'spec.image', cell: 'mono' }],
  CustomRun: [
    { header: 'Status', path: 'status', cell: 'status' },
    { header: 'Started', path: 'status.startTime', derive: startedString },
    { header: 'Duration', path: 'status.duration', derive: (o) => durationString(o) },
  ],
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object' && Object.prototype.hasOwnProperty.call(acc, k)) {
      return (acc as Record<string, unknown>)[k]
    }
    return undefined
  }, obj)
}

export function ageString(creationTimestamp?: string, now: number = Date.now()): string {
  if (!creationTimestamp) return '—'
  const then = Date.parse(creationTimestamp)
  if (Number.isNaN(then)) return '—'
  const s = Math.max(0, Math.floor((now - then) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function str(v: unknown): string {
  return v === undefined || v === null ? '—' : String(v)
}

/** Tekton run kinds whose status lives in status.conditions[] (type Succeeded),
 *  not status.phase. */
const TEKTON_RUN_KINDS = new Set(['PipelineRun', 'TaskRun', 'CustomRun', 'ResolutionRequest'])

/** Derive a tonable status string from a Tekton run's Succeeded condition. */
function tektonRunStatus(o: K8sObject): string | undefined {
  const c = arr(getPath(o, 'status.conditions')).find((x) => x.type === 'Succeeded')
  if (!c) return undefined
  const reason = typeof c.reason === 'string' ? c.reason : ''
  if (c.status === 'True') return 'Succeeded'
  if (c.status === 'False') return /cancel/i.test(reason) ? 'Cancelled' : 'Failed'
  return /cancel/i.test(reason) ? 'Cancelled' : 'Running' // Unknown
}

/** Derive Ready/NotReady/Pending from an EventListener's Ready condition. */
function readyStatus(o: K8sObject): string | undefined {
  const c = arr(getPath(o, 'status.conditions')).find((x) => x.type === 'Ready')
  if (!c) return undefined
  if (c.status === 'True') return 'Ready'
  if (c.status === 'False') return 'NotReady'
  return 'Pending'
}

/** Relative "started N ago" for a run's status.startTime (reuses ageString). */
function startedString(o: K8sObject): string | undefined {
  const t = getPath(o, 'status.startTime')
  return typeof t === 'string' ? ageString(t) : undefined
}

/** Compact run duration startTime→completionTime (or →now while running). */
export function durationString(o: K8sObject, now: number = Date.now()): string | undefined {
  const start = getPath(o, 'status.startTime')
  if (typeof start !== 'string') return undefined
  const startMs = Date.parse(start)
  if (Number.isNaN(startMs)) return undefined
  const comp = getPath(o, 'status.completionTime')
  const endMs = typeof comp === 'string' ? Date.parse(comp) : now
  if (Number.isNaN(endMs)) return undefined
  let s = Math.max(0, Math.floor((endMs - startMs) / 1000))
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  s -= m * 60
  return h ? `${h}h${m}m${s}s` : m ? `${m}m${s}s` : `${s}s`
}

export interface ScanCounts {
  critical: number
  high: number
  medium: number
  low: number
}

export function scanSummary(object: K8sObject): ScanCounts | undefined {
  const results = getPath(object, 'status.results')
  if (!Array.isArray(results)) return undefined
  const r = results.find(
    (x) => x && typeof x.name === 'string' && x.name.endsWith('SCAN_OUTPUT'),
  ) as { value?: unknown } | undefined
  if (!r || typeof r.value !== 'string') return undefined
  try {
    const p = JSON.parse(r.value) as Record<string, unknown>
    if (!p || typeof p !== 'object') return undefined
    const n = (k: string) => (typeof p[k] === 'number' ? (p[k] as number) : 0)
    return { critical: n('critical'), high: n('high'), medium: n('medium'), low: n('low') }
  } catch {
    return undefined
  }
}

export interface ColumnSpec {
  id: string
  header: string
  kind: CellKind | 'age' | 'scan'
  align?: 'right'
  value: (o: K8sObject) => string
}

export function columnSpecs(kind: string, opts: { namespaceSelected: boolean }): ColumnSpec[] {
  const hints = COLUMN_HINTS[kind] ?? []
  const statusCol: ColumnSpec = {
    id: 'status',
    header: 'Status',
    kind: 'status',
    value: (o) =>
      str(
        TEKTON_RUN_KINDS.has(kind)
          ? tektonRunStatus(o)
          : kind === 'EventListener'
            ? readyStatus(o)
            : kind === 'ManualApprovalGate'
              ? getPath(o, 'status.state')
              : (getPath(o, 'status.phase') ?? (kind === 'Route' ? routeStatus(o) : undefined)),
      ),
  }
  const pushHint = (h: ColumnHint) =>
    cols.push({
      id: h.path,
      header: h.header,
      kind: h.cell ?? 'text',
      align: h.numeric ? 'right' : undefined,
      value: (o) => str(h.derive ? h.derive(o) : getPath(o, h.path)),
    })

  const cols: ColumnSpec[] = [
    { id: 'name', header: 'Name', kind: 'text', value: (o) => o.metadata.name },
  ]
  // Narrow rule: Role/ClusterRole put their Type (first hint) before Namespace.
  const typeFirst = TYPE_BEFORE_NAMESPACE_KINDS.has(kind) && !opts.namespaceSelected && hints.length
  if (typeFirst) pushHint(hints[0])
  if (!opts.namespaceSelected) {
    cols.push({
      id: 'namespace',
      header: 'Namespace',
      kind: 'text',
      value: (o) => str(o.metadata.namespace),
    })
  }
  let statusEmitted = hasStatusColumn(kind) && STATUS_FIRST_KINDS.has(kind)
  if (statusEmitted) cols.push(statusCol)
  for (const h of typeFirst ? hints.slice(1) : hints) {
    if (h.cell === 'status') {
      cols.push(statusCol)
      statusEmitted = true
      continue
    }
    pushHint(h)
  }
  if (kind === 'PipelineRun') {
    cols.push({
      id: 'scan',
      header: 'Vulnerabilities',
      kind: 'scan',
      value: (o) => JSON.stringify(scanSummary(o) ?? {}),
    })
  }
  if (hasStatusColumn(kind) && !statusEmitted) cols.push(statusCol)
  cols.push({
    id: 'age',
    header: 'Age',
    kind: 'age',
    value: (o) => str(o.metadata.creationTimestamp),
  })
  return cols
}
