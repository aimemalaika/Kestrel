import { useEffect, useState } from 'react'
import type { K8sObject } from '../../contract/types'
import { createRbacClient } from './RBACClient'
import { MatrixTable } from './MatrixTable'
import type { AccessMatrix as Matrix, RBACClient } from './RBACClient'

export function AccessMatrix({ object, client }: { object: K8sObject; client?: RBACClient }) {
  const ns = object.metadata.namespace ?? ''
  const name = object.metadata.name
  const [matrix, setMatrix] = useState<Matrix | undefined>()
  const [error, setError] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    setMatrix(undefined)
    setError(false)
    ;(client ?? createRbacClient())
      .access(ns, name)
      .then((m) => {
        if (!cancelled) setMatrix(m)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [client, ns, name])

  if (error)
    return (
      <p className="text-sm text-zinc-500">
        No permissions found, or you&apos;re not permitted to view them
      </p>
    )
  if (!matrix) return <p className="text-sm text-zinc-500">Loading…</p>

  const f = filter.trim().toLowerCase()
  const rows = matrix.resources.filter((r) => `${r.group}/${r.resource}`.toLowerCase().includes(f))

  return (
    <div className="space-y-3">
      <div className="text-xs text-zinc-400">
        Subject: <span className="font-mono text-zinc-200">{matrix.subject}</span>
      </div>
      <p className="text-[11px] text-zinc-600">
        Effective permissions in this ServiceAccount&apos;s namespace and cluster-wide
        (SubjectAccessReview-confirmed). RoleBindings in other namespaces are not shown.
      </p>
      {matrix.resources.length === 0 ? (
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
          <MatrixTable rows={rows} showBindings />
        </>
      )}
    </div>
  )
}
