import type { ReactNode } from 'react'

// A header is either a plain label or a descriptor allowing non-text content
// (sort buttons, a select-all checkbox) and per-column alignment — the resource
// table (R3) needs both, so the shape is flexible from the start.
type Descriptor = { label: ReactNode; align?: 'left' | 'right' | 'center'; className?: string }
export type Header = ReactNode | Descriptor

function isDescriptor(h: Header): h is Descriptor {
  return typeof h === 'object' && h !== null && 'label' in h
}

const ALIGN: Record<string, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

export function Table({
  headers,
  children,
  actions,
  'aria-label': ariaLabel,
}: {
  headers: Header[]
  children: ReactNode
  actions?: ReactNode
  'aria-label'?: string
}) {
  return (
    <div className="bg-surface border border-zinc-800/80 rounded-xl overflow-hidden">
      {actions && (
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/80">
          {actions}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label={ariaLabel}>
          <thead>
            <tr className="border-b border-zinc-800/60 bg-zinc-900/40">
              {headers.map((h, i) => {
                const label = isDescriptor(h) ? h.label : h
                const align = isDescriptor(h) ? (h.align ?? 'left') : 'left'
                const extra = isDescriptor(h) ? (h.className ?? '') : ''
                return (
                  <th
                    key={i}
                    scope="col"
                    className={`px-5 py-2.5 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider ${ALIGN[align]} ${extra}`}
                  >
                    {label}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/40">{children}</tbody>
        </table>
      </div>
    </div>
  )
}

export function TR({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      {...(onClick
        ? {
            role: 'button',
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            },
          }
        : {})}
      className={`transition-colors ${onClick ? 'cursor-pointer hover:bg-zinc-800/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60' : 'hover:bg-zinc-800/20'}`}
    >
      {children}
    </tr>
  )
}

export function TD({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-5 py-3 ${className}`}>{children}</td>
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-sky-400 text-xs">{children}</span>
}
