import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../toast/ToastProvider'
import { RegistryBrowser } from './RegistryBrowser'
import { createMockRegistry } from './registryMock'

function setup() {
  render(
    <MemoryRouter>
      <ToastProvider>
        <RegistryBrowser client={createMockRegistry()} />
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('RegistryBrowser', () => {
  it('drills repos -> tags -> image detail', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'team/web' }))
    fireEvent.click(await screen.findByRole('button', { name: 'v2.0.1' }))
    expect(await screen.findByText(/sha256:b7c8/)).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
  })

  it('shows GC note and deletes after confirm', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'team/web' }))
    fireEvent.click(await screen.findByRole('button', { name: 'v2.0.1' }))
    expect(await screen.findByText(/registry GC has not run/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/Deleted team\/web@/)
    expect(await screen.findByText('No tags.')).toBeInTheDocument()
  })
})
