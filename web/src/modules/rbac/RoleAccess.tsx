import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { K8sObject } from '../../contract/types'
import { useResourceStream } from '../../table/useResourceStream'
import { MatrixTable } from './MatrixTable'
import { rulesToMatrix } from './rulesToMatrix'
import type { PolicyRule } from './rulesToMatrix'

interface Subject {
  kind: string
  name: string
  namespace?: string
}

const RB = { group: 'rbac.authorization.k8s.io', version: 'v1', resource: 'rolebindings' }
const CRB = { group: 'rbac.authorization.k8s.io', version: 'v1', resource: 'clusterrolebindings' }

export function SubjectLink({ s }: { s: Subject }) {
  const label = `${s.kind}/${s.namespace ? `${s.namespace}/` : ''}${s.name}`
  if (s.kind === 'ServiceAccount' && s.namespace) {
    return (
      <Link
        to={`/ns/${s.namespace}/core/v1/serviceaccounts/${s.name}`}
        className="font-mono text-brand-fg hover:underline"
      >
        {label}
      </Link>
    )
  }
  return <span className="font-mono text-zinc-300">{label}</span>
}

export function RoleAccess({ object }: { object: K8sObject }) {
  const [filter, setFilter] = useState('')
  const { resources, nonResourceURLs } = rulesToMatrix(object.rules as PolicyRule[] | undefined)
  const rbs = useResourceStream(RB, undefined)
  const crbs = useResourceStream(CRB, undefined)

  const roleNs = object.metadata.namespace
  const bound = [...rbs.rows, ...crbs.rows].filter((b) => {
    const ref = b.roleRef as { kind?: string; name?: string } | undefined
    if (!ref || ref.kind !== object.kind || ref.name !== object.metadata.name) return false
    return object.kind === 'Role' ? b.metadata.namespace === roleNs : true
  })

  const bindingsLoading = rbs.status === 'loading' || crbs.status === 'loading'
  const bindingsError = !bindingsLoading && (rbs.status === 'error' || crbs.status === 'error')

  const f = filter.trim().toLowerCase()
  const rows = resources.filter((r) => `${r.group}/${r.resource}`.toLowerCase().includes(f))

  return (
    <div className="space-y-4">
      {resources.length === 0 && nonResourceURLs.length === 0 ? (
        <p className="text-sm text-zinc-500">This role grants no permissions.</p>
      ) : (
        <>
          {resources.length > 0 && (
            <>
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter resources…"
                aria-label="Filter resources"
                className="w-full rounded bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600"
              />
              <MatrixTable rows={rows} showBindings={false} />
            </>
          )}
          {nonResourceURLs.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-400 mb-1">Non-resource URLs</h3>
              <ul className="text-xs font-mono text-zinc-300 space-y-0.5">
                {nonResourceURLs.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <div>
        <h3 className="text-xs font-semibold text-zinc-400 mb-1">Bound by</h3>
        {bound.length === 0 && bindingsLoading ? (
          <p className="text-sm text-zinc-500">Loading bindings…</p>
        ) : bound.length === 0 && bindingsError ? (
          <p className="text-sm text-zinc-500">Couldn't load bindings.</p>
        ) : bound.length === 0 ? (
          <p className="text-sm text-zinc-500">No bindings reference this role.</p>
        ) : (
          <ul className="space-y-2 text-xs">
            {bound.map((b) => (
              <li key={b.metadata.uid ?? `${b.metadata.namespace ?? ''}/${b.metadata.name}`}>
                <div className="font-mono text-zinc-200">
                  <span>{b.metadata.name}</span>
                  {b.metadata.namespace && (
                    <span className="text-zinc-500"> ({b.metadata.namespace})</span>
                  )}
                </div>
                <ul className="pl-3 space-y-0.5">
                  {((b.subjects as Subject[] | undefined) ?? []).map((s) => (
                    <li key={`${s.kind}/${s.namespace ?? ''}/${s.name}`}>
                      <SubjectLink s={s} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
