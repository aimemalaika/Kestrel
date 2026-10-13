import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../toast/ToastProvider'
import { RegistryBrowser } from './RegistryBrowser'
import { createMockRegistry } from './registryMock'
import type { RegistryClient } from './RegistryClient'
import type { ApiError, K8sObject } from '../../contract/types'

function setup(client: RegistryClient = createMockRegistry(), workloads?: K8sObject[]) {
  render(
    <MemoryRouter>
      <ToastProvider>
        <RegistryBrowser client={client} workloads={workloads} />
      </ToastProvider>
    </MemoryRouter>,
  )
}

// A registry client whose listRepos rejects with the given ApiError.
function failingRegistry(err: ApiError): RegistryClient {
  return {
    listRepos: () => Promise.reject(err),
    getRepoSummaries: () => Promise.reject(err),
    listTags: () => Promise.reject(err),
    getHistory: () => Promise.reject(err),
    getImage: () => Promise.reject(err),
    deleteImage: () => Promise.reject(err),
  } as unknown as RegistryClient
}

describe('RegistryBrowser', () => {
  it('drills repos -> tags -> image detail', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'web' }))
    fireEvent.click(await screen.findByRole('button', { name: 'v2.0.1' }))
    expect(await screen.findByText(/sha256:b7c8/)).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
  })

  it('landing shows a rich table with name, namespace, tags and latest digest', async () => {
    setup()
    const row = (await screen.findByRole('button', { name: 'web' })).closest('tr') as HTMLElement
    expect(within(row).getByText('team')).toBeInTheDocument()
    expect(within(row).getByText('team/web')).toBeInTheDocument()
    expect(within(row).getByText('latest, v2.0.1')).toBeInTheDocument()
    expect(within(row).getByText('sha256:b7c8d9e0f1a2')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Name',
      'Namespace',
      'Repository',
      'Tags',
      'Latest Image',
      'Age',
    ])
  })

  it('shows the album newest-first with short digest and size; tag opens detail', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'api' }))
    await screen.findByRole('button', { name: 'v1.3.2' })
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('button')[0].textContent)).toEqual([
      'latest',
      'v1.4.0',
      'v1.3.2',
    ])
    expect(within(rows[2]).getByText('sha256:0f1e2d3c4b5a')).toBeInTheDocument()
    expect(within(rows[0]).getByText('84.0 MB')).toBeInTheDocument()
    fireEvent.click(within(rows[2]).getByRole('button', { name: 'v1.3.2' }))
    expect(await screen.findByText(/sha256:0f1e2d3c4b5a69788796a5b4c3d2e1f0/)).toBeInTheDocument()
  })

  it('shows a not-configured empty state on a 503 (no repo table)', async () => {
    setup(failingRegistry({ error: 'unconfigured', code: 503, reason: '' }))
    expect(await screen.findByText(/Registry not configured/)).toBeInTheDocument()
    expect(screen.getByText(/--registry-url/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'web' })).toBeNull()
  })

  it('shows a generic error state on other failures', async () => {
    setup(failingRegistry({ error: 'boom', code: 500, reason: '' }))
    expect(await screen.findByText(/Could not reach the registry/)).toBeInTheDocument()
  })

  it('shows GC note and deletes after confirm', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'web' }))
    fireEvent.click(await screen.findByRole('button', { name: 'v2.0.1' }))
    expect(await screen.findByText(/registry GC has not run/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/Deleted team\/web@/)
    expect(await screen.findByText('No tags.')).toBeInTheDocument()
  })

  it('badges the tag currently deployed by a workload, and only that tag', async () => {
    const dep = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'api-gateway', namespace: 'production' },
      spec: {
        template: { spec: { containers: [{ name: 'a', image: 'kestrel/api-gateway:2.4.1' }] } },
      },
    } as unknown as K8sObject
    setup(createMockRegistry(), [dep])
    fireEvent.click(await screen.findByRole('button', { name: 'api-gateway' }))
    const row = (await screen.findByRole('button', { name: '2.4.1' })).closest('tr') as HTMLElement
    expect(within(row).getByText('Deployed')).toBeInTheDocument()
    const other = screen.getByRole('button', { name: '2.4.0' }).closest('tr') as HTMLElement
    expect(within(other).queryByText('Deployed')).toBeNull()
  })
})
