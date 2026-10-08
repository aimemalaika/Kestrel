import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createClient } from '../client/createClient'
import type { CatalogEntry } from '../contract/types'
import { bucketCatalog } from './categoryMap'
import { useSelection } from '../state/selection'
import { Icon } from '../ui'

const SECTION_ICON: Record<string, string> = {
  Workloads: 'deploy',
  Config: 'configmap',
  Network: 'service',
  Storage: 'storage',
  'Access Control': 'shield',
  Cluster: 'cluster',
  'Custom Resources': 'crd',
}

const RESOURCE_ICON: Record<string, string> = {
  pods: 'pod',
  deployments: 'deploy',
  replicasets: 'deploy',
  statefulsets: 'stateful',
  daemonsets: 'daemon',
  jobs: 'job',
  cronjobs: 'cron',
  configmaps: 'configmap',
  secrets: 'secret',
  services: 'service',
  ingresses: 'ingress',
  networkpolicies: 'shield',
  persistentvolumeclaims: 'storage',
  persistentvolumes: 'storage',
  storageclasses: 'storage',
  roles: 'shield',
  rolebindings: 'binding',
  clusterroles: 'shield',
  clusterrolebindings: 'binding',
  serviceaccounts: 'sa',
  nodes: 'node',
  namespaces: 'ns',
}

export function iconFor(resource: string, section: string): string {
  return RESOURCE_ICON[resource] ?? SECTION_ICON[section] ?? 'folder'
}

export function NavTree({ rail = false }: { rail?: boolean }) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const { namespace, gvr } = useSelection()
  useEffect(() => {
    let active = true
    createClient()
      .catalog()
      .then((c) => {
        if (active) setCatalog(c)
      })
      .catch(() => {
        if (active) setCatalog([])
      })
    return () => {
      active = false
    }
  }, [])

  const ns = namespace ?? 'default'
  const buckets = bucketCatalog(catalog)

  return (
    <nav>
      {buckets.map((b) => (
        <div key={b.section}>
          {!rail && (
            <button
              type="button"
              aria-expanded={!collapsed[b.section]}
              onClick={() => setCollapsed((c) => ({ ...c, [b.section]: !c[b.section] }))}
              className="w-full flex items-center px-3 py-1.5 text-left"
            >
              <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 flex-1">
                {b.section}
              </span>
              <Icon
                name="chevronD"
                className={`w-3 h-3 text-zinc-600 transition-transform ${collapsed[b.section] ? '-rotate-90' : ''}`}
              />
            </button>
          )}
          {(rail || !collapsed[b.section]) &&
            b.items.map((e) => {
              const to = `/ns/${ns}/${e.group}/${e.version}/${e.resource}`
              const active =
                gvr?.group === e.group && gvr?.version === e.version && gvr?.resource === e.resource
              return (
                <Link
                  key={`${e.group}/${e.version}/${e.resource}`}
                  to={to}
                  title={rail ? e.resource : undefined}
                  aria-label={rail ? e.resource : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2.5 py-1.5 text-xs border-l-2 ${rail ? 'justify-center' : 'pl-3 pr-2'} ${
                    active
                      ? 'bg-brand/10 text-brand-fg-soft border-brand'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border-transparent'
                  }`}
                >
                  <Icon name={iconFor(e.resource, b.section)} className="w-4 h-4 shrink-0" />
                  {!rail && <span className="flex-1 truncate">{e.resource}</span>}
                </Link>
              )
            })}
        </div>
      ))}
    </nav>
  )
}
