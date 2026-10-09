import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { NamespacePicker } from './NamespacePicker'
import { Icon } from '../ui'
import { useAuth } from '../auth/AuthProvider'
import { useSelection } from '../state/selection'
import type { Perspective } from '../nav/categoryMap'
import { firingAlerts } from '../modules/alerts/alertsMock'

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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const items = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
  const close = (restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
      return
    }
    const list = items()
    if (list.length === 0) return
    const i = list.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      list[(i + 1) % list.length].focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      list[(i - 1 + list.length) % list.length].focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      list[0].focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      list[list.length - 1].focus()
    } else if (e.key === 'Tab') {
      // Tab leaves the menu: close it and let focus move on naturally from the trigger.
      setOpen(false)
      triggerRef.current?.focus()
    }
  }
  useEffect(() => {
    if (open) items()[0]?.focus()
  }, [open])
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
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="User menu"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-zinc-800 transition-colors border border-transparent hover:border-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
      >
        <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center text-white text-[10px] font-bold">
          {identity.user.charAt(0).toUpperCase()}
        </div>
        <span className="text-xs text-zinc-300 hidden lg:block">{identity.user}</span>
        <Icon name="chevronD" className="w-3 h-3 text-zinc-500 hidden lg:block" />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full mt-1 w-48 bg-header border border-zinc-700 rounded-lg shadow-xl z-50 py-1"
        >
          <div className="px-3 py-2 border-b border-zinc-800">
            <p className="text-xs font-medium text-zinc-200 truncate">{identity.user}</p>
            <p className="text-[10px] text-zinc-500">{identity.role}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={signOut}
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 focus:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-inset"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60'

function PerspectiveToggle({
  perspective,
  onChange,
}: {
  perspective: Perspective
  onChange: (p: Perspective) => void
}) {
  const opts: [Perspective, string][] = [
    ['admin', 'Admin'],
    ['developer', 'Developer'],
  ]
  return (
    <div
      role="group"
      aria-label="Perspective"
      className="flex items-center bg-zinc-800/70 border border-zinc-700/70 rounded-lg p-0.5 gap-0.5 mr-2"
    >
      {opts.map(([p, label]) => (
        <button
          key={p}
          type="button"
          aria-pressed={perspective === p}
          onClick={() => onChange(p)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${FOCUS} ${
            perspective === p ? 'bg-brand text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  const firing = firingAlerts()
  const count = firing.length
  return (
    <div
      ref={ref}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          setOpen(false)
          triggerRef.current?.focus()
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        aria-controls="notification-panel"
        onClick={() => setOpen((o) => !o)}
        className={`relative p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors border border-transparent ${FOCUS}`}
      >
        <Icon name="bell" className="w-4 h-4" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-brand text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div
          id="notification-panel"
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full mt-2 w-80 bg-header border border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-zinc-800">
            <span className="text-sm font-semibold text-zinc-200">Notifications</span>
          </div>
          {count === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-zinc-500">No notifications</p>
          ) : (
            <div className="divide-y divide-zinc-800/60 max-h-72 overflow-y-auto">
              {firing.map((n) => (
                <div key={n.id} className="px-4 py-2.5">
                  <p className="text-xs font-medium text-zinc-200">
                    {n.name} <span className="text-[10px] text-zinc-500">({n.severity})</span>
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{n.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function TopBar({
  perspective,
  onPerspectiveChange,
}: {
  perspective: Perspective
  onPerspectiveChange: (p: Perspective) => void
}) {
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

      <PerspectiveToggle perspective={perspective} onChange={onPerspectiveChange} />

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
        className={`flex items-center gap-2 max-w-full bg-zinc-800/70 border border-zinc-700/70 rounded-lg px-3 py-1.5 w-48 lg:w-64 text-left ${FOCUS}`}
      >
        <Icon name="search" className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <span className="flex-1 text-xs text-zinc-600">Search resources...</span>
        <kbd className="text-[10px] text-zinc-600 border border-zinc-700 rounded px-1 hidden lg:block">
          K
        </kbd>
      </button>

      <div
        data-testid="cluster-pill"
        className="hidden md:flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs text-emerald-400 font-medium">kestrel-cluster</span>
        <span className="text-[10px] text-emerald-600">v1</span>
      </div>

      <button
        type="button"
        aria-label="Terminal"
        aria-disabled="true"
        tabIndex={-1}
        title="Terminal (not available yet)"
        className={`p-1.5 rounded-lg border border-transparent text-zinc-600 cursor-default ${FOCUS}`}
      >
        <Icon name="terminal" className="w-4 h-4" />
      </button>

      <NotificationBell />

      <button
        type="button"
        aria-label="Help"
        aria-disabled="true"
        tabIndex={-1}
        title="Help (not available yet)"
        className={`rounded-lg text-zinc-400 text-xs font-bold border border-zinc-700/50 w-7 h-7 flex items-center justify-center cursor-default ${FOCUS}`}
      >
        ?
      </button>

      <UserMenu />
    </header>
  )
}
