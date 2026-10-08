import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createClient } from '../client/createClient'
import type { CatalogEntry } from '../contract/types'
import { bucketCatalog } from './categoryMap'
import { useSelection } from '../state/selection'

export function NavTree() {
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
        <div key={b.section} style={{ marginBottom: 'var(--space-4)' }}>
          <button
            type="button"
            aria-expanded={!collapsed[b.section]}
            onClick={() => setCollapsed((c) => ({ ...c, [b.section]: !c[b.section] }))}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontSize: 12,
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 'var(--space-2)',
            }}
          >
            {b.section}
          </button>
          {!collapsed[b.section] &&
            b.items.map((e) => {
              const to = `/ns/${ns}/${e.group}/${e.version}/${e.resource}`
              const active =
                gvr?.group === e.group && gvr?.version === e.version && gvr?.resource === e.resource
              return (
                <Link
                  key={`${e.group}/${e.version}/${e.resource}`}
                  to={to}
                  style={{
                    display: 'block',
                    padding: '6px var(--space-3)',
                    borderRadius: 'var(--r-badge)',
                    textDecoration: 'none',
                    color: active ? 'var(--brand-600)' : 'var(--text)',
                    background: active ? 'var(--brand-100)' : 'transparent',
                  }}
                >
                  {e.resource}
                </Link>
              )
            })}
        </div>
      ))}
    </nav>
  )
}
