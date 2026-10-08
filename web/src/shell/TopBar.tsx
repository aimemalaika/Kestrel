import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { NamespacePicker } from './NamespacePicker'
import { Icon } from '../ui'
import { useAuth } from '../auth/AuthProvider'
import { useSelection } from '../state/selection'

// Opens the existing CommandPalette by firing the Cmd/Ctrl-K it listens for.
export function openCommandPalette() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
}

const TOP_LABELS: Record<string, string> = {
  overview: 'Overview',
  nodes: 'Nodes',
  events: 'Events',
  registry: 'Registry',
  helm: 'Helm',
  argo: 'Argo',
}

function useCrumbs(): string[] {
  const { pathname } = useLocation()
  const { namespace, gvr } = useSelection()
  const top = pathname.split('/')[1]
  if (top && TOP_LABELS[top]) return [TOP_LABELS[top]]
  const crumbs: string[] = []
  if (namespace) crumbs.push(namespace)
  if (gvr) crumbs.push(gvr.resource)
  return crumbs
}

function UserMenu() {
  const { identity, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  if (!identity) return null
  return (
    <div ref={ref} className="relative" data-testid="identity-badge">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="User menu"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-zinc-800 transition-colors border border-transparent hover:border-zinc-700"
      >
        <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center text-white text-[10px] font-bold">
          {identity.user.charAt(0).toUpperCase()}
        </div>
        <span className="text-xs text-zinc-300 hidden lg:block">{identity.user}</span>
        <Icon name="chevronD" className="w-3 h-3 text-zinc-500 hidden lg:block" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-48 bg-header border border-zinc-700 rounded-lg shadow-xl z-50 py-1"
        >
          <div className="px-3 py-2 border-b border-zinc-800">
            <p className="text-xs font-medium text-zinc-200 truncate">{identity.user}</p>
            <p className="text-[10px] text-zinc-500">{identity.role}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export function TopBar() {
  const crumbs = useCrumbs()
  return (
    <header className="flex items-center h-12 px-4 bg-header border-b border-zinc-800 shrink-0 z-40 gap-3">
      <div className="flex items-center gap-2 mr-2">
        <div className="w-7 h-7 rounded-md bg-brand flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4" aria-hidden="true">
            <path d="M2 6l8 4 12-6-6 14-4-6-4 2z" />
          </svg>
        </div>
        <span className="text-sm font-bold text-white hidden sm:block">Kestrel</span>
      </div>

      <div className="hidden md:block">
        <NamespacePicker />
      </div>

      <nav
        aria-label="Breadcrumb"
        className="hidden lg:flex items-center gap-1 text-xs text-zinc-500 ml-1"
      >
        {crumbs.map((c, i) => (
          <span key={`${c}-${i}`} className="flex items-center gap-1">
            <span>/</span>
            <span className="text-zinc-400">{c}</span>
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      <button
        type="button"
        aria-label="Search"
        onClick={openCommandPalette}
        className="flex items-center gap-2 bg-zinc-800/70 border border-zinc-700/70 rounded-lg px-3 py-1.5 w-48 lg:w-64 text-left"
      >
        <Icon name="search" className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <span className="flex-1 text-xs text-zinc-600">Search resources...</span>
        <kbd className="text-[10px] text-zinc-600 border border-zinc-700 rounded px-1 hidden lg:block">
          K
        </kbd>
      </button>

      <div className="hidden md:flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        <span className="text-xs text-emerald-400 font-medium">Healthy</span>
      </div>

      <UserMenu />
    </header>
  )
}
