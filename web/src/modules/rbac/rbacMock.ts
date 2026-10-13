import type {
  AccessMatrix,
  Cell,
  NamespaceAccess,
  RBACClient,
  ResourceAccess,
  Verb,
} from './RBACClient'

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

const scope = (namespace: string, resources: ResourceAccess[]): NamespaceAccess => ({
  namespace,
  resources,
})

const MATRICES: Record<string, NamespaceAccess[]> = {
  'production/api-gateway': [
    scope('production', [
      row('apps', 'deployments', [...RO, 'update', 'patch'], DEPLOYERS),
      row('', 'pods', RO, DEPLOYERS),
      row('', 'configmaps', RO, DEPLOYERS),
    ]),
  ],
  'User/alice': [
    scope('', [
      row('', 'pods', RO, 'RO:alice-pods/pod-reader'),
      row('', 'configmaps', ['get', 'list'], 'RO:alice-pods/pod-reader'),
    ]),
  ],
  'User/carol': [
    scope('', [row('', 'pods', ['get'], 'CR:view/view')]),
    scope('production', [row('apps', 'deployments', [...RO, 'update'], 'RO:prod-dev/edit')]),
    scope('staging', [row('', 'configmaps', RO, 'RO:stg-dev/edit')]),
  ],
  'Group/platform-admins': [
    scope('', [
      row('apps', 'deployments', ALL, 'CR:platform-admins/admin'),
      row('', 'pods', ALL, 'CR:platform-admins/admin'),
      row('', 'nodes', RO, 'CR:platform-admins/admin'),
    ]),
  ],
  'default/default': [scope('default', [row('', 'pods', RO, 'RO:read-pods/pod-reader')])],
  'monitoring/prometheus': [
    scope('monitoring', [
      row('', 'pods', RO, 'RO:metrics-read/metrics-reader'),
      row('', 'nodes', RO, 'RO:metrics-read/metrics-reader'),
    ]),
  ],
}

export function createMockRbac(): RBACClient {
  return {
    async access({ kind, name, namespace }) {
      if (kind === 'ServiceAccount') {
        const m: AccessMatrix = {
          subject: `system:serviceaccount:${namespace ?? ''}:${name}`,
          scopes: MATRICES[`${namespace ?? ''}/${name}`] ?? [],
        }
        return m
      }
      const m: AccessMatrix = { subject: name, scopes: MATRICES[`${kind}/${name}`] ?? [] }
      return m
    },
  }
}
