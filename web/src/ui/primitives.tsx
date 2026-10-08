import type { ReactNode } from 'react'
import { Icon } from './Icon'

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`bg-surface border border-zinc-800/80 rounded-xl ${className}`}>{children}</div>
  )
}

export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/60">
      <span className="text-sm font-semibold text-zinc-200">{title}</span>
      {action}
    </div>
  )
}

export function MiniBar({ value, className = 'w-24' }: { value: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, value))
  const color = pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-amber-400' : 'bg-emerald-400'
  const textColor = pct > 85 ? 'text-red-400' : pct > 65 ? 'text-amber-400' : 'text-zinc-400'
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className={`${className} h-1.5 bg-zinc-700/60 rounded-full overflow-hidden`}
      >
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs tabular-nums w-8 ${textColor}`}>{pct}%</span>
    </div>
  )
}

// Explicit map (not string-munging): Tailwind v4 statically scans source, so the
// tinted bg classes must appear as literals to survive the build.
const ICON_BG: Record<string, string> = {
  'text-emerald-400': 'bg-emerald-500/15',
  'text-red-400': 'bg-red-500/15',
  'text-amber-400': 'bg-amber-500/15',
  'text-sky-400': 'bg-sky-500/15',
  'text-blue-400': 'bg-blue-500/15',
  'text-violet-400': 'bg-violet-500/15',
  'text-zinc-400': 'bg-zinc-500/15',
}

/** `color` is a Tailwind text class such as `text-emerald-400` (tinted icon bg from ICON_BG). */
export function StatCard({
  label,
  value,
  sub,
  color,
  icon,
  trend,
}: {
  label: string
  value: string
  sub: string
  color: string
  icon: string
  trend?: string
}) {
  return (
    <Card>
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs text-zinc-500 uppercase tracking-widest">{label}</p>
          <div className={`p-1.5 rounded-lg ${ICON_BG[color] ?? 'bg-zinc-500/15'}`}>
            <Icon name={icon} className={`w-4 h-4 ${color}`} />
          </div>
        </div>
        <p className={`text-3xl font-bold ${color} mb-1`}>{value}</p>
        <p className="text-xs text-zinc-500">{sub}</p>
        {trend && <p className="text-[10px] text-zinc-600 mt-1">{trend}</p>}
      </div>
    </Card>
  )
}

export function ViewHeader({
  title,
  count,
  action,
  tabs,
  activeTab,
  onTab,
}: {
  title: string
  count?: number
  action?: ReactNode
  tabs?: string[]
  activeTab?: string
  onTab?: (t: string) => void
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
        {count !== undefined && (
          <span className="text-xs text-zinc-500 bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5">
            {count}
          </span>
        )}
        {tabs && (
          <div className="flex gap-1 ml-2" role="group" aria-label={`${title} views`}>
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={activeTab === t}
                onClick={() => onTab?.(t)}
                className={`text-xs px-3 py-1 rounded transition-colors ${
                  activeTab === t
                    ? 'bg-brand/15 text-brand-fg border border-brand/30'
                    : 'text-zinc-400 hover:text-zinc-200 border border-transparent hover:bg-zinc-800'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
      {action}
    </div>
  )
}

export function PrimaryBtn({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 text-xs bg-brand hover:bg-red-600 text-white px-3.5 py-1.5 rounded-md font-medium transition-colors disabled:opacity-50"
    >
      {children}
    </button>
  )
}

export function SecondaryBtn({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-50"
    >
      {children}
    </button>
  )
}

/** Namespace options are supplied by the caller (the mock hard-coded them). */
export function FilterBar({
  query,
  onQuery,
  namespaceFilter,
  onNamespace,
  namespaces = [],
  statusFilter,
  onStatus,
  statuses = [],
}: {
  query: string
  onQuery: (q: string) => void
  namespaceFilter?: string
  onNamespace?: (ns: string) => void
  namespaces?: string[]
  statusFilter?: string
  onStatus?: (s: string) => void
  statuses?: string[]
}) {
  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <div className="flex items-center gap-2 bg-zinc-800/80 border border-zinc-700/80 rounded-lg px-3 py-1.5 flex-1 min-w-[180px] max-w-xs focus-within:ring-2 focus-within:ring-brand/60">
        <Icon name="search" className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <input
          type="search"
          aria-label="Filter by name"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Filter by name..."
          className="bg-transparent text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none w-full"
        />
      </div>
      {onNamespace && (
        <select
          aria-label="Namespace"
          value={namespaceFilter ?? ''}
          onChange={(e) => onNamespace(e.target.value)}
          className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus:border-brand"
        >
          <option value="">All namespaces</option>
          {namespaces.map((ns) => (
            <option key={ns} value={ns}>
              {ns}
            </option>
          ))}
        </select>
      )}
      {onStatus && statuses.length > 0 && (
        <div className="flex gap-1" role="group" aria-label="Status filter">
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={statusFilter === s}
              onClick={() => onStatus(s)}
              className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                statusFilter === s
                  ? 'bg-brand/15 text-brand-fg border-brand/30'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  hint,
  icon = 'search',
  action,
}: {
  title: string
  hint?: string
  icon?: string
  action?: ReactNode
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-2 py-12 text-center text-zinc-500"
    >
      <Icon name={icon} className="w-6 h-6 text-zinc-600" />
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      {hint && <p className="text-xs">{hint}</p>}
      {action}
    </div>
  )
}
