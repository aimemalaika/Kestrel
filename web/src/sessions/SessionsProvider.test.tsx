import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { SessionsProvider, useSessions } from './SessionsProvider'

const ref = { group: 'core', version: 'v1', resource: 'pods', namespace: 'default', name: 'web-1' }

describe('SessionsProvider', () => {
  it('start adds a session and stop removes it', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SessionsProvider>{children}</SessionsProvider>
    )
    const { result } = renderHook(() => useSessions(), { wrapper })
    act(() => result.current.start(ref, 8080, 80))
    expect(result.current.sessions).toHaveLength(1)
    const id = result.current.sessions[0].id
    act(() => result.current.stop(id))
    expect(result.current.sessions).toHaveLength(0)
  })

  it('concurrent forwards get distinct ids; stopping one keeps the other', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SessionsProvider>{children}</SessionsProvider>
    )
    const { result } = renderHook(() => useSessions(), { wrapper })
    act(() => result.current.start(ref, 8080, 80))
    act(() => result.current.start(ref, 9090, 90))
    expect(result.current.sessions).toHaveLength(2)
    expect(result.current.sessions[0].id).not.toBe(result.current.sessions[1].id)
    const [first, second] = result.current.sessions
    act(() => result.current.stop(first.id))
    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.sessions[0].id).toBe(second.id)
  })
})
