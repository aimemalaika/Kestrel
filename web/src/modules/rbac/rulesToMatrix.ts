import { VERBS } from './RBACClient'
import type { ResourceAccess, Verb } from './RBACClient'

export interface PolicyRule {
  apiGroups?: string[]
  resources?: string[]
  verbs?: string[]
  resourceNames?: string[]
  nonResourceURLs?: string[]
}

const emptyVerbs = (): ResourceAccess['verbs'] =>
  Object.fromEntries(VERBS.map((v) => [v, { allowed: false }])) as ResourceAccess['verbs']

export function rulesToMatrix(rules: PolicyRule[] | undefined): {
  resources: ResourceAccess[]
  nonResourceURLs: string[]
} {
  const rows = new Map<string, ResourceAccess>()
  const urls = new Set<string>()
  for (const rule of rules ?? []) {
    for (const u of rule.nonResourceURLs ?? []) urls.add(u)
    const verbs: Verb[] = (rule.verbs ?? []).includes('*')
      ? VERBS
      : VERBS.filter((v) => (rule.verbs ?? []).includes(v))
    for (const group of rule.apiGroups ?? []) {
      for (const resource of rule.resources ?? []) {
        const key = `${group}/${resource}`
        let row = rows.get(key)
        if (!row) {
          row = { group, resource, verbs: emptyVerbs() }
          rows.set(key, row)
        }
        const names = rule.resourceNames?.length ? rule.resourceNames : undefined
        for (const v of verbs) {
          const prev = row.verbs[v]
          if (!prev.allowed) {
            row.verbs[v] = names
              ? { allowed: true, resourceNames: [...new Set(names)] }
              : { allowed: true }
          } else if (!names) {
            row.verbs[v] = { allowed: true } // an unrestricted grant wins
          } else if (prev.resourceNames) {
            row.verbs[v] = {
              allowed: true,
              resourceNames: [...new Set([...prev.resourceNames, ...names])],
            }
          }
        }
      }
    }
  }
  const resources = [...rows.values()].sort((a, b) =>
    `${a.group}/${a.resource}`.localeCompare(`${b.group}/${b.resource}`),
  )
  return { resources, nonResourceURLs: [...urls].sort() }
}
