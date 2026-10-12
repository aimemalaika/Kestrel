import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHttpClient } from '../../client/HttpClient'

afterEach(() => vi.restoreAllMocks())

describe('authInfo()', () => {
  it('fetches /authinfo and returns the parsed payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          mode: 'oidc',
          user: null,
          options: [{ id: 'oidc', label: 'Log in', start: '/auth/login' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const info = await createHttpClient().authInfo()
    expect(info.mode).toBe('oidc')
    expect(info.options[0].start).toBe('/auth/login')
  })

  it('treats a non-200 as needs-login (no throw), returning an oidc payload with no user', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }))
    const info = await createHttpClient().authInfo()
    expect(info.user ?? null).toBeNull()
    expect(info.mode).toBe('oidc')
  })
})
