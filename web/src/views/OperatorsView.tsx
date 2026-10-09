import { useState } from 'react'
import { useResourceStream } from '../table/useResourceStream'
import { ageString, getPath } from '../table/columns'
import type { K8sObject } from '../contract/types'
import { Card, StatusBadge, ViewHeader, Icon, FilterBar, EmptyState } from '../ui'
import { OperatorHubCatalog } from './OperatorHubView'

const TABS = ['Installed', 'OperatorHub']

const CSV = {
  group: 'operators.coreos.com',
  version: 'v1alpha1',
  resource: 'clusterserviceversions',
}

function text(o: K8sObject, path: string): string | undefined {
  const v = getPath(o, path)
  return v == null || v === '' || typeof v === 'object' ? undefined : String(v)
}

function apiKinds(o: K8sObject): string[] {
  const owned = getPath(o, 'spec.customresourcedefinitions.owned')
  const fromOwned = Array.isArray(owned)
    ? owned.map((x) => (x as { kind?: string }).kind).filter((k): k is string => !!k)
    : []
  const direct = getPath(o, 'apiKinds')
  const fromDirect = Array.isArray(direct) ? direct.map(String) : []
  return [...fromOwned, ...fromDirect]
}

function InstalledOperators() {
  const { rows, status } = useResourceStream(CSV, undefined)
  const [q, setQ] = useState('')
  const needle = q.toLowerCase()
  const items = rows
    .map((o) => ({
      key: `${o.metadata.namespace ?? ''}/${o.metadata.name}`,
      name: text(o, 'spec.displayName') ?? o.metadata.name,
      provider: text(o, 'spec.provider.name') ?? text(o, 'spec.provider') ?? '—',
      version: text(o, 'spec.version') ?? text(o, 'version') ?? '—',
      channel: text(o, 'spec.channel') ?? text(o, 'status.channel'),
      phase: text(o, 'status.phase') ?? 'Unknown',
      namespace: o.metadata.namespace ?? '—',
      apis: apiKinds(o),
      age: ageString(o.metadata.creationTimestamp),
    }))
    .filter((i) => i.name.toLowerCase().includes(needle))

  return (
    <div>
      <FilterBar query={q} onQuery={setQ} />
      {status === 'loading' && rows.length === 0 ? (
        <EmptyState title="Loading operators…" />
      ) : items.length === 0 ? (
        <EmptyState title="No operators found" hint="Install one from OperatorHub" icon="puzzle" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {items.map((op) => (
            <Card
              key={op.key}
              className={`p-4 border ${op.phase === 'Failed' ? 'border-red-500/30' : 'border-zinc-800/80'}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                    <Icon name="puzzle" className="w-4 h-4 text-zinc-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-200 leading-snug">{op.name}</p>
                    <p className="text-[10px] text-zinc-500">
                      {op.provider} · v{op.version}
                    </p>
                  </div>
                </div>
                <StatusBadge status={op.phase} />
              </div>
              {op.apis.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {op.apis.map((api) => (
                    <span
                      key={api}
                      className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400"
                    >
                      {api}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between text-[10px] text-zinc-500">
                <span>{op.namespace}</span>
                {op.channel && <span>Channel: {op.channel}</span>}
                <span>Installed {op.age}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export function OperatorsView({ initialTab = 'Installed' }: { initialTab?: string }) {
  const [tab, setTab] = useState(TABS.includes(initialTab) ? initialTab : 'Installed')
  return (
    <div>
      <ViewHeader
        title="Operators"
        tabs={TABS}
        activeTab={tab}
        onTab={setTab}
        action={
          tab === 'Installed' ? (
            <button
              type="button"
              onClick={() => setTab('OperatorHub')}
              className="text-xs px-3 py-1.5 rounded-lg bg-brand/15 text-brand-fg border border-brand/30 hover:bg-brand/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              Browse
            </button>
          ) : undefined
        }
      />
      {tab === 'Installed' ? <InstalledOperators /> : <OperatorHubCatalog />}
    </div>
  )
}
