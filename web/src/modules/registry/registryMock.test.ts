import { describe, expect, it } from 'vitest'
import { createMockRegistry } from './registryMock'

describe('registryMock', () => {
  it('lists repos, tags and image details', async () => {
    const r = createMockRegistry()
    expect((await r.listRepos()).length).toBeGreaterThanOrEqual(2)
    expect(await r.listTags('team/web')).toContain('latest')
    const img = await r.getImage('team/web', 'latest')
    expect(img.digest).toMatch(/^sha256:/)
    expect(img.layers).toBeGreaterThan(0)
    expect(r.deletesEnabled).toBe(true)
  })
  it('getRepoSummaries returns tags plus the latest tag image', async () => {
    const r = createMockRegistry()
    const rows = await r.getRepoSummaries()
    const web = rows.find((x) => x.repo === 'team/web')!
    expect(web.tags).toEqual(['latest', 'v2.0.1'])
    expect(web.digest).toBe((await r.getImage('team/web', 'latest')).digest)
    expect(web.size).toBe(42_300_000)
    expect(web.created).toBeTruthy()
    expect(rows.find((x) => x.repo === 'kestrel/api-gateway')!.digest).toMatch(/^sha256:/)
  })
  it('deleteByDigest removes all matching tags', async () => {
    const r = createMockRegistry()
    const { digest } = await r.getImage('team/web', 'latest')
    await r.deleteByDigest('team/web', digest)
    expect(await r.listTags('team/web')).toEqual([])
    expect(await r.listRepos()).not.toContain('team/web')
  })
  it('getHistory returns tags newest-first with created', async () => {
    const r = createMockRegistry()
    const h = await r.getHistory('team/api')
    expect(h.map((x) => x.tag)).toEqual(['latest', 'v1.4.0', 'v1.3.2'])
    for (const x of h) expect(x.created).toBeTruthy()
    const t = h.map((x) => Date.parse(x.created!))
    expect(t).toEqual([...t].sort((a, b) => b - a))
    expect((await r.getImage('team/api', 'v1.3.2')).created).toBe(h[2].created)
    expect(await r.getHistory('nope')).toEqual([])
  })
})
