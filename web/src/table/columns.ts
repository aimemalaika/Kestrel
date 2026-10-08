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

export interface ColumnSpec {
  id: string
  header: string
  kind: 'text' | 'age' | 'status'
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
