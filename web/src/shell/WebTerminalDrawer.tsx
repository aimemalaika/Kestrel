import { lazy, Suspense, useState } from 'react'
import { useSelection } from '../state/selection'
import { Icon } from '../ui'
import type { ResourceRef } from '../client/Client'

const Terminal = lazy(() => import('../streaming/Terminal'))

// WebTerminalDrawer is the bottom shell drawer that fronts REAL pod exec (the
// existing streaming/Terminal over the /exec WebSocket). Because real exec needs
// a concrete pod, it carries a small namespace/pod/container picker — not a mock
// shell simulation.
export function WebTerminalDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { namespace } = useSelection()
  const [ns, setNs] = useState(namespace ?? 'default')
  const [name, setName] = useState('')
  const [target, setTarget] = useState<ResourceRef | null>(null)

  if (!open) return null

  const connect = () => {
    if (!name.trim()) return
    setTarget({
      group: '',
      version: 'v1',
      resource: 'pods',
      namespace: ns.trim() || 'default',
      name: name.trim(),
    })
  }

  return (
    <div
      style={{ height: 260 }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
      className="bg-[#0d1117] border-t border-zinc-800 flex flex-col shrink-0"
    >
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
        <Icon name="terminal" className="w-4 h-4 text-zinc-400" />
        <span className="text-xs font-semibold text-zinc-200">Web Terminal</span>
        <div className="ml-auto">
          <button
            type="button"
            aria-label="Close terminal"
            onClick={onClose}
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <Icon name="chevronD" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!target ? (
        <div className="flex-1 overflow-auto p-4">
          <p className="mt-0 mb-3 text-xs text-zinc-500">
            Select a namespace and pod to open a shell.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[10px] text-zinc-500">
              Namespace
              <input
                aria-label="Namespace"
                value={ns}
                onChange={(e) => setNs(e.target.value)}
                className="px-2 py-1 text-xs bg-[#161b27] border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:ring-2 focus:ring-brand/60"
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-zinc-500">
              Pod
              <input
                aria-label="Pod"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="px-2 py-1 text-xs bg-[#161b27] border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:ring-2 focus:ring-brand/60"
              />
            </label>
            <button
              type="button"
              onClick={connect}
              disabled={!name.trim()}
              className="px-3 py-1 text-xs font-semibold bg-brand text-white rounded disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              Connect
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <Suspense fallback={<div className="p-4 text-xs text-zinc-500">Connecting…</div>}>
            <Terminal pod={target} />
          </Suspense>
        </div>
      )}
    </div>
  )
}
