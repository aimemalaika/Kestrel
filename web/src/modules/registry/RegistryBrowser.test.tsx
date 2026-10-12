import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../toast/ToastProvider'
import { RegistryBrowser } from './RegistryBrowser'
import { createMockRegistry } from './registryMock'
import type { RegistryClient } from './RegistryClient'
import type { ApiError } from '../../contract/types'

function setup(client: RegistryClient = createMockRegistry()) {
  render(
    <MemoryRouter>
      <ToastProvider>
        <RegistryBrowser client={client} />
      </ToastProvider>
    </MemoryRouter>,
  )
}

// A registry client whose listRepos rejects with the given ApiError.
function failingRegistry(err: ApiError): RegistryClient {
  return {
    listRepos: () => Promise.reject(err),
    listTags: () => Promise.reject(err),
    getImage: () => Promise.reject(err),
    deleteImage: () => Promise.reject(err),
  } as unknown as RegistryClient
}

describe('RegistryBrowser', () => {
  it('drills repos -> tags -> image detail', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'team/web' }))
    fireEvent.click(await screen.findByRole('button', { name: 'v2.0.1' }))
    expect(await screen.findByText(/sha256:b7c8/)).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
  })

  it('shows a not-configured empty state on a 503 (no repo table)', async () => {
    setup(failingRegistry({ error: 'unconfigured', code: 503, reason: '' }))
    expect(await screen.findByText(/Registry not configured/)).toBeInTheDocument()
    expect(screen.getByText(/--registry-url/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'team/web' })).toBeNull()
  })

  it('shows a generic error state on other failures', async () => {
    setup(failingRegistry({ error: 'boom', code: 500, reason: '' }))
    expect(await screen.findByText(/Could not reach the registry/)).toBeInTheDocument()
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
