import { useEffect, useState } from 'react'
import { createResultsClient } from '../results/ResultsClient'

// Tekton Results stores logs per-TaskRun (the whole pod), so this shows the
// TaskRun's archived log, not a per-step log. It is a static blob, not SSE.
export function ArchivedLog({ record }: { record: string }) {
  const [state, setState] = useState<{ text?: string; error?: string }>({})

  useEffect(() => {
    let cancelled = false
    createResultsClient()
      .getLog(record)
      .then((text) => !cancelled && setState({ text }))
      .catch(
        (e: unknown) =>
          !cancelled && setState({ error: e instanceof Error ? e.message : String(e) }),
      )
    return () => {
      cancelled = true
    }
  }, [record])

  if (state.error)
    return <p className="mt-2 text-xs text-red-400">archived log failed: {state.error}</p>
  if (state.text === undefined)
    return <p className="mt-2 text-xs text-zinc-500">loading archived log…</p>
  return (
    <pre
      data-testid="archived-log"
      className="mt-2 h-64 overflow-auto rounded border border-zinc-700 bg-zinc-950 p-2 text-xs text-zinc-200"
    >
      {state.text}
    </pre>
  )
}
