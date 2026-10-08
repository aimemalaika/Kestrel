import type { K8sObject } from '../../contract/types'
import { Card, Icon, Mono, SecondaryBtn, StatusBadge } from '../../ui'

interface ArgoResource {
  group?: string
  version?: string
  kind: string
  name: string
  namespace?: string
  status?: string
  health?: string
}
interface ArgoSpec {
  project?: string
  source?: { repoURL?: string; path?: string; targetRevision?: string }
  destination?: { server?: string; namespace?: string }
}
interface ArgoStatus {
  sync?: { status?: string }
  health?: { status?: string }
  resources?: ArgoResource[]
}

/** Applications card, matching the mock GitOpsView card. */
export function ArgoAppCard({ object }: { object: K8sObject }) {
  const spec = (object.spec ?? {}) as ArgoSpec
  const status = (object.status ?? {}) as ArgoStatus
  const sync = status.sync?.status ?? 'Unknown'
  return (
    <Card className={`p-4 ${sync === 'OutOfSync' ? 'border-amber-500/25' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand/15 border border-brand/20 flex items-center justify-center">
            <Icon name="gitops" className="w-4 h-4 text-brand" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-200 m-0">{object.metadata.name}</p>
            <p className="text-[10px] text-zinc-500 m-0">Project: {spec.project ?? 'default'}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={sync} />
          <StatusBadge status={status.health?.status ?? 'Unknown'} />
        </div>
      </div>
      <div className="space-y-1.5 text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <Icon name="external" className="w-3.5 h-3.5 shrink-0" />
          <span className="text-zinc-400 truncate">{spec.source?.repoURL ?? '—'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Icon name="folder" className="w-3.5 h-3.5 shrink-0" />
          <span className="text-zinc-400">path: {spec.source?.path ?? '—'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Icon name="cluster" className="w-3.5 h-3.5 shrink-0" />
          <span className="text-zinc-400">{spec.destination?.server ?? '—'}</span>
        </div>
      </div>
      <div className="flex gap-1.5 mt-3 pt-3 border-t border-zinc-800">
        <SecondaryBtn disabled>
          <Icon name="refresh" className="w-3.5 h-3.5" />
          Sync
        </SecondaryBtn>
        <SecondaryBtn disabled>
          <Icon name="external" className="w-3.5 h-3.5" />
          Details
        </SecondaryBtn>
      </div>
    </Card>
  )
}

/** Card grid of Applications (GitOpsView layout). */
export function ArgoAppGrid({ objects }: { objects: K8sObject[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {objects.map((o) => (
        <ArgoAppCard key={`${o.metadata.namespace ?? ''}/${o.metadata.name}`} object={o} />
      ))}
    </div>
  )
}

export function ArgoRichView({ object }: { object?: K8sObject }) {
  if (!object) return null
  const spec = (object.spec ?? {}) as ArgoSpec
  const status = (object.status ?? {}) as ArgoStatus
  const resources = status.resources ?? []
  const groups = new Map<string, ArgoResource[]>()
  for (const r of resources) groups.set(r.kind, [...(groups.get(r.kind) ?? []), r])

  const dd = 'm-0 text-xs text-zinc-200 break-all'
  return (
    <div className="text-zinc-200">
      <div className="flex items-center gap-3 text-xs">
        <span className="text-zinc-500">Sync</span>
        <StatusBadge status={status.sync?.status ?? 'Unknown'} />
        <span className="text-zinc-500">Health</span>
        <StatusBadge status={status.health?.status ?? 'Unknown'} />
      </div>
      <dl className="my-3 text-xs text-zinc-500">
        <dt>Repository</dt>
        <dd className={dd}>{spec.source?.repoURL ?? '—'}</dd>
        <dt>Path</dt>
        <dd className={dd}>{spec.source?.path ?? '—'}</dd>
        <dt>Revision</dt>
        <dd className={dd}>{spec.source?.targetRevision ?? '—'}</dd>
        <dt>Server</dt>
        <dd className={dd}>{spec.destination?.server ?? '—'}</dd>
        <dt>Namespace</dt>
        <dd className={dd}>{spec.destination?.namespace ?? '—'}</dd>
      </dl>
      {resources.length === 0 && <p className="text-xs text-zinc-500">No resources.</p>}
      {[...groups.entries()].map(([kind, items]) => (
        <section key={kind} aria-label={kind} className="mb-3">
          <strong className="text-xs font-semibold text-zinc-300">{kind}</strong>
          <ul className="list-none p-0 m-0">
            {items.map((r) => (
              <li
                key={`${r.kind}/${r.namespace ?? ''}/${r.name}`}
                className="flex items-center gap-2 py-2 border-b border-zinc-800/60"
              >
                <Mono>{r.name}</Mono>
                {r.namespace && <span className="text-xs text-zinc-500">{r.namespace}</span>}
                {r.status && <StatusBadge status={r.status} />}
                {r.health && <StatusBadge status={r.health} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
