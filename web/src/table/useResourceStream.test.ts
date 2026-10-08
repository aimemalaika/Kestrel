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

beforeEach(() => (handlers.length = 0))
afterEach(() => vi.clearAllMocks())

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

  it('resyncs on error: clears and re-subscribes', () => {
    const { result } = renderHook(() =>
      useResourceStream({ group: 'core', version: 'v1', resource: 'pods' }, 'default'),
    )
    act(() => handlers[0].cb!({ type: 'added', object: pod('a') }))
    expect(result.current.rows).toHaveLength(1)
    act(() => handlers[0].cb!({ type: 'error', message: 'resync' }))
    expect(result.current.rows).toHaveLength(0)
    expect(handlers.length).toBe(2)
    act(() => handlers[1].cb!({ type: 'added', object: pod('c') }))
    expect(result.current.rows.map((r) => r.metadata.name)).toEqual(['c'])
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
