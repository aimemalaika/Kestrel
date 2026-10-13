import { useEffect, useState } from 'react'
import { createRbacClient } from './RBACClient'
import { MatrixTable } from './MatrixTable'
import type { AccessMatrix as Matrix, RBACClient, SubjectRef } from './RBACClient'

export function SubjectMatrix({ subject, client }: { subject: SubjectRef; client?: RBACClient }) {
  const { kind, name, namespace } = subject
  const [matrix, setMatrix] = useState<Matrix | undefined>()
  const [error, setError] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    setMatrix(undefined)
    setError(false)
    ;(client ?? createRbacClient())
      .access({ kind, name, namespace })
      .then((m) => {
        if (!cancelled) setMatrix(m)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [client, kind, name, namespace])

  if (error)
    return (
      <p className="text-sm text-zinc-500">
        No permissions found, or you&apos;re not permitted to view them
      </p>
    )
  if (!matrix) return <p className="text-sm text-zinc-500">Loading…</p>

  const f = filter.trim().toLowerCase()
  const visible = matrix.scopes
    .map((sc) => ({
      namespace: sc.namespace,
      rows: sc.resources.filter((r) => `${r.group}/${r.resource}`.toLowerCase().includes(f)),
    }))
    .filter((sc) => sc.rows.length > 0)

  return (
    <div className="space-y-3">
      <div className="text-xs text-zinc-400">
        Subject: <span className="font-mono text-zinc-200">{matrix.subject}</span>
      </div>
      <p className="text-[11px] text-zinc-600">
        Permissions are SubjectAccessReview-confirmed per namespace and grouped by namespace or
        cluster-wide.{' '}
        {kind === 'User' && 'Access via group membership is shown under the respective Group.'}
      </p>
      {matrix.truncated && (
        <p className="text-xs text-amber-400">
          Results were truncated — this subject&apos;s access may be larger.
        </p>
      )}
      {matrix.scopes.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No permissions found, or you&apos;re not permitted to view them
        </p>
      ) : (
        <>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter resources…"
            aria-label="Filter resources"
            className="w-full rounded bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600"
          />
          {visible.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No permissions found, or you&apos;re not permitted to view them
            </p>
          ) : (
            visible.map((sc) => (
              <section key={sc.namespace} className="space-y-1.5">
                <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  {sc.namespace === '' ? (
                    'Cluster-wide'
                  ) : (
                    <>
                      Namespace: <span className="font-mono normal-case">{sc.namespace}</span>
                    </>
                  )}
                </h3>
                <MatrixTable rows={sc.rows} showBindings />
              </section>
            ))
          )}
        </>
      )}
    </div>
  )
}
