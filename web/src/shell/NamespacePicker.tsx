import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createClient } from '../client/createClient'
import { useSelection } from '../state/selection'
import type { CatalogEntry } from '../contract/types'

export function NamespacePicker() {
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const { namespace, gvr } = useSelection()
  const navigate = useNavigate()

  const onPick = (ns: string) => {
    navigate(gvr ? `/ns/${ns}/${gvr.group}/${gvr.version}/${gvr.resource}` : `/ns/${ns}`)
  }

  useEffect(() => {
    const stop = createClient().watch(
      { group: 'core', version: 'v1', resource: 'namespaces' },
      {},
      (e) => {
        if ('object' in e && e.object.kind === 'Namespace') {
          setNamespaces((prev) =>
            prev.includes(e.object.metadata.name) ? prev : [...prev, e.object.metadata.name].sort(),
          )
        }
      },
    )
    return stop
  }, [])

  useEffect(() => {
    let active = true
    createClient()
      .catalog()
      .then((c) => active && setCatalog(c))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  // The selector only makes sense on a namespaced-resource view. Hide it on every
  // bespoke/cluster-scoped page (Overview, Projects, Nodes, Operators, Registry,
  // Service Map, Cluster, API Explorer, Dashboards, …) — those have no gvr — and
  // on cluster-scoped resources (PersistentVolumes, StorageClasses, CRDs, …).
  if (!gvr) return null
  const entry =
    catalog.find((c) => c.resource === gvr.resource && c.group === gvr.group) ??
    catalog.find((c) => c.resource === gvr.resource)
  if (entry && !entry.namespaced) return null

  return (
    <label className="hidden md:flex items-center gap-2">
      <span className="sr-only">Namespace</span>
      <select
        aria-label="Namespace"
        value={namespace ?? '_all'}
        onChange={(e) => onPick(e.target.value)}
        className="text-xs bg-zinc-800/70 border border-zinc-700/70 rounded-lg px-2.5 py-1.5 text-zinc-300 focus:outline-none focus:border-brand"
      >
        <option value="_all">All Namespaces</option>
        {namespaces.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  )
}
