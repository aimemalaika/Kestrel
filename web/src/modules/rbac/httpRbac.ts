import { getJSON, q } from '../moduleFetch'
import type { AccessMatrix, RBACClient } from './RBACClient'

export function createHttpRbac(): RBACClient {
  return {
    access({ kind, name, namespace }) {
      const ns = kind === 'ServiceAccount' && namespace ? `&namespace=${q(namespace)}` : ''
      return getJSON<AccessMatrix>(`/api/rbac/access?kind=${q(kind)}&name=${q(name)}${ns}`)
    },
  }
}
