import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHttpRegistry } from './httpRegistry'

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('httpRegistry', () => {
  const realFetch = globalThis.fetch
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async () => ok({}))
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('listRepos maps {repos} and sends cookies without impersonation', async () => {
    fetchMock.mockResolvedValueOnce(ok({ deletesEnabled: false })) // construction /config
    fetchMock.mockResolvedValueOnce(ok({ repos: ['team/api', 'team/web'] }))
    const r = createHttpRegistry()
    expect(await r.listRepos()).toEqual(['team/api', 'team/web'])
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/registry/repos')
    expect(init.credentials).toBe('same-origin')
    expect(init.headers).toEqual({ Accept: 'application/json' })
  })

  it('listTags encodes the repo query param', async () => {
    fetchMock.mockResolvedValueOnce(ok({ deletesEnabled: false }))
    fetchMock.mockResolvedValueOnce(ok({ tags: ['latest', 'v1'] }))
    const r = createHttpRegistry()
    expect(await r.listTags('team/api')).toEqual(['latest', 'v1'])
    expect(fetchMock.mock.calls[1][0]).toBe('/api/registry/tags?repo=team%2Fapi')
  })

  it('getImage returns {digest,size,layers} and encodes params', async () => {
    fetchMock.mockResolvedValueOnce(ok({ deletesEnabled: false }))
    fetchMock.mockResolvedValueOnce(ok({ digest: 'sha256:abc', size: 123, layers: 4 }))
    const r = createHttpRegistry()
    expect(await r.getImage('team/api', 'v1.0')).toEqual({
      digest: 'sha256:abc',
      size: 123,
      layers: 4,
    })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/registry/image?repo=team%2Fapi&tag=v1.0')
  })

  it('deleteByDigest DELETEs the right url', async () => {
    fetchMock.mockResolvedValueOnce(ok({ deletesEnabled: true }))
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) })
    const r = createHttpRegistry()
    await r.deleteByDigest('team/api', 'sha256:abc')
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/registry/image?repo=team%2Fapi&digest=sha256%3Aabc')
    expect(init.method).toBe('DELETE')
    expect(init.credentials).toBe('same-origin')
  })

  it('throws the {error,code,reason} contract on a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce(ok({ deletesEnabled: false }))
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({ error: 'registry not configured', code: 503, reason: 'Unavailable' }),
    })
    const r = createHttpRegistry()
    await expect(r.listRepos()).rejects.toEqual({
      error: 'registry not configured',
      code: 503,
      reason: 'Unavailable',
    })
  })

  it('deletesEnabled reflects GET /api/registry/config', async () => {
    fetchMock.mockResolvedValueOnce(ok({ deletesEnabled: true }))
    const r = createHttpRegistry()
    expect(r.deletesEnabled).toBe(false) // before config resolves
    await flush()
    expect(r.deletesEnabled).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/registry/config')
  })

  it('leaves deletesEnabled false when config fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({ error: 'nope', code: 503, reason: 'Unavailable' }),
    })
    const r = createHttpRegistry()
    await flush()
    expect(r.deletesEnabled).toBe(false)
  })
})
