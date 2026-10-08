import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCanI } from './useCanI'

const base = { group: 'core', version: 'v1', resource: 'pods', name: 'x' }

describe('useCanI', () => {
  it('denies delete in kube-system', async () => {
    const { result } = renderHook(() =>
      useCanI({ verb: 'delete', namespace: 'kube-system', ...base }),
    )
    await waitFor(() => expect(result.current).toBe(false))
  })
  it('allows delete elsewhere', async () => {
    const { result } = renderHook(() => useCanI({ verb: 'delete', namespace: 'default', ...base }))
    await waitFor(() => expect(result.current).toBe(true))
  })
})
