import type {
  Client,
  ExecSession,
  PortForwardSession,
  ResourceRef,
  Unsubscribe,
  WatchOptions,
} from './Client'
import type {
  ApiError,
  CanIRequest,
  CanIResponse,
  CatalogEntry,
  GVR,
  K8sObject,
  WatchEnvelope,
} from '../contract/types'
import { maybeRedirectUnauthorized } from '../auth/sessionRedirect'

function path(gvr: GVR, namespace?: string, name?: string, prefix = '/api'): string {
  // Per API-CONTRACT.md the frontend sends `core` literally (e.g. core/v1/pods);
  // the backend maps it to the empty group.
  const ns = namespace ? `/namespaces/${encodeURIComponent(namespace)}` : ''
  const nm = name ? `/${encodeURIComponent(name)}` : ''
  return `${prefix}/${gvr.group}/${gvr.version}${ns}/${gvr.resource}${nm}`
}

function wsUrl(p: string): string {
  const loc = globalThis.location
  const origin = loc ? loc.origin.replace(/^http/, 'ws') : ''
  return origin + p
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: Partial<ApiError> = {}
  try {
    body = (await res.json()) as Partial<ApiError>
  } catch {
    /* non-JSON body */
  }
  return {
    error: body.error ?? res.statusText ?? 'request failed',
    code: body.code ?? res.status,
    reason: body.reason ?? '',
  }
}

async function request(method: string, url: string, body?: unknown): Promise<Response> {
  // Auth is the OIDC session cookie: same-origin fetch sends it automatically.
  // No Impersonate-* headers — the backend ignores them and resolves identity
  // from the verified session only.
  const headers = new Headers()
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  const res = await fetch(url, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    maybeRedirectUnauthorized(res)
    throw await toApiError(res)
  }
  return res
}

let counter = 0

export function createHttpClient(): Client {
  return {
    async catalog() {
      return (await (await request('GET', '/api/catalog')).json()) as CatalogEntry[]
    },
    async get(ref: ResourceRef) {
      const url = path(ref, ref.namespace, ref.name)
      return (await (await request('GET', url)).json()) as K8sObject
    },
    async apply(obj, opts) {
      const url = `/api/apply${opts?.dryRun ? '?dryRun=true' : ''}`
      return (await (await request('PUT', url, obj)).json()) as K8sObject
    },
    async delete(ref, opts) {
      const url = path(ref, ref.namespace, ref.name) + (opts?.dryRun ? '?dryRun=true' : '')
      await request('DELETE', url)
    },
    async canI(req: CanIRequest) {
      return (await (await request('POST', '/api/can-i', req)).json()) as CanIResponse
    },
    watch(gvr: GVR, opts: WatchOptions, onEvent: (e: WatchEnvelope) => void): Unsubscribe {
      const es = new EventSource(path(gvr, opts.namespace, undefined, '/api/stream'))
      es.onmessage = (e: MessageEvent) => {
        try {
          onEvent(JSON.parse(e.data as string) as WatchEnvelope)
        } catch {
          onEvent({ type: 'error', message: 'malformed frame' })
        }
      }
      es.onerror = () => onEvent({ type: 'error', message: 'stream error' })
      return () => es.close()
    },
    logs(ref, onLine): Unsubscribe {
      const es = new EventSource(path(ref, ref.namespace, ref.name, '/api/logs'))
      es.onmessage = (e: MessageEvent) => onLine(e.data as string)
      return () => es.close()
    },
    exec(ref): ExecSession {
      const ws = new WebSocket(wsUrl(path(ref, ref.namespace, ref.name, '/api/exec')))
      const listeners: ((d: string) => void)[] = []
      ws.onmessage = (e: MessageEvent) => listeners.forEach((cb) => cb(String(e.data)))
      return {
        onData: (cb) => {
          listeners.push(cb)
        },
        send: (data) => ws.send(data),
        resize: (cols, rows) => ws.send(JSON.stringify({ type: 'resize', cols, rows })),
        close: () => ws.close(),
      }
    },
    portForward(ref, localPort, remotePort): PortForwardSession {
      const q = `?local=${localPort}&remote=${remotePort}`
      const ws = new WebSocket(wsUrl(path(ref, ref.namespace, ref.name, '/api/port-forward') + q))
      const session: PortForwardSession = {
        id: globalThis.crypto?.randomUUID?.() ?? `pf-${++counter}`,
        ref,
        localPort,
        remotePort,
        status: 'active',
        close: () => ws.close(),
      }
      // The server sends lifecycle status frames: {"status":"active"|"error","message"}.
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(String(e.data)) as { status?: string; message?: string }
          if (m.status === 'error') {
            session.status = 'error'
            session.error = m.message || 'port-forward failed'
          }
        } catch {
          /* ignore non-JSON frames */
        }
      }
      ws.onclose = () => {
        // Don't overwrite an error status reported just before close.
        if (session.status === 'active') session.status = 'closed'
      }
      return session
    },
  }
}
