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

export interface RBACClient {
  access(namespace: string, name: string): Promise<AccessMatrix>
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
