import type { K8sObject } from '../../contract/types'

export type SubjectBinding = { name: string; namespace?: string; role: string }
export type RbacSubject = { name: string; bindings: SubjectBinding[] }

type RawSubject = { kind?: string; name?: string }

// Distinct User/Group subjects referenced by RoleBindings and
// ClusterRoleBindings, with the bindings that reference each. Sorted by name.
export function rbacSubjects(
  roleBindings: K8sObject[],
  clusterRoleBindings: K8sObject[],
  kind: 'User' | 'Group',
): RbacSubject[] {
  const byName = new Map<string, SubjectBinding[]>()
  for (const b of [...roleBindings, ...clusterRoleBindings]) {
    const o = b as unknown as { subjects?: RawSubject[]; roleRef?: { name?: string } }
    const seen = new Set<string>()
    for (const s of o.subjects ?? []) {
      if (s.kind !== kind || !s.name || seen.has(s.name)) continue
      seen.add(s.name)
      const list = byName.get(s.name) ?? []
      list.push({
        name: b.metadata.name,
        namespace: b.metadata.namespace,
        role: o.roleRef?.name ?? '',
      })
      byName.set(s.name, list)
    }
  }
  return [...byName.entries()]
    .map(([name, bindings]) => ({ name, bindings }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
