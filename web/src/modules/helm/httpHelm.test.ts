import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHttpHelm } from './httpHelm'

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

describe('httpHelm', () => {
  const realFetch = globalThis.fetch
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async () => ok({}))
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('listReleases GETs /api/helm/releases with cookies, no impersonation', async () => {
    const releases = [
      {
        name: 'edge-proxy',
        namespace: 'ingress',
        revision: 4,
        status: 'deployed',
        chart: 'edge-proxy',
        chartVersion: '4.11.2',
        appVersion: '1.11.2',
        updated: '2026-01-01T00:00:00Z',
      },
    ]
    fetchMock.mockResolvedValueOnce(ok(releases))
    expect(await createHttpHelm().listReleases()).toEqual(releases)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/helm/releases')
    expect(init.credentials).toBe('same-origin')
    expect(init.headers).toEqual({ Accept: 'application/json' })
  })

  it('getRelease encodes namespace and name', async () => {
    const detail = {
      name: 'orders-db',
      namespace: 'data team',
      revision: 2,
      status: 'failed',
      chart: 'sql-database',
      chartVersion: '15.5.1',
      appVersion: '16.3.0',
      updated: '2026-01-01T00:00:00Z',
      values: 'auth: {}',
      notes: 'note',
      manifestSummary: 'StatefulSet x1',
    }
    fetchMock.mockResolvedValueOnce(ok(detail))
    expect(await createHttpHelm().getRelease('data team', 'orders-db')).toEqual(detail)
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/helm/releases/detail?namespace=data%20team&name=orders-db',
    )
  })

  it('listRepos maps the array', async () => {
    const repos = [{ name: 'stable', url: 'https://charts.example.com/stable' }]
    fetchMock.mockResolvedValueOnce(ok(repos))
    expect(await createHttpHelm().listRepos()).toEqual(repos)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/helm/repos')
  })

  it('listCharts encodes the repo query param', async () => {
    const charts = [{ name: 'cache', version: '20.1.0', description: 'kv store' }]
    fetchMock.mockResolvedValueOnce(ok(charts))
    expect(await createHttpHelm().listCharts('edge proxy')).toEqual(charts)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/helm/charts?repo=edge%20proxy')
  })

  it('throws the {error,code,reason} contract on a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ error: 'forbidden', code: 403, reason: 'RBAC' }),
    })
    await expect(createHttpHelm().listReleases()).rejects.toEqual({
      error: 'forbidden',
      code: 403,
      reason: 'RBAC',
    })
  })
})
