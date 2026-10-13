import { useEffect, useState } from 'react'
import type { K8sObject } from '../../contract/types'
import { createRbacClient, VERBS } from './RBACClient'
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
          <div className="overflow-x-auto">
            <table className="w-full text-xs" aria-label="Access matrix">
              <thead>
                <tr className="border-b border-zinc-800/60 text-zinc-500">
                  <th scope="col" className="py-2 pr-3 text-left font-semibold">
                    Resource
                  </th>
                  {VERBS.map((v) => (
                    <th key={v} scope="col" className="px-1.5 py-2 text-center font-semibold">
                      {v}
                    </th>
                  ))}
                  <th scope="col" className="py-2 pl-3 text-left font-semibold">
                    Granted by
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {rows.map((r) => {
                  const key = `${r.group}/${r.resource}`
                  const bindings = [
                    ...new Set(
                      VERBS.map((v) => r.verbs[v]?.binding).filter((b): b is string => !!b),
                    ),
                  ]
                  return (
                    <tr key={key}>
                      <td className="py-2 pr-3 font-mono text-zinc-200">{key}</td>
                      {VERBS.map((v) => {
                        const c = r.verbs[v]
                        return c?.allowed ? (
                          <td
                            key={v}
                            className="px-1.5 py-2 text-center text-emerald-400"
                            title={c.binding}
                            aria-label={`${v} allowed`}
                          >
                            ✓
                          </td>
                        ) : (
                          <td
                            key={v}
                            className="px-1.5 py-2 text-center text-zinc-600"
                            aria-label={`${v} denied`}
                          >
                            ✗
                          </td>
                        )
                      })}
                      <td className="py-2 pl-3 font-mono text-zinc-400">{bindings.join(', ')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
