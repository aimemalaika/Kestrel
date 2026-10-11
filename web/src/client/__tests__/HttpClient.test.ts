import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHttpClient } from '../HttpClient'
import { setIdentity, IDENTITY_PRESETS } from '../../auth/identity'
import { LOGIN_PATH, __resetSessionRedirect } from '../../auth/sessionRedirect'

class FakeES {
  static last: FakeES
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn()
  constructor(public url: string) {
    FakeES.last = this
  }
}
class FakeWS {
  static last: FakeWS
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  send = vi.fn()
  close = vi.fn()
  constructor(public url: string) {
    FakeWS.last = this
  }
}

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const ref = { group: 'core', version: 'v1', resource: 'pods', namespace: 'default', name: 'p1' }

describe('HttpClient', () => {
  const realFetch = globalThis.fetch
  const realES = (globalThis as unknown as Record<string, unknown>).EventSource
  const realWS = (globalThis as unknown as Record<string, unknown>).WebSocket
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async () => ok({}))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    ;(globalThis as unknown as Record<string, unknown>).EventSource = FakeES
    ;(globalThis as unknown as Record<string, unknown>).WebSocket = FakeWS
    setIdentity(null)
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    ;(globalThis as unknown as Record<string, unknown>).EventSource = realES
    ;(globalThis as unknown as Record<string, unknown>).WebSocket = realWS
    setIdentity(null)
  })

  it('catalog GETs /api/catalog', async () => {
    fetchMock.mockResolvedValueOnce(ok([{ kind: 'Pod' }]))
    expect(await createHttpClient().catalog()).toEqual([{ kind: 'Pod' }])
    expect(fetchMock.mock.calls[0][0]).toBe('/api/catalog')
    expect(fetchMock.mock.calls[0][1].method).toBe('GET')
  })

  it('get keeps core literal in the path (backend maps it)', async () => {
    await createHttpClient().get(ref)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/core/v1/namespaces/default/pods/p1')
    await createHttpClient().get({ ...ref, group: 'apps', resource: 'deployments' })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/apps/v1/namespaces/default/deployments/p1')
  })

  it('apply PUTs with dryRun and body', async () => {
    const obj = { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'x' } }
    await createHttpClient().apply(obj, { dryRun: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/apply?dryRun=true')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual(obj)
  })

  it('delete DELETEs the path', async () => {
    await createHttpClient().delete(ref)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/core/v1/namespaces/default/pods/p1')
    expect(init.method).toBe('DELETE')
  })

  it('canI POSTs /api/can-i', async () => {
    fetchMock.mockResolvedValueOnce(ok({ allowed: true }))
    const req = { verb: 'delete', group: 'core', version: 'v1', resource: 'pods' }
    expect(await createHttpClient().canI(req)).toEqual({ allowed: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/can-i')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual(req)
  })

  it('does not send Impersonate-* headers; relies on the session cookie', async () => {
    // Auth is the OIDC session cookie (same-origin credentials). The backend
    // ignores Impersonate-* headers, so the client must not send them even when
    // a (mock) identity is set.
    setIdentity(IDENTITY_PRESETS[0])
    await createHttpClient().catalog()
    const init = fetchMock.mock.calls[0][1]
    const h = init.headers as Headers
    expect(h.get('Impersonate-User')).toBeNull()
    expect(h.get('Impersonate-Group')).toBeNull()
    expect(init.credentials).toBe('same-origin')
  })

  it('redirects to login on 401', async () => {
    __resetSessionRedirect()
    const assign = vi.fn()
    vi.stubGlobal('location', { assign, origin: 'http://localhost' })
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: 'no session', code: 401, reason: 'Unauthorized' }),
    })
    await expect(createHttpClient().catalog()).rejects.toMatchObject({ code: 401 })
    expect(assign).toHaveBeenCalledWith(LOGIN_PATH)
    vi.unstubAllGlobals()
  })

  it('throws ApiError on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: 'not found', code: 404, reason: 'NotFound' }),
    })
    await expect(createHttpClient().get(ref)).rejects.toEqual({
      error: 'not found',
      code: 404,
      reason: 'NotFound',
    })
  })

  it('watch parses frames and unsubscribes', () => {
    const onEvent = vi.fn()
    const un = createHttpClient().watch(
      { group: 'core', version: 'v1', resource: 'pods' },
      { namespace: 'default' },
      onEvent,
    )
    expect(FakeES.last.url).toBe('/api/stream/core/v1/namespaces/default/pods')
    const env = { type: 'bookmark', resourceVersion: '1' }
    FakeES.last.onmessage!({ data: JSON.stringify(env) })
    expect(onEvent).toHaveBeenCalledWith(env)
    FakeES.last.onerror!()
    expect(onEvent).toHaveBeenLastCalledWith({ type: 'error', message: 'stream error' })
    un()
    expect(FakeES.last.close).toHaveBeenCalled()
  })

  it('logs forwards lines', () => {
    const onLine = vi.fn()
    const un = createHttpClient().logs(ref, onLine)
    expect(FakeES.last.url).toBe('/api/logs/core/v1/namespaces/default/pods/p1')
    FakeES.last.onmessage!({ data: 'hello' })
    expect(onLine).toHaveBeenCalledWith('hello')
    un()
    expect(FakeES.last.close).toHaveBeenCalled()
  })

  it('exec wires WebSocket', () => {
    const s = createHttpClient().exec(ref)
    expect(FakeWS.last.url).toMatch(
      /^ws:\/\/.*\/api\/exec\/core\/v1\/namespaces\/default\/pods\/p1$/,
    )
    const cb = vi.fn()
    s.onData(cb)
    FakeWS.last.onmessage!({ data: 'out' })
    expect(cb).toHaveBeenCalledWith('out')
    s.send('ls')
    expect(FakeWS.last.send).toHaveBeenCalledWith('ls')
    s.resize(80, 24)
    expect(JSON.parse(FakeWS.last.send.mock.calls[1][0])).toEqual({
      type: 'resize',
      cols: 80,
      rows: 24,
    })
    s.close()
    expect(FakeWS.last.close).toHaveBeenCalled()
  })

  it('portForward tracks status', () => {
    const s = createHttpClient().portForward(ref, 8080, 80)
    expect(FakeWS.last.url).toContain('/api/port-forward/')
    expect(FakeWS.last.url).toContain('local=8080&remote=80')
    expect(s.id).toBeTruthy()
    expect(s.status).toBe('active')
    s.close()
    expect(FakeWS.last.close).toHaveBeenCalled()
    FakeWS.last.onclose!()
    expect(s.status).toBe('closed')
  })
})
