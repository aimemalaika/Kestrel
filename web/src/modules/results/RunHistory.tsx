import { useEffect, useMemo, useState } from 'react'
import { createResultsClient, type ResultsClient, type RunSummary } from './ResultsClient'
import { EmptyState, Mono, StatusBadge, TD, TR, Table, ViewHeader } from '../../ui'
import { durationStr } from '../tekton/model'
import type { ApiError } from '../../contract/types'

function started(t?: string): string {
  if (!t) return '—'
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? t : d.toLocaleString()
}

export function RunHistory({ client: injected }: { client?: ResultsClient }) {
  const client = useMemo(() => injected ?? createResultsClient(), [injected])
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [error, setError] = useState<ApiError | null>(null)
  const [selected, setSelected] = useState<RunSummary | null>(null)
  const [log, setLog] = useState<string | null>(null)
  const [logError, setLogError] = useState(false)

  useEffect(() => {
    let active = true
    client
      .listRuns()
      .then((r) => {
        if (!active) return
        setError(null)
        setRuns(r)
      })
      .catch((e) => active && setError(e as ApiError))
    return () => {
      active = false
    }
  }, [client])

  useEffect(() => {
    if (!selected) return
    let active = true
    client
      .getLog(selected.recordName)
      .then((t) => {
        if (!active) return
        setLogError(false)
        setLog(t)
      })
      .catch(() => {
        if (!active) return
        setLogError(true)
        setLog(null)
      })
    return () => {
      active = false
    }
  }, [client, selected])

  const select = (r: RunSummary) => {
    setLog(null)
    setLogError(false)
    setSelected(r)
  }

  return (
    <section className="p-6 text-zinc-200">
      <ViewHeader title="Run History" count={runs.length} />
      {error ? (
        error.code === 503 ? (
          <EmptyState
            icon="run"
            title="Results not configured (set --results-url)"
            hint="Set --results-url to browse archived runs from Tekton Results."
          />
        ) : (
          <EmptyState
            icon="run"
            title="Could not reach Tekton Results"
            hint="Check the Results URL and that the backend can reach it."
          />
        )
      ) : (
        <>
          <Table
            aria-label="Run history"
            headers={['Name', 'Namespace', 'Kind', 'Status', 'Started', 'Duration']}
          >
            {runs.map((r) => (
              <TR key={r.uid}>
                <TD>
                  <button
                    type="button"
                    onClick={() => select(r)}
                    className="bg-transparent border-0 p-0 cursor-pointer hover:underline"
                  >
                    <Mono>{r.name}</Mono>
                  </button>
                </TD>
                <TD>{r.namespace}</TD>
                <TD>{r.kind}</TD>
                <TD>
                  <StatusBadge status={r.status} />
                </TD>
                <TD>{started(r.startTime)}</TD>
                <TD>{durationStr(r.startTime, r.completionTime) ?? '—'}</TD>
              </TR>
            ))}
          </Table>
          {selected && (
            <div className="mt-6" data-testid="run-detail">
              <h2 className="text-sm font-semibold mb-2">
                {selected.kind} <Mono>{selected.name}</Mono>
              </h2>
              <p className="text-xs text-zinc-500 mb-3">
                {selected.namespace} · {selected.status} ·{' '}
                {durationStr(selected.startTime, selected.completionTime) ?? '—'}
              </p>
              {logError ? (
                <p className="text-xs text-zinc-500">No archived log available for this run.</p>
              ) : (
                <pre
                  aria-label="Archived log"
                  className="bg-zinc-950 border border-zinc-800 rounded p-3 text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap"
                >
                  {log ?? 'Loading…'}
                </pre>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
