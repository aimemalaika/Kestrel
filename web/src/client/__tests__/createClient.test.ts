import { describe, it, expect, vi, afterEach } from 'vitest'
import { createClient } from '../createClient'

afterEach(() => vi.unstubAllEnvs())

describe('createClient', () => {
  it('defaults to the mock client', async () => {
    const c = createClient()
    expect((await c.catalog()).length).toBeGreaterThan(0)
  })

  it('wires createHttpClient for VITE_CLIENT=http', () => {
    vi.stubEnv('VITE_CLIENT', 'http')
    const c = createClient()
    for (const m of ['catalog', 'get', 'apply', 'delete', 'watch', 'canI', 'logs', 'exec']) {
      expect(typeof (c as unknown as Record<string, unknown>)[m]).toBe('function')
    }
  })

  it('rejects unknown implementations', () => {
    vi.stubEnv('VITE_CLIENT', 'nope')
    expect(() => createClient()).toThrow(/unknown VITE_CLIENT/)
  })
})
