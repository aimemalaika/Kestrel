import { useState } from 'react'
import { useSessions } from './SessionsProvider'
import { PrimaryBtn } from '../ui'
import type { ResourceRef } from '../client/Client'

// Prop is named `target` (not `ref`): React 18 reserves `ref` and would not pass it through.
export function PortForwardButton({ target }: { target: ResourceRef }) {
  const { start } = useSessions()
  const [local, setLocal] = useState('8080')
  const [remote, setRemote] = useState('80')
  const inputCls =
    'w-16 text-xs font-mono bg-[#0d1117] text-zinc-200 border border-zinc-700 rounded-md px-2 py-1.5 focus:outline-none focus:border-zinc-500'
  return (
    <div className="flex items-center gap-2">
      <input
        aria-label="local port"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        className={inputCls}
      />
      <span className="text-zinc-500">→</span>
      <input
        aria-label="remote port"
        value={remote}
        onChange={(e) => setRemote(e.target.value)}
        className={inputCls}
      />
      <PrimaryBtn onClick={() => start(target, Number(local), Number(remote))}>
        Forward port
      </PrimaryBtn>
    </div>
  )
}
