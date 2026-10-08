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

describe('MockClient namespaces', () => {
  it('lists namespaces in the catalog', async () => {
    const c = createMockClient()
    const cat = await c.catalog()
    expect(cat.some((e) => e.resource === 'namespaces' && e.group === 'core')).toBe(true)
  })

  it('bursts namespace objects on watch', () => {
    const c = createMockClient({ tickMs: 100000 })
    const names: string[] = []
    const stop = c.watch({ group: 'core', version: 'v1', resource: 'namespaces' }, {}, (e) => {
      if ('object' in e && e.object.kind === 'Namespace') names.push(e.object.metadata.name)
    })
    expect(names).toContain('default')
    expect(names.length).toBeGreaterThanOrEqual(2)
    stop()
  })
})

describe('MockClient events', () => {
  it('bursts Event objects with involvedObject on watch', () => {
    const c = createMockClient({ tickMs: 100000 })
    const evs: string[] = []
    const stop = c.watch({ group: 'core', version: 'v1', resource: 'events' }, {}, (e) => {
      if ('object' in e && e.object.kind === 'Event') {
        const io = e.object.involvedObject as { name?: string } | undefined
        if (io?.name) evs.push(io.name)
      }
    })
    expect(evs.filter((n) => n === 'web-1').length).toBeGreaterThanOrEqual(2)
    stop()
  })
})
