import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { createClient } from '../client/createClient'
import type { CatalogEntry } from '../contract/types'
import { navFor, type NavItem, type Perspective } from './categoryMap'
import { useSelection } from '../state/selection'
import { Icon } from '../ui'

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-inset'

// Sections open by default (mirrors the mock); others start collapsed.
const DEFAULT_OPEN = new Set(['Home', 'Operators', 'Workloads', 'Builds', 'Observe', 'Developer'])

export function NavTree({
  perspective = 'admin',
  rail = false,
}: {
  perspective?: Perspective
  rail?: boolean
}) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const { namespace, gvr } = useSelection()
  const { pathname } = useLocation()
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
  const isOpen = (s: string) => expanded[s] ?? DEFAULT_OPEN.has(s)

  // Resolve an item to a link target + active flag, or undefined when not available.
  const resolve = (item: NavItem): { to: string; active: boolean } | undefined => {
    const t = item.target
    if (!t) return undefined
    if ('route' in t) {
      return { to: t.route, active: pathname === t.route || pathname.startsWith(t.route + '/') }
    }
    const e = catalog.find((c) => c.resource === t.resource)
    if (!e) return undefined
    return {
      to: `/ns/${ns}/${e.group}/${e.version}/${e.resource}`,
      active: gvr?.group === e.group && gvr?.version === e.version && gvr?.resource === e.resource,
    }
  }

  return (
    <nav aria-label="Primary">
      {navFor(perspective).map((s) => (
        <div key={s.section}>
          {!rail && (
            <button
              type="button"
              aria-expanded={isOpen(s.section)}
              onClick={() => setExpanded((c) => ({ ...c, [s.section]: !isOpen(s.section) }))}
              className={`w-full flex items-center px-3 py-1.5 text-left ${FOCUS}`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 flex-1">
                {s.section}
              </span>
              <Icon
                name="chevronD"
                className={`w-3 h-3 text-zinc-600 transition-transform ${isOpen(s.section) ? '' : '-rotate-90'}`}
              />
            </button>
          )}
          {(rail || isOpen(s.section)) &&
            s.items.map((item) => {
              const r = resolve(item)
              const base = `flex items-center gap-2.5 py-1.5 text-xs border-l-2 ${rail ? 'justify-center' : 'pl-3 pr-2'}`
              if (!r) {
                return (
                  <div
                    key={item.label}
                    aria-disabled="true"
                    title={rail ? `${item.label} (not available yet)` : 'Not available yet'}
                    className={`${base} text-zinc-600 border-transparent cursor-default select-none`}
                  >
                    <Icon name={item.icon} className="w-4 h-4 shrink-0 opacity-40" />
                    {rail ? (
                      <span className="sr-only">{item.label}</span>
                    ) : (
                      <span className="flex-1 truncate">{item.label}</span>
                    )}
                  </div>
                )
              }
              return (
                <Link
                  key={item.label}
                  to={r.to}
                  title={rail ? item.label : undefined}
                  aria-label={rail ? item.label : undefined}
                  aria-current={r.active ? 'page' : undefined}
                  className={`${base} ${
                    r.active
                      ? 'bg-brand/10 text-brand-fg-soft border-brand'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border-transparent'
                  } ${FOCUS}`}
                >
                  <Icon name={item.icon} className="w-4 h-4 shrink-0" />
                  {!rail && <span className="flex-1 truncate">{item.label}</span>}
                </Link>
              )
            })}
        </div>
      ))}
    </nav>
  )
}
