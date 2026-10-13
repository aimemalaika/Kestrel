import { useState, useSyncExternalStore } from 'react'
import { useResourceStream } from '../table/useResourceStream'
import { getIdentity, subscribe } from '../auth/identity'
import { rbacSubjects } from '../modules/rbac/subjects'
import { SubjectMatrix } from '../modules/rbac/SubjectMatrix'
import { Card, CardHeader, ViewHeader } from '../ui'

const RB = { group: 'rbac.authorization.k8s.io', version: 'v1', resource: 'rolebindings' }
const CRB = { group: 'rbac.authorization.k8s.io', version: 'v1', resource: 'clusterrolebindings' }

// Shared master-detail body for the RBAC-derived Users / Groups views.
export function SubjectsBrowser({ kind }: { kind: 'User' | 'Group' }) {
  const plural = kind === 'User' ? 'Users' : 'Groups'
  const rbs = useResourceStream(RB, undefined)
  const crbs = useResourceStream(CRB, undefined)
  const identity = useSyncExternalStore(subscribe, getIdentity, getIdentity)
  const [selected, setSelected] = useState<string | undefined>()

  const loading = rbs.status === 'loading' || crbs.status === 'loading'
  // A stream error (e.g. the caller can't list ClusterRoleBindings) means the
  // list is PARTIAL — never claim "none" in that case.
  const partial = rbs.status === 'error' || crbs.status === 'error'
  const subjects = rbacSubjects(rbs.rows, crbs.rows, kind)
  const sel = subjects.find((s) => s.name === selected)
  const marker = (name: string) =>
    kind === 'User'
      ? identity?.name === name
        ? '(you)'
        : ''
      : identity?.groups?.includes(name)
        ? '(your group)'
        : ''

  return (
    <div>
      <ViewHeader title={plural} count={subjects.length} />
      <p className="text-xs text-zinc-500 mb-4">
        {plural} referenced in RBAC bindings — not every identity that can authenticate; those live
        in your IdP.
      </p>
      {partial && subjects.length > 0 && (
        <p className="text-xs text-amber-400 mb-4" role="status">
          Some RBAC bindings couldn&apos;t be listed — this view may be incomplete.
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader title={plural} />
          {loading ? (
            <p className="p-5 text-sm text-zinc-500">Loading…</p>
          ) : subjects.length === 0 ? (
            <p className="p-5 text-sm text-zinc-500">
              {partial
                ? "Couldn't list all RBAC bindings — this view may be incomplete."
                : `No ${plural.toLowerCase()} referenced in RBAC bindings.`}
            </p>
          ) : (
            <ul aria-label={plural}>
              {subjects.map((s) => (
                <li key={s.name}>
                  <button
                    type="button"
                    onClick={() => setSelected(s.name)}
                    aria-pressed={s.name === selected}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-left text-sm border-b border-zinc-800/50 hover:bg-zinc-800/40 ${
                      s.name === selected ? 'bg-zinc-800/60 text-zinc-100' : 'text-zinc-300'
                    }`}
                  >
                    <span className="font-mono break-all">
                      {s.name}
                      {marker(s.name) && (
                        <span className="ml-2 text-xs text-red-400">{marker(s.name)}</span>
                      )}
                    </span>
                    <span className="text-xs text-zinc-500 shrink-0">
                      {s.bindings.length} {s.bindings.length === 1 ? 'binding' : 'bindings'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="lg:col-span-2">
          {sel ? (
            <div className="space-y-4">
              <Card>
                <CardHeader title="Bound by" />
                <ul className="p-4 space-y-1 text-sm">
                  {sel.bindings.map((b) => (
                    <li key={`${b.namespace ?? ''}/${b.name}`} className="text-zinc-300">
                      <span className="font-mono">{b.name}</span>
                      <span className="text-zinc-500">
                        {' '}
                        → {b.role}
                        {b.namespace ? ` (${b.namespace})` : ' (cluster-wide)'}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader title="Access" />
                <div className="p-4">
                  <SubjectMatrix subject={{ kind, name: sel.name }} />
                </div>
              </Card>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              Select a {kind.toLowerCase()} to see its access.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
