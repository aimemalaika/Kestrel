import { useEffect, useState } from 'react'
import { createClient } from '../client/createClient'
import type { GVR, K8sObject, WatchEnvelope } from '../contract/types'

export type StreamStatus = 'loading' | 'ready' | 'error'

// Backoff policy (constants, not runtime config).
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 30000
const MAX_ATTEMPTS = 6

function keyOf(o: K8sObject): string {
  return o.metadata.uid ?? `${o.metadata.namespace ?? ''}/${o.metadata.name}`
}

// A 404 means the resource type doesn't exist on this cluster — retrying can
// never succeed, so it's terminal immediately.
function isFatal(code: number | undefined): boolean {
  return code === 404
}

function backoffDelay(attempt: number): number {
  const base = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt)
  return base + Math.random() * base * 0.2 // up to 20% jitter
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
    let attempt = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let stop: (() => void) | undefined
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

    const onEvent = (e: WatchEnvelope) => {
      if (!active) return
      switch (e.type) {
        case 'added':
        case 'modified':
          attempt = 0 // success resets backoff
          store.set(keyOf(e.object), e.object)
          flush()
          setStatus('ready')
          break
        case 'deleted':
          attempt = 0
          store.delete(keyOf(e.object))
          flush()
          setStatus('ready')
          break
        case 'error':
          store.clear()
          flush()
          stop?.()
          stop = undefined
          attempt += 1
          if (isFatal(e.code) || attempt >= MAX_ATTEMPTS) {
            setStatus('error') // terminal: stop retrying
            return
          }
          setStatus('loading')
          timer = setTimeout(
            () => {
              if (!active) return
              stop = createClient().watch(gvr, { namespace }, onEvent)
            },
            backoffDelay(attempt - 1),
          )
          break
        case 'bookmark':
          break
      }
    }

    stop = createClient().watch(gvr, { namespace }, onEvent)
    setStatus('ready')
    return () => {
      active = false
      if (timer) clearTimeout(timer)
      stop?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are GVR's primitive fields (group/version/resource) so an inline gvr object doesn't force a resubscribe each render; GVR has exactly those fields
  }, [gvr?.group, gvr?.version, gvr?.resource, namespace])

  return { rows, status }
}
