import { useEffect, useState } from 'react'
import { createClient } from '../client/createClient'
import type { GVR, K8sObject, WatchEnvelope } from '../contract/types'

export type StreamStatus = 'loading' | 'ready' | 'error'

function keyOf(o: K8sObject): string {
  return o.metadata.uid ?? `${o.metadata.namespace ?? ''}/${o.metadata.name}`
}

export function useResourceStream(
  gvr: GVR | undefined,
  namespace: string | undefined,
): { rows: K8sObject[]; status: StreamStatus } {
  const [rows, setRows] = useState<K8sObject[]>([])
  const [status, setStatus] = useState<StreamStatus>('loading')

  useEffect(() => {
    if (!gvr) {
      setRows([])
      setStatus('ready')
      return
    }
    let active = true
    const store = new Map<string, K8sObject>()
    setStatus('loading')
    setRows([])

    const flush = () => {
      let vals = Array.from(store.values())
      if (namespace) {
        vals = vals.filter((o) => !o.metadata.namespace || o.metadata.namespace === namespace)
      }
      setRows(vals)
    }

    let stop: (() => void) | undefined
    const onEvent = (e: WatchEnvelope) => {
      if (!active) return
      switch (e.type) {
        case 'added':
        case 'modified':
          store.set(keyOf(e.object), e.object)
          flush()
          setStatus('ready')
          break
        case 'deleted':
          store.delete(keyOf(e.object))
          flush()
          setStatus('ready')
          break
        case 'error':
          store.clear()
          flush()
          setStatus('loading')
          stop?.()
          stop = createClient().watch(gvr, { namespace }, onEvent)
          break
        case 'bookmark':
          break
      }
    }

    stop = createClient().watch(gvr, { namespace }, onEvent)
    setStatus('ready')
    return () => {
      active = false
      stop?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are GVR's primitive fields (group/version/resource) so an inline gvr object doesn't force a resubscribe each render; GVR has exactly those fields
  }, [gvr?.group, gvr?.version, gvr?.resource, namespace])

  return { rows, status }
}
