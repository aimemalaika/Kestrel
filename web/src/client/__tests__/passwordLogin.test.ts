import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHttpClient } from '../HttpClient'

afterEach(() => vi.restoreAllMocks())

describe('passwordLogin()', () => {
  it('POSTs form-encoded credentials to /auth/password (never in the URL)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }))
    await createHttpClient().passwordLogin('alice@corp.com', 's3cret')
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/auth/password')
    expect(String(url)).not.toContain('s3cret')
    expect(String(url)).not.toContain('password=')
    expect(init?.method).toBe('POST')
    const body = String(init?.body)
    expect(body).toContain('username=alice%40corp.com')
    expect(body).toContain('password=s3cret')
    expect(init?.credentials).toBe('same-origin')
  })

  it('rejects with an ApiError on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'invalid credentials', code: 401, reason: 'Unauthorized' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )
    await expect(createHttpClient().passwordLogin('u', 'p')).rejects.toMatchObject({ code: 401 })
  })
})
