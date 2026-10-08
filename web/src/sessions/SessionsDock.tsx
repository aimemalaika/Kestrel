import { useSessions } from './SessionsProvider'
import { Icon } from '../ui'

// Fixed bottom bar with its own opaque dark surface; independent of the shell background.
export function SessionsDock() {
  const { sessions, stop } = useSessions()
  if (!sessions.length) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex flex-wrap items-center gap-4 bg-[#151922] border-t border-zinc-800 px-6 py-2">
      <strong className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
        <Icon name="terminal" className="w-3.5 h-3.5 text-zinc-400" />
        Port-forwards ({sessions.length})
      </strong>
      {sessions.map((s) => (
        <span key={s.id} className="flex items-center gap-2 text-xs font-mono text-zinc-400">
          {s.ref.name} {s.localPort}→{s.remotePort}
          <span className="text-emerald-400">●</span>
          <button
            type="button"
            onClick={() => stop(s.id)}
            className="text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 px-2 py-0.5 rounded transition-colors"
          >
            stop
          </button>
        </span>
      ))}
    </div>
  )
}
