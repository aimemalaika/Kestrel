import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useResourceStream } from './useResourceStream'

const handlers: { cb?: (e: unknown) => void; stopped: boolean }[] = []
vi.mock('../client/createClient', () => ({
  createClient: () => ({
    watch: (_gvr: unknown, _opts: unknown, cb: (e: unknown) => void) => {
      const h = { cb, stopped: false }
      handlers.push(h)
      return () => {
        h.stopped = true
      }
    },
  }),
}))

beforeEach(() => {
  handlers.length = 0
  vi.useFakeTimers()
})
afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.clearAllMocks()
})

const pod = (name: string, phase = 'Running') => ({
  apiVersion: 'v1',
  kind: 'Pod',
  metadata: { name, namespace: 'default', uid: `default/${name}` },
  status: { phase },
})

describe('useResourceStream', () => {
  it('applies added/modified/deleted to the view', () => {
    const { result } = renderHook(() =>
      useResourceStream({ group: 'core', version: 'v1', resource: 'pods' }, 'default'),
    )
    act(() => {
      handlers[0].cb!({ type: 'added', object: pod('a') })
      handlers[0].cb!({ type: 'added', object: pod('b') })
    })
    expect(result.current.rows.map((r) => r.metadata.name).sort()).toEqual(['a', 'b'])
    expect(result.current.status).toBe('ready')
    act(() => handlers[0].cb!({ type: 'modified', object: pod('a', 'Pending') }))
    expect(result.current.rows.find((r) => r.metadata.name === 'a')!.status).toEqual({
      phase: 'Pending',
    })
    act(() => handlers[0].cb!({ type: 'deleted', object: pod('b') }))
    expect(result.current.rows.map((r) => r.metadata.name)).toEqual(['a'])
  })

  it('does not reconnect immediately on a transient error — waits for a backoff delay', () => {
    renderHook(() =>
      useResourceStream({ group: 'core', version: 'v1', resource: 'pods' }, 'default'),
    )
    expect(handlers.length).toBe(1)
    act(() => handlers[0].cb!({ type: 'added', object: pod('a') }))
    act(() => handlers[0].cb!({ type: 'error', message: 'stream error' }))
    // No tight loop: still only one subscription right after the error.
    expect(handlers.length).toBe(1)
    act(() => vi.advanceTimersByTime(1300)) // past BASE_DELAY_MS (+jitter headroom)
    expect(handlers.length).toBe(2) // reconnected exactly once
  })

  it('backs off exponentially and gives up after the attempt cap → terminal error', () => {
    const { result } = renderHook(() =>
      useResourceStream({ group: 'core', version: 'v1', resource: 'pods' }, 'default'),
    )
    for (let attempt = 0; attempt < 6; attempt++) {
      const h = handlers[handlers.length - 1]
      act(() => h.cb!({ type: 'error', message: 'stream error' }))
      act(() => vi.advanceTimersByTime(40000)) // longer than MAX_DELAY_MS
    }
    // Final failure exhausts MAX_ATTEMPTS: no further reconnect, status terminal.
    const countAtCap = handlers.length
    act(() => vi.advanceTimersByTime(60000))
    expect(handlers.length).toBe(countAtCap)
    expect(result.current.status).toBe('error')
  })

  it('treats a 404 (resource type absent) as terminal — no reconnect, status error', () => {
    const { result } = renderHook(() =>
      useResourceStream(
        { group: 'operators', version: 'v1', resource: 'installedoperators' },
        undefined,
      ),
    )
    expect(handlers.length).toBe(1)
    act(() => handlers[0].cb!({ type: 'error', message: 'not found', code: 404 }))
    act(() => vi.advanceTimersByTime(60000))
    expect(handlers.length).toBe(1) // never retried
    expect(result.current.status).toBe('error')
  })

  it('resets the backoff counter after a successful event', () => {
    renderHook(() =>
      useResourceStream({ group: 'core', version: 'v1', resource: 'pods' }, 'default'),
    )
    act(() => handlers[0].cb!({ type: 'error', message: 'blip' }))
    act(() => vi.advanceTimersByTime(1300))
    expect(handlers.length).toBe(2)
    act(() => handlers[1].cb!({ type: 'added', object: pod('a') })) // success resets attempts
    act(() => handlers[1].cb!({ type: 'error', message: 'blip' }))
    act(() => vi.advanceTimersByTime(1300)) // next delay is BASE again, not escalated
    expect(handlers.length).toBe(3)
  })

  it('returns empty + ready when no gvr', () => {
    const { result } = renderHook(() => useResourceStream(undefined, undefined))
    expect(result.current.rows).toEqual([])
    expect(result.current.status).toBe('ready')
  })

  it('filters rows by namespace', () => {
    const { result } = renderHook(() =>
      useResourceStream({ group: 'core', version: 'v1', resource: 'pods' }, 'shop'),
    )
    act(() => {
      handlers[0].cb!({ type: 'added', object: pod('a') })
      handlers[0].cb!({
        type: 'added',
        object: { ...pod('b'), metadata: { name: 'b', namespace: 'shop', uid: 'shop/b' } },
      })
    })
    expect(result.current.rows.map((r) => r.metadata.name)).toEqual(['b'])
  })
})
