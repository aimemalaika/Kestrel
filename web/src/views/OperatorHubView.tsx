import { useState } from 'react'
import { Card, ViewHeader, Icon, FilterBar, EmptyState } from '../ui'

interface CatalogItem {
  name: string
  provider: string
  category: string
  desc: string
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
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const needle = q.toLowerCase()
  const items = CATALOG.filter(
    (i) =>
      (cat === 'All' || i.category === cat) &&
      (i.name.toLowerCase().includes(needle) || i.desc.toLowerCase().includes(needle)),
  )

  return (
    <div className="space-y-4">
      <ViewHeader title="OperatorHub" count={items.length} />
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
          {items.map((item) => (
            <Card key={item.name} className="p-3 hover:border-zinc-600 transition-colors">
              <div className="w-8 h-8 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-2">
                <Icon name="puzzle" className="w-4 h-4 text-zinc-500" />
              </div>
              <p className="text-xs font-semibold text-zinc-200 mb-0.5">{item.name}</p>
              <p className="text-[10px] text-zinc-500 mb-1">{item.provider}</p>
              <p className="text-[10px] text-zinc-600 leading-relaxed">{item.desc}</p>
              <span className="text-[9px] mt-2 inline-block px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-500">
                {item.category}
              </span>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
