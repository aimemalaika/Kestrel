import type { K8sObject } from '../contract/types'

export interface ColumnHint {
  header: string
  path: string
}

export const COLUMN_HINTS: Record<string, ColumnHint[]> = {
  Pod: [
    { header: 'Phase', path: 'status.phase' },
    { header: 'Node', path: 'spec.nodeName' },
  ],
  Deployment: [
    { header: 'Ready', path: 'status.readyReplicas' },
    { header: 'Available', path: 'status.availableReplicas' },
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
  kind: 'text' | 'age' | 'status' | 'scan'
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
    cols.push({ id: h.path, header: h.header, kind: 'text', value: (o) => str(getPath(o, h.path)) })
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
    value: (o) => str(getPath(o, 'status.phase')),
  })
  cols.push({
    id: 'age',
    header: 'Age',
    kind: 'age',
    value: (o) => str(o.metadata.creationTimestamp),
  })
  return cols
}
