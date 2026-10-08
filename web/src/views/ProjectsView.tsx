import { Card, StatusBadge, ViewHeader } from '../ui'
import { useResourceStream } from '../table/useResourceStream'
import { Age } from '../table/Age'
import { getPath } from '../table/columns'

const NAMESPACES = { group: 'core', version: 'v1', resource: 'namespaces' }
const PODS = { group: 'core', version: 'v1', resource: 'pods' }
const QUOTAS = { group: 'core', version: 'v1', resource: 'resourcequotas' }

export function ProjectsView() {
  const { rows: nss } = useResourceStream(NAMESPACES, undefined)
  const { rows: pods } = useResourceStream(PODS, undefined)
  const { rows: quotas } = useResourceStream(QUOTAS, undefined)
  const projects = [...nss].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name))

  return (
    <div>
      <ViewHeader title="Projects" count={projects.length} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {projects.map((n) => {
          const name = n.metadata.name
          const podCount = pods.filter((p) => p.metadata.namespace === name).length
          const q = quotas.find((x) => x.metadata.namespace === name)
          const cpu = getPath(q ?? n, 'status.used.cpu')
          const mem = getPath(q ?? n, 'status.used.memory')
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
                    { label: 'CPU', value: cpu ? String(cpu) : '—' },
                    { label: 'Memory', value: mem ? String(mem) : '—' },
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
