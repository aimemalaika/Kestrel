import type {
  Client,
  ClusterInfo,
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
import type { AuthInfo } from '../auth/authInfo'
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
    async clusterInfo() {
      return (await (await request('GET', '/api/cluster-info')).json()) as ClusterInfo
    },
    async authInfo() {
      // /authinfo is unauthenticated and NOT under /api, so it bypasses request()
      // (no maybeRedirectUnauthorized): a non-200 simply means "treat as needs-login".
      try {
        const res = await fetch('/authinfo', { credentials: 'same-origin' })
        if (!res.ok) return { mode: 'oidc', user: null, options: [] } as AuthInfo
        return (await res.json()) as AuthInfo
      } catch {
        return { mode: 'oidc', user: null, options: [] } as AuthInfo
      }
    },
    async passwordLogin(username: string, password: string) {
      // ROPC relay. /auth/password is NOT under /api, so this bypasses request()
      // (a 401 here means "bad credentials", shown inline — not a session redirect).
      // Credentials go in the URL-encoded body only, never the URL.
      const body = new URLSearchParams({ username, password })
      const res = await fetch('/auth/password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })
      if (!res.ok) throw await toApiError(res)
    },
    kubeconfigUrl() {
      return '/api/kubeconfig'
    },
    async loginCommand() {
      return (await (await request('GET', '/api/kubeconfig/command')).json()) as {
        command: string
      }
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
    logs(ref, onLine, opts): Unsubscribe {
      const q = opts?.container ? `?container=${encodeURIComponent(opts.container)}` : ''
      const es = new EventSource(path(ref, ref.namespace, ref.name, '/api/logs') + q)
      es.onmessage = (e: MessageEvent) => onLine(e.data as string)
      return () => es.close()
    },
    exec(ref): ExecSession {
      const ws = new WebSocket(wsUrl(path(ref, ref.namespace, ref.name, '/api/exec')))
      const listeners: ((d: string) => void)[] = []
      const pending: string[] = []
      const sendFrame = (frame: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(frame)
        } else if (ws.readyState === WebSocket.CONNECTING) {
          pending.push(frame) // flush on open
        }
        // CLOSING/CLOSED: drop — the session is gone.
      }
      ws.onopen = () => {
        for (const frame of pending.splice(0)) ws.send(frame)
      }
      ws.onmessage = (e: MessageEvent) => listeners.forEach((cb) => cb(String(e.data)))
      return {
        onData: (cb) => {
          listeners.push(cb)
        },
        send: (data) => sendFrame(data),
        resize: (cols, rows) => sendFrame(JSON.stringify({ type: 'resize', cols, rows })),
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
