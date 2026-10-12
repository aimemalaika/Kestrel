import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

import { CommandPalette } from './CommandPalette'

function setup(path = '/ns/default/core/v1/pods') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <CommandPalette />
    </MemoryRouter>,
  )
}

describe('CommandPalette', () => {
  beforeEach(() => navigate.mockClear())

  it('is closed until Cmd-K, closes on Escape', () => {
    setup()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText(/search kinds/i)).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens on Ctrl-K, filters kinds and navigates on Enter', async () => {
    setup()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const input = screen.getByLabelText(/search kinds/i)
    fireEvent.change(input, { target: { value: 'deploy' } })
    expect(await screen.findByText('Deployment')).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(navigate).toHaveBeenCalledWith('/ns/default/apps/v1/deployments')
  })

  it('finds streamed resources and navigates to the drawer on click', async () => {
    setup()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    fireEvent.change(screen.getByLabelText(/search kinds/i), { target: { value: 'web-2' } })
    fireEvent.click(await screen.findByText('web-2'))
    expect(navigate).toHaveBeenCalledWith('/ns/default/core/v1/pods/web-2')
  })

  it('shows "No results" for a query that matches no kind', async () => {
    setup()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    fireEvent.change(screen.getByLabelText(/search kinds/i), { target: { value: 'argocd' } })
    expect(await screen.findByText('No results')).toBeInTheDocument()
    expect(screen.queryByText('Deployment')).toBeNull()
  })

  it('preserves the current namespace on navigate (not "default")', async () => {
    setup('/ns/_all/core/v1/pods')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const input = screen.getByLabelText(/search kinds/i)
    fireEvent.change(input, { target: { value: 'deploy' } })
    await screen.findByText('Deployment')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(navigate).toHaveBeenCalledWith('/ns/_all/apps/v1/deployments')
  })
})
