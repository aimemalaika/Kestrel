import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useResourceObject } from './useResourceObject'

const pods = { group: 'core', version: 'v1', resource: 'pods' }

describe('useResourceObject', () => {
  it('selects the object by name from the mock stream', async () => {
    const { result } = renderHook(() => useResourceObject(pods, 'default', 'web-1'))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.object?.metadata.name).toBe('web-1')
  })

  it('is notfound for an absent name', async () => {
    const { result } = renderHook(() => useResourceObject(pods, 'default', 'nope'))
    await waitFor(() => expect(result.current.status).toBe('notfound'))
    expect(result.current.object).toBeUndefined()
  })

  it('is idle with no gvr or name', () => {
    const { result } = renderHook(() => useResourceObject(undefined, 'default', undefined))
    expect(result.current.status).toBe('idle')
  })
})
