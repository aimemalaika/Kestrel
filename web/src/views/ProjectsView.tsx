import { Card, Icon, PrimaryBtn, StatusBadge, ViewHeader } from '../ui'
import { useResourceStream } from '../table/useResourceStream'
import { Age } from '../table/Age'
import { getPath } from '../table/columns'
import type { K8sObject } from '../contract/types'
import { parseQuantity } from './QuotasView'

const NAMESPACES = { group: 'core', version: 'v1', resource: 'namespaces' }
const PODS = { group: 'core', version: 'v1', resource: 'pods' }
const QUOTAS = { group: 'core', version: 'v1', resource: 'resourcequotas' }

/** Real usage % from a ResourceQuota (status.used / hard), else an em dash. */
function usagePct(q: K8sObject | undefined, res: 'cpu' | 'memory'): string {
  if (!q) return '—'
  const hard = (getPath(q, 'status.hard') ?? getPath(q, 'spec.hard') ?? {}) as Record<
    string,
    string
  >
  const used = (getPath(q, 'status.used') ?? {}) as Record<string, string>
  const h = hard[res] ?? hard[`requests.${res}`]
  const u = used[res] ?? used[`requests.${res}`]
  if (!h || !u) return '—'
  const r = parseQuantity(u) / parseQuantity(h)
  return Number.isFinite(r) ? `${Math.round(r * 100)}%` : '—'
}

export function ProjectsView() {
  const { rows: nss } = useResourceStream(NAMESPACES, undefined)
  const { rows: pods } = useResourceStream(PODS, undefined)
  const { rows: quotas } = useResourceStream(QUOTAS, undefined)
  const projects = [...nss].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name))

  return (
    <div>
      <ViewHeader
        title="Projects"
        count={projects.length}
        action={
          <PrimaryBtn>
            <Icon name="plus" className="w-3.5 h-3.5" />
            Create Project
          </PrimaryBtn>
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {projects.map((n) => {
          const name = n.metadata.name
          const podCount = pods.filter((p) => p.metadata.namespace === name).length
          const q = quotas.find((x) => x.metadata.namespace === name)
          const cpu = usagePct(q, 'cpu')
          const mem = usagePct(q, 'memory')
          return (
            <Card key={n.metadata.uid ?? name} className="p-4">
              <div data-testid={`project-${name}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-200">{name}</p>
                    <p className="text-xs text-zinc-500">
                      {n.metadata.annotations?.['openshift.io/display-name'] ?? name}
                    </p>
                  </div>
                  <StatusBadge status={String(getPath(n, 'status.phase') ?? 'Active')} />
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {[
                    { label: 'Pods', value: String(podCount) },
                    { label: 'CPU', value: cpu },
                    { label: 'Memory', value: mem },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-zinc-800/60 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-zinc-500 mb-0.5">{label}</p>
                      <p className="text-sm font-bold text-zinc-200">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-600">
                  Created <Age creationTimestamp={n.metadata.creationTimestamp} /> ago
                </p>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
