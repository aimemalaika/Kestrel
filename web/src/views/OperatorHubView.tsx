import { useState } from 'react'
import { OperatorsView } from './OperatorsView'
import { Card, Icon, FilterBar, EmptyState, Modal, PrimaryBtn, SecondaryBtn } from '../ui'
import { useToast } from '../toast/ToastProvider'

interface CatalogItem {
  name: string
  provider: string
  category: string
  desc: string
  channel?: string // default 'stable'
  installMode?: string // default 'All namespaces'
}

const CATEGORIES = ['All', 'AI/ML', 'Databases', 'Networking', 'Monitoring', 'Security', 'Storage']

// Static, vendor-neutral demo catalog (OperatorHub has no backing resource).
const CATALOG: CatalogItem[] = [
  {
    name: 'Stream Broker',
    provider: 'Example Org',
    category: 'Databases',
    desc: 'Managed event streaming clusters',
  },
  {
    name: 'Search Engine',
    provider: 'Example Org',
    category: 'Databases',
    desc: 'Full-text search and analytics',
  },
  {
    name: 'Document Store',
    provider: 'Example Org',
    category: 'Databases',
    desc: 'Document database lifecycle',
  },
  {
    name: 'Model Serving',
    provider: 'Example Org',
    category: 'AI/ML',
    desc: 'Deploy and scale ML models',
  },
  {
    name: 'Mesh Gateway',
    provider: 'Example Org',
    category: 'Networking',
    desc: 'Ingress and service mesh gateways',
  },
  {
    name: 'Secrets Manager',
    provider: 'Example Org',
    category: 'Security',
    desc: 'Centralized secret management',
  },
  {
    name: 'Dashboard Operator',
    provider: 'Example Org',
    category: 'Monitoring',
    desc: 'Deploy and manage dashboards',
  },
  {
    name: 'Volume Manager',
    provider: 'Example Org',
    category: 'Storage',
    desc: 'Distributed block and file storage',
  },
]

export function OperatorHubView() {
  return <OperatorsView initialTab="OperatorHub" />
}

export function OperatorHubCatalog() {
  const notify = useToast()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const [selected, setSelected] = useState<CatalogItem | null>(null)
  const [installed, setInstalled] = useState<string[]>([])
  const needle = q.toLowerCase()
  const items = CATALOG.filter(
    (i) =>
      (cat === 'All' || i.category === cat) &&
      (i.name.toLowerCase().includes(needle) || i.desc.toLowerCase().includes(needle)),
  )

  return (
    <div className="space-y-4">
      <FilterBar query={q} onQuery={setQ} />
      <div className="flex gap-2 flex-wrap" role="group" aria-label="Category">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={cat === c}
            onClick={() => setCat(c)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
              cat === c
                ? 'bg-brand/15 text-brand-fg border-brand/30'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <EmptyState
          title="No operators match"
          hint="Try another category or search"
          icon="puzzle"
        />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {items.map((item) => {
            const isInstalled = installed.includes(item.name)
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => setSelected(item)}
                className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 rounded-xl"
              >
                <Card className="p-3 h-full hover:border-zinc-600 transition-colors">
                  <div className="w-8 h-8 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-2">
                    <Icon name="puzzle" className="w-4 h-4 text-zinc-500" />
                  </div>
                  <p className="text-xs font-semibold text-zinc-200 mb-0.5">{item.name}</p>
                  <p className="text-[10px] text-zinc-500 mb-1">{item.provider}</p>
                  <p className="text-[10px] text-zinc-600 leading-relaxed">{item.desc}</p>
                  <span
                    className={`text-[9px] mt-2 inline-block px-1.5 py-0.5 rounded border ${
                      isInstalled
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-500'
                    }`}
                  >
                    {isInstalled ? 'Installed' : item.category}
                  </span>
                </Card>
              </button>
            )
          })}
        </div>
      )}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ''}
        description={selected ? `Provided by ${selected.provider}` : undefined}
        footer={
          selected && (
            <>
              <SecondaryBtn onClick={() => setSelected(null)}>Cancel</SecondaryBtn>
              <PrimaryBtn
                onClick={() => {
                  const name = selected.name
                  setInstalled((prev) => (prev.includes(name) ? prev : [...prev, name]))
                  notify('ok', `${name} installed`)
                  setSelected(null)
                }}
              >
                {selected && installed.includes(selected.name) ? 'Reinstall' : 'Install'}
              </PrimaryBtn>
            </>
          )
        }
      >
        {selected && (
          <div className="space-y-3">
            <p className="m-0 text-zinc-400">{selected.desc}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 m-0 text-xs">
              <dt className="text-zinc-500">Channel</dt>
              <dd className="m-0 text-zinc-200">{selected.channel ?? 'stable'}</dd>
              <dt className="text-zinc-500">Install mode</dt>
              <dd className="m-0 text-zinc-200">{selected.installMode ?? 'All namespaces'}</dd>
              <dt className="text-zinc-500">Category</dt>
              <dd className="m-0 text-zinc-200">{selected.category}</dd>
            </dl>
          </div>
        )}
      </Modal>
    </div>
  )
}
