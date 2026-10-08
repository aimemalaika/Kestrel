import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useSelection } from './selection'

function wrapperFor(path: string) {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/ns/:namespace/:group/:version/:resource" element={children} />
        <Route path="/ns/:namespace" element={children} />
        <Route path="/*" element={children} />
      </Routes>
    </MemoryRouter>
  )
}

describe('useSelection', () => {
  it('parses namespace + gvr from a full resource URL', () => {
    const { result } = renderHook(() => useSelection(), {
      wrapper: wrapperFor('/ns/shop/apps/v1/deployments'),
    })
    expect(result.current.namespace).toBe('shop')
    expect(result.current.gvr).toEqual({ group: 'apps', version: 'v1', resource: 'deployments' })
  })

  it('parses namespace only when no resource is selected', () => {
    const { result } = renderHook(() => useSelection(), { wrapper: wrapperFor('/ns/shop') })
    expect(result.current.namespace).toBe('shop')
    expect(result.current.gvr).toBeUndefined()
  })

  it('returns empty selection at root', () => {
    const { result } = renderHook(() => useSelection(), { wrapper: wrapperFor('/') })
    expect(result.current.namespace).toBeUndefined()
    expect(result.current.gvr).toBeUndefined()
  })
})
