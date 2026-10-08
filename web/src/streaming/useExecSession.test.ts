import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useExecSession } from './useExecSession'

vi.mock('../client/createClient', () => ({
  createClient: () => ({
    exec: () => {
      let cb: ((d: string) => void) | undefined
      return {
        onData(fn: (d: string) => void) {
          cb = fn
        },
        send(d: string) {
          cb?.(d)
        },
        resize() {},
        close() {},
      }
    },
  }),
}))

const pod = { group: 'core', version: 'v1', resource: 'pods', namespace: 'default', name: 'web-1' }

describe('useExecSession', () => {
  it('collects echoed data on send', () => {
    const { result } = renderHook(() => useExecSession(pod))
    act(() => result.current.send('ping'))
    expect(result.current.data.join('')).toContain('ping')
  })
})
