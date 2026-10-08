import { useState } from 'react'
import { NavTree } from '../nav/NavTree'
import { Icon } from '../ui'
import type { Perspective } from '../nav/categoryMap'

export function Sidebar({ perspective }: { perspective: Perspective }) {
  // Start collapsed on narrow viewports (~phone) so content keeps usable width.
  const [open, setOpen] = useState(
    () =>
      typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 768px)').matches,
  )
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
        className="flex items-center justify-end px-3 py-2 text-zinc-600 hover:text-zinc-400 transition-colors border-b border-zinc-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-inset"
      >
        <Icon name={open ? 'chevronL' : 'chevron'} className="w-4 h-4" />
      </button>
      <div className="flex-1 overflow-y-auto py-1">
        <NavTree perspective={perspective} rail={!open} />
      </div>
    </aside>
  )
}
