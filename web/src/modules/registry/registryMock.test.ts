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
  it('deleteByDigest removes all matching tags', async () => {
    const r = createMockRegistry()
    const { digest } = await r.getImage('team/web', 'latest')
    await r.deleteByDigest('team/web', digest)
    expect(await r.listTags('team/web')).toEqual([])
    expect(await r.listRepos()).not.toContain('team/web')
  })
})
