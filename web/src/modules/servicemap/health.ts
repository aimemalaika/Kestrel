import type { GVR, K8sObject } from '../../contract/types'
import type { ServiceNodeModel } from './types'

export type Health = 'healthy' | 'degraded' | 'down' | 'unknown'

const GVRS: Record<string, GVR> = {
  Deployment: { group: 'apps', version: 'v1', resource: 'deployments' },
  StatefulSet: { group: 'apps', version: 'v1', resource: 'statefulsets' },
  DaemonSet: { group: 'apps', version: 'v1', resource: 'daemonsets' },
}

export function workloadGvr(w: ServiceNodeModel['workload']): GVR | undefined {
  if (!w) return undefined
  return GVRS[w.kind ?? 'Deployment'] ?? GVRS.Deployment
}

const RANK: Record<Health, number> = { healthy: 0, unknown: 1, degraded: 2, down: 3 }

function objHealth(o: K8sObject): Health {
  const spec = (o as { spec?: { replicas?: number } }).spec
  const st = (o as { status?: Record<string, number | undefined> }).status ?? {}
  const desired = o.kind === 'DaemonSet' ? (st.desiredNumberScheduled ?? 0) : (spec?.replicas ?? 1)
  const ready = o.kind === 'DaemonSet' ? (st.numberReady ?? 0) : (st.readyReplicas ?? 0)
  if (desired === 0) return 'unknown'
  if (ready >= desired) return 'healthy'
  if (ready === 0) return 'down'
  return 'degraded'
}

/** Missing workload -> unknown (never silently healthy); selector matches -> worst-of. */
export function deriveHealth(
  rows: K8sObject[],
  w: ServiceNodeModel['workload'],
  loading = false,
): Health {
  if (!w || loading) return 'unknown'
  const matches = rows.filter((o) => {
    if (o.metadata.namespace && o.metadata.namespace !== w.namespace) return false
    if (w.name) return o.metadata.name === w.name
    if (w.selector) {
      const labels = o.metadata.labels ?? {}
      return Object.entries(w.selector).every(([k, v]) => labels[k] === v)
    }
    return false
  })
  if (matches.length === 0) return 'unknown'
  return matches.map(objHealth).reduce((a, b) => (RANK[b] > RANK[a] ? b : a))
}

export const HEALTH_COLOR: Record<Health, string> = {
  healthy: '#10b981',
  degraded: '#f59e0b',
  down: '#ef4444',
  unknown: '#71717a',
}
