import { describe, expect, it } from 'vitest'
import { createMockHelm } from './helmMock'

describe('helmMock', () => {
  it('lists releases with mixed statuses', async () => {
    const rel = await createMockHelm().listReleases()
    expect(rel.length).toBeGreaterThanOrEqual(2)
    expect(rel.map((r) => r.status)).toContain('deployed')
    expect(rel.map((r) => r.status)).toContain('failed')
  })
  it('gets a release detail and rejects unknown', async () => {
    const c = createMockHelm()
    const d = await c.getRelease('ingress', 'edge-proxy')
    expect(d.revision).toBe(4)
    expect(d.values).toContain('replicaCount')
    await expect(c.getRelease('x', 'y')).rejects.toThrow()
  })
  it('lists repos and charts', async () => {
    const c = createMockHelm()
    const repos = await c.listRepos()
    expect(repos.map((r) => r.name)).toContain('stable')
    expect((await c.listCharts('stable')).length).toBeGreaterThan(1)
    expect(await c.listCharts('nope')).toEqual([])
  })
})
