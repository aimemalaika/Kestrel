import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockClient } from '../MockClient'
import { isDeltaEnvelope, type WatchEnvelope } from '../../contract/types'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('MockClient', () => {
  it('exposes a non-empty catalog', async () => {
    const c = createMockClient()
    const cat = await c.catalog()
    expect(cat.length).toBeGreaterThan(0)
    expect(cat[0]).toHaveProperty('kind')
  })

  it('bursts initial-sync added events on subscribe, then emits deltas on tick', () => {
    const c = createMockClient({ tickMs: 1000 })
    const events: WatchEnvelope[] = []
    const stop = c.watch(
      { group: 'core', version: 'v1', resource: 'pods' },
      { namespace: 'default' },
      (e) => events.push(e),
    )
    expect(events.some((e) => e.type === 'added')).toBe(true)
    const afterSync = events.length
    vi.advanceTimersByTime(1000)
    expect(events.length).toBeGreaterThan(afterSync)
    expect(events.slice(afterSync).every(isDeltaEnvelope)).toBe(true)
    stop()
  })

  it('stops emitting after unsubscribe', () => {
    const c = createMockClient({ tickMs: 1000 })
    const events: WatchEnvelope[] = []
    const stop = c.watch({ group: 'core', version: 'v1', resource: 'pods' }, {}, (e) =>
      events.push(e),
    )
    stop()
    const n = events.length
    vi.advanceTimersByTime(5000)
    expect(events.length).toBe(n)
  })

  it('canI allows by default', async () => {
    const c = createMockClient()
    const res = await c.canI({
      verb: 'delete',
      group: 'core',
      version: 'v1',
      resource: 'pods',
      namespace: 'default',
      name: 'p1',
    })
    expect(res.allowed).toBe(true)
  })
})
