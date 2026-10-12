import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../streaming/Terminal', () => ({
  default: () => {
    throw new Error('InvalidStateError: terminal boom')
  },
}))
vi.mock('./useResourceObject', () => ({
  useResourceObject: () => ({
    status: 'ready',
    object: {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'web-1', namespace: 'default', uid: 'default/web-1' },
    },
  }),
}))
vi.mock('../write/useCanI', () => ({ useCanI: () => true }))

import { DetailDrawer } from './DetailDrawer'

describe('DetailDrawer error boundary', () => {
  it('contains a crashing tab without blanking the drawer', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <MemoryRouter initialEntries={['/ns/default/core/v1/pods/web-1']}>
        <Routes>
          <Route path="/ns/:namespace/:group/:version/:resource/:name" element={<DetailDrawer />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: /terminal/i }))
    // Suspense resolves the lazy Terminal, which throws → boundary fallback renders.
    expect(await screen.findByText(/This tab hit an error/i)).toBeInTheDocument()
    // Drawer chrome survives.
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    spy.mockRestore()
  })
})
