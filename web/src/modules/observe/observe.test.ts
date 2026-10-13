import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHttpObserve } from './httpObserve'
import { createMockObserve } from './observeMock'

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

describe('httpObserve', () => {
  const realFetch = globalThis.fetch
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async () => ok({}))
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('config hits /api/observe/config', async () => {
    const cfg = { prometheus: true, alertmanager: false, loki: false, grafanaUrl: 'https://g' }
    fetchMock.mockResolvedValueOnce(ok(cfg))
    expect(await createHttpObserve().config()).toEqual(cfg)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/observe/config')
  })

  it('query encodes params and unwraps data', async () => {
    const data = { resultType: 'vector', result: [] }
    fetchMock.mockResolvedValueOnce(ok({ status: 'success', data }))
    expect(await createHttpObserve().query('sum(up{job="a"})', '123')).toEqual(data)
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/observe/query?query=${encodeURIComponent('sum(up{job="a"})')}&time=123`,
    )
  })

  it('queryRange sends start/end/step', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ status: 'success', data: { resultType: 'matrix', result: [] } }),
    )
    await createHttpObserve().queryRange('up', '1', '2', '15s')
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/observe/query_range?query=up&start=1&end=2&step=15s',
    )
  })

  it('alerts/rules/targets unwrap their envelopes', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ status: 'success', data: { alerts: [{ state: 'firing' }] } }),
    )
    fetchMock.mockResolvedValueOnce(ok({ status: 'success', data: { groups: [{ name: 'g' }] } }))
    fetchMock.mockResolvedValueOnce(ok({ status: 'success', data: { activeTargets: [] } }))
    const c = createHttpObserve()
    expect(await c.alerts()).toEqual([{ state: 'firing' }])
    expect(await c.rules()).toEqual([{ name: 'g' }])
    expect(await c.targets()).toEqual({ activeTargets: [] })
    expect(fetchMock.mock.calls.map((x) => x[0])).toEqual([
      '/api/observe/alerts',
      '/api/observe/rules',
      '/api/observe/targets',
    ])
  })
})

describe('observeMock', () => {
  it('returns canned Prometheus-shaped data', async () => {
    const m = createMockObserve()
    expect(await m.config()).toMatchObject({
      prometheus: true,
      grafanaUrl: 'https://grafana.example.com',
    })
    expect((await m.query('up')).resultType).toBe('vector')
    expect((await m.queryRange('up', '0', '1', '60s')).resultType).toBe('matrix')
    const states = (await m.alerts()).map((a) => a.state)
    expect(states).toContain('firing')
    expect(states).toContain('pending')
    expect((await m.rules())[0].rules.length).toBeGreaterThan(0)
    const health = (await m.targets()).activeTargets.map((t) => t.health)
    expect(health).toContain('up')
    expect(health).toContain('down')
  })
})
