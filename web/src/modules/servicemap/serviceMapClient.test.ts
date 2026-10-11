import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getServiceMap, putServiceMap } from './serviceMapClient'
import type { ServiceMapModel } from './types'

const model: ServiceMapModel = {
  name: 'shop',
  services: [{ id: 'a', displayName: 'a', slo: 99.9, dependsOn: [] }],
}

const res = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: `status ${status}`,
  json: async () => body,
})

describe('serviceMapClient', () => {
  const realFetch = globalThis.fetch
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('getServiceMap maps the model and sends cookies', async () => {
    fetchMock.mockResolvedValueOnce(res(200, model))
    expect(await getServiceMap()).toEqual(model)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/servicemap')
    expect(init.credentials).toBe('same-origin')
  })

  it('putServiceMap returns {ok:true,model} on 200 and PUTs yaml', async () => {
    fetchMock.mockResolvedValueOnce(res(200, model))
    const r = await putServiceMap('name: shop')
    expect(r).toEqual({ ok: true, model })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/servicemap')
    expect(init.method).toBe('PUT')
    expect(init.credentials).toBe('same-origin')
    expect(init.headers).toEqual({ 'Content-Type': 'application/yaml' })
    expect(init.body).toBe('name: shop')
  })

  it('putServiceMap returns {ok:false,errors} on 422 incl. edge', async () => {
    const errors = [
      { message: 'undeclared service "ghost"', serviceId: 'a', edge: ['a', 'ghost'] },
      { message: 'bad slo', serviceId: 'a' },
    ]
    fetchMock.mockResolvedValueOnce(
      res(422, { error: 'invalid', code: 422, reason: 'Invalid', errors }),
    )
    const r = await putServiceMap('x')
    expect(r).toEqual({ ok: false, errors })
  })

  it('putServiceMap maps a 400 into a single error from body.error', async () => {
    fetchMock.mockResolvedValueOnce(res(400, { error: 'bad yaml', code: 400, reason: 'BadRequest' }))
    const r = await putServiceMap('::')
    expect(r).toEqual({ ok: false, errors: [{ message: 'bad yaml' }] })
  })

  it('putServiceMap maps a 413 into a single size error', async () => {
    fetchMock.mockResolvedValueOnce(res(413, { error: 'too big', code: 413, reason: 'TooLarge' }))
    const r = await putServiceMap('x'.repeat(10))
    expect(r).toEqual({ ok: false, errors: [{ message: 'Service map too large (max 1 MiB)' }] })
  })

  it('putServiceMap throws the {error,code,reason} contract on a 500', async () => {
    fetchMock.mockResolvedValueOnce(res(500, { error: 'boom', code: 500, reason: 'Internal' }))
    await expect(putServiceMap('x')).rejects.toEqual({
      error: 'boom',
      code: 500,
      reason: 'Internal',
    })
  })
})
