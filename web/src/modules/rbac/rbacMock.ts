import type { AccessMatrix, Cell, RBACClient, ResourceAccess, Verb } from './RBACClient'

const ALL: Verb[] = [
  'get',
  'list',
  'watch',
  'create',
  'update',
  'patch',
  'delete',
  'deletecollection',
]

function row(group: string, resource: string, allowed: Verb[], binding: string): ResourceAccess {
  const verbs = {} as Record<Verb, Cell>
  for (const v of ALL)
    verbs[v] = allowed.includes(v) ? { allowed: true, binding } : { allowed: false }
  return { group, resource, verbs }
}

const RO: Verb[] = ['get', 'list', 'watch']
const DEPLOYERS = 'RO:deployers/deployer'

const MATRICES: Record<string, ResourceAccess[]> = {
  'production/api-gateway': [
    row('apps', 'deployments', [...RO, 'update', 'patch'], DEPLOYERS),
    row('', 'pods', RO, DEPLOYERS),
    row('', 'configmaps', RO, DEPLOYERS),
  ],
  'default/default': [row('', 'pods', RO, 'RO:read-pods/pod-reader')],
  'monitoring/prometheus': [
    row('', 'pods', RO, 'RO:metrics-read/metrics-reader'),
    row('', 'nodes', RO, 'RO:metrics-read/metrics-reader'),
  ],
}

export function createMockRbac(): RBACClient {
  return {
    async access(namespace, name) {
      const m: AccessMatrix = {
        subject: `system:serviceaccount:${namespace}:${name}`,
        resources: MATRICES[`${namespace}/${name}`] ?? [],
      }
      return m
    },
  }
}
