import type { K8sObject } from '../../contract/types'
import { useResourceObject } from '../../detail/useResourceObject'
import { MatrixTable } from './MatrixTable'
import { SubjectLink } from './RoleAccess'
import { rulesToMatrix } from './rulesToMatrix'
import type { PolicyRule } from './rulesToMatrix'

interface Subject {
  kind: string
  name: string
  namespace?: string
}

const GROUP = 'rbac.authorization.k8s.io'
const CLUSTER_ROLES = { group: GROUP, version: 'v1', resource: 'clusterroles' }
const ROLES = { group: GROUP, version: 'v1', resource: 'roles' }

export function BindingAccess({ object }: { object: K8sObject }) {
  const ref = object.roleRef as { kind?: string; name?: string } | undefined
  const subjects = (object.subjects as Subject[] | undefined) ?? []
  const isCluster = ref?.kind === 'ClusterRole'
  const known = ref?.kind === 'ClusterRole' || ref?.kind === 'Role'
  const { object: role, status } = useResourceObject(
    known ? (isCluster ? CLUSTER_ROLES : ROLES) : undefined,
    isCluster ? undefined : object.metadata.namespace,
    ref?.name,
  )

  const { resources, nonResourceURLs } = rulesToMatrix(role?.rules as PolicyRule[] | undefined)

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-zinc-400 mb-1">Subjects</h3>
        {subjects.length === 0 ? (
          <p className="text-sm text-zinc-500">This binding has no subjects.</p>
        ) : (
          <ul className="space-y-0.5 text-xs">
            {subjects.map((s) => (
              <li key={`${s.kind}/${s.namespace ?? ''}/${s.name}`}>
                <SubjectLink s={s} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {!known || status === 'notfound' ? (
        <p className="text-sm text-zinc-500">Referenced role not found.</p>
      ) : status === 'error' ? (
        <p className="text-sm text-zinc-500">Could not load the referenced role.</p>
      ) : !role ? (
        <p className="text-sm text-zinc-500">Loading referenced role…</p>
      ) : resources.length === 0 && nonResourceURLs.length === 0 ? (
        <p className="text-sm text-zinc-500">The referenced role grants no permissions.</p>
      ) : (
        <>
          {resources.length > 0 && <MatrixTable rows={resources} showBindings={false} />}
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
    </div>
  )
}
