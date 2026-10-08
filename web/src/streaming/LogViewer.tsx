import { useEffect, useRef, useState } from 'react'
import { createClient } from '../client/createClient'
import type { ResourceRef } from '../client/Client'

export function LogViewer({ pod }: { pod: ResourceRef }) {
  const [lines, setLines] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [follow, setFollow] = useState(true)
  const boxRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    setLines([])
    const stop = createClient().logs(pod, (line) => setLines((prev) => [...prev.slice(-999), line]))
    return stop
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are pod's primitive fields; avoids resubscribing on a new pod object identity
  }, [pod.namespace, pod.name, pod.resource])

  const shown = filter ? lines.filter((l) => l.includes(filter)) : lines

  useEffect(() => {
    if (follow && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [shown, follow])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-3">
        <input
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="text-xs bg-[#0d1117] text-zinc-200 placeholder-zinc-600 border border-zinc-700 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-zinc-500"
        />
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            className="accent-red-500"
            checked={follow}
            onChange={(e) => setFollow(e.target.checked)}
          />
          Follow
        </label>
      </div>
      <pre
        ref={boxRef}
        className="flex-1 overflow-auto m-0 font-mono text-xs leading-relaxed text-[#b0c4de] bg-[#0d1117] border border-zinc-800 rounded-md p-3"
      >
        {shown.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </pre>
    </div>
  )
}
