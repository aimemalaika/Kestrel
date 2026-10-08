import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { NavTree } from '../nav/NavTree'
import { Icon } from '../ui'

const LINKS: [string, string, string][] = [
  ['/overview', 'Overview', 'grid'],
  ['/nodes', 'Nodes', 'node'],
  ['/events', 'Events', 'events'],
  ['/registry', 'Registry', 'image'],
  ['/helm', 'Helm', 'helm'],
  ['/argo', 'Argo', 'gitops'],
]

export function Sidebar() {
  const [open, setOpen] = useState(true)
  const { pathname } = useLocation()
  return (
    <aside
      data-testid="sidebar"
      data-open={open}
      className={`flex flex-col bg-sidebar border-r border-zinc-800/80 transition-all duration-200 shrink-0 ${open ? 'w-56' : 'w-12'}`}
    >
      <button
        type="button"
        aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-end px-3 py-2 text-zinc-600 hover:text-zinc-400 transition-colors border-b border-zinc-800/60"
      >
        <Icon name={open ? 'chevronL' : 'chevron'} className="w-4 h-4" />
      </button>
      <div className="flex-1 overflow-y-auto py-1">
        <div className="pb-1">
          {LINKS.map(([to, label, icon]) => {
            const active = pathname === to || pathname.startsWith(to + '/')
            return (
              <Link
                key={to}
                to={to}
                title={open ? undefined : label}
                aria-label={open ? undefined : label}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2.5 py-1.5 text-xs border-l-2 ${open ? 'pl-3 pr-2' : 'justify-center'} ${
                  active
                    ? 'bg-brand/10 text-brand-fg-soft border-brand'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border-transparent'
                }`}
              >
                <Icon name={icon} className="w-4 h-4 shrink-0" />
                {open && <span className="flex-1 truncate">{label}</span>}
              </Link>
            )
          })}
        </div>
        <NavTree rail={!open} />
      </div>
    </aside>
  )
}
