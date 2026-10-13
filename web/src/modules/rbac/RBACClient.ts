import { createMockRbac } from './rbacMock'
import { createHttpRbac } from './httpRbac'

export type Verb =
  'get' | 'list' | 'watch' | 'create' | 'update' | 'patch' | 'delete' | 'deletecollection'

export const VERBS: Verb[] = [
  'get',
  'list',
  'watch',
  'create',
  'update',
  'patch',
  'delete',
  'deletecollection',
]

export interface Cell {
  allowed: boolean
  binding?: string
  /** Set only when every granting rule restricts this verb to named resources. */
  resourceNames?: string[]
}

export interface ResourceAccess {
  group: string
  resource: string
  verbs: Record<Verb, Cell>
}

export interface AccessMatrix {
  subject: string
  resources: ResourceAccess[]
}

export interface SubjectRef {
  kind: 'ServiceAccount' | 'User' | 'Group'
  name: string
  /** Required for ServiceAccount only. */
  namespace?: string
}

export interface RBACClient {
  access(subject: SubjectRef): Promise<AccessMatrix>
}

let shared: RBACClient | undefined

export function createRbacClient(): RBACClient {
  const impl =
    (import.meta.env.VITE_RBAC as string | undefined) ??
    (import.meta.env.VITE_CLIENT as string | undefined) ??
    'http'
  if (impl !== 'mock' && impl !== 'http') throw new Error(`Unknown rbac client: ${impl}`)
  shared ??= impl === 'mock' ? createMockRbac() : createHttpRbac()
  return shared
}
