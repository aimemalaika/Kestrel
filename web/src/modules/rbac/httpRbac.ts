import { getJSON, q } from '../moduleFetch'
import type { AccessMatrix, RBACClient } from './RBACClient'

export function createHttpRbac(): RBACClient {
  return {
    access(namespace, name) {
      return getJSON<AccessMatrix>(`/api/rbac/access?namespace=${q(namespace)}&name=${q(name)}`)
    },
  }
}
