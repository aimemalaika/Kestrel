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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-3)',
          alignItems: 'center',
        }}
      >
        <input
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            padding: '4px var(--space-2)',
            borderRadius: 'var(--r-badge)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
          }}
        />
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            color: 'var(--text-muted)',
          }}
        >
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          Follow
        </label>
      </div>
      <pre
        ref={boxRef}
        style={{
          flex: 1,
          overflow: 'auto',
          margin: 0,
          fontSize: 12,
          lineHeight: 1.5,
          color: 'var(--text)',
          background: 'var(--bg)',
          padding: 'var(--space-3)',
          borderRadius: 'var(--r-badge)',
        }}
      >
        {shown.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </pre>
    </div>
  )
}
