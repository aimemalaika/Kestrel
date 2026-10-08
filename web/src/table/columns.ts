import type { K8sObject } from '../contract/types'

export type CellKind = 'text' | 'status' | 'usage' | 'restarts' | 'mono'

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

function dash(v: unknown): string | undefined {
  return v === undefined || v === null || v === '' ? undefined : String(v)
}

function svcPorts(o: K8sObject): string | undefined {
  const ports = arr(getPath(o, 'spec.ports'))
  if (!ports.length) return undefined
  return ports.map((p) => `${p.port}/${p.protocol ?? 'TCP'}`).join(', ')
}

export const COLUMN_HINTS: Record<string, ColumnHint[]> = {
  Pod: [
    { header: 'Phase', path: 'status.phase' },
    { header: 'Ready', path: 'ready', numeric: true, derive: podReady },
    { header: 'Restarts', path: 'restarts', numeric: true, cell: 'restarts', derive: podRestarts },
    { header: 'CPU', path: 'status.usage.cpu', numeric: true, derive: usage('cpu') },
    { header: 'Memory', path: 'status.usage.memory', numeric: true, derive: usage('memory') },
    { header: 'Node', path: 'spec.nodeName' },
  ],
  Deployment: [
    { header: 'Ready', path: 'ready', numeric: true, derive: deployReady },
    { header: 'Up-to-date', path: 'status.updatedReplicas', numeric: true },
    { header: 'Available', path: 'status.availableReplicas', numeric: true },
    { header: 'Strategy', path: 'spec.strategy.type' },
    {
      header: 'Image',
      path: 'image',
      cell: 'mono',
      derive: (o) => dash(arr(getPath(o, 'spec.template.spec.containers'))[0]?.image),
    },
  ],
  Service: [
    { header: 'Type', path: 'spec.type' },
    { header: 'ClusterIP', path: 'spec.clusterIP', cell: 'mono' },
    { header: 'Ports', path: 'ports', derive: svcPorts },
  ],
  Route: [
    { header: 'Host', path: 'spec.host', cell: 'mono' },
    { header: 'Service', path: 'spec.to.name' },
    { header: 'Port', path: 'spec.port.targetPort' },
    {
      header: 'TLS',
      path: 'spec.tls',
      derive: (o) => {
        const t = getPath(o, 'spec.tls')
        if (!t) return undefined
        return dash((t as Rec).termination) ?? 'Enabled'
      },
    },
  ],
  PersistentVolumeClaim: [
    { header: 'Capacity', path: 'status.capacity.storage' },
    { header: 'StorageClass', path: 'spec.storageClassName' },
  ],
  PersistentVolume: [
    { header: 'Capacity', path: 'spec.capacity.storage' },
    { header: 'Reclaim', path: 'spec.persistentVolumeReclaimPolicy' },
  ],
  StorageClass: [{ header: 'Provisioner', path: 'provisioner' }],
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
  kind: 'text' | 'age' | 'status' | 'scan' | 'usage' | 'restarts' | 'mono'
  align?: 'right'
  value: (o: K8sObject) => string
}

export function columnSpecs(kind: string, opts: { namespaceSelected: boolean }): ColumnSpec[] {
  const cols: ColumnSpec[] = [
    { id: 'name', header: 'Name', kind: 'text', value: (o) => o.metadata.name },
  ]
  if (!opts.namespaceSelected) {
    cols.push({
      id: 'namespace',
      header: 'Namespace',
      kind: 'text',
      value: (o) => str(o.metadata.namespace),
    })
  }
  for (const h of COLUMN_HINTS[kind] ?? []) {
    cols.push({
      id: h.path,
      header: h.header,
      kind: h.cell ?? 'text',
      align: h.numeric ? 'right' : undefined,
      value: (o) => str(h.derive ? h.derive(o) : getPath(o, h.path)),
    })
  }
  if (kind === 'PipelineRun') {
    cols.push({
      id: 'scan',
      header: 'Vulnerabilities',
      kind: 'scan',
      value: (o) => JSON.stringify(scanSummary(o) ?? {}),
    })
  }
  cols.push({
    id: 'status',
    header: 'Status',
    kind: 'status',
    value: (o) =>
      str(
        getPath(o, 'status.phase') ??
          (kind === 'Route' && arr(getPath(o, 'status.ingress'))[0] ? 'Admitted' : undefined),
      ),
  })
  cols.push({
    id: 'age',
    header: 'Age',
    kind: 'age',
    value: (o) => str(o.metadata.creationTimestamp),
  })
  return cols
}
