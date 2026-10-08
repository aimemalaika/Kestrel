import type { CatalogEntry, GVR, K8sObject, WatchEnvelope } from '../contract/types'
import type { Client, ResourceRef, Unsubscribe, WatchOptions } from './Client'

const CATALOG: CatalogEntry[] = [
  {
    group: 'core',
    version: 'v1',
    resource: 'pods',
    kind: 'Pod',
    namespaced: true,
    verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'],
  },
  {
    group: 'apps',
    version: 'v1',
    resource: 'deployments',
    kind: 'Deployment',
    namespaced: true,
    verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'],
  },
]

function pod(name: string, ns: string, phase: string): K8sObject {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name,
      namespace: ns,
      uid: `${ns}/${name}`,
      creationTimestamp: new Date().toISOString(),
    },
    status: { phase },
  }
}

export function createMockClient(opts: { tickMs?: number } = {}): Client {
  const tickMs = opts.tickMs ?? 2000
  const store = new Map<string, K8sObject>([
    ['default/web-1', pod('web-1', 'default', 'Running')],
    ['default/web-2', pod('web-2', 'default', 'Pending')],
  ])
  let counter = 0

  return {
    async catalog() {
      return CATALOG
    },
    async get(ref: ResourceRef) {
      const o = store.get(`${ref.namespace}/${ref.name}`)
      if (!o)
        throw { error: `${ref.resource} "${ref.name}" not found`, code: 404, reason: 'NotFound' }
      return o
    },
    async apply(obj: K8sObject) {
      const key = `${obj.metadata.namespace}/${obj.metadata.name}`
      store.set(key, obj)
      return obj
    },
    async delete(ref: ResourceRef) {
      store.delete(`${ref.namespace}/${ref.name}`)
    },
    canI: async () => ({ allowed: true }),
    logs(_ref: ResourceRef, onLine: (line: string) => void): Unsubscribe {
      const id = setInterval(() => onLine(`log line ${++counter}`), tickMs)
      return () => clearInterval(id)
    },
    watch(_gvr: GVR, _opts: WatchOptions, onEvent: (e: WatchEnvelope) => void): Unsubscribe {
      for (const object of store.values()) onEvent({ type: 'added', object })
      const id = setInterval(() => {
        const o = store.get('default/web-2')
        if (!o) return
        const next: K8sObject = {
          ...o,
          status: { phase: o.status?.phase === 'Running' ? 'Pending' : 'Running' },
        }
        store.set('default/web-2', next)
        onEvent({ type: 'modified', object: next })
      }, tickMs)
      return () => clearInterval(id)
    },
  }
}
