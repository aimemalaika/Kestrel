import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ClusterView } from './ClusterView'

// Cluster Settings sources real identity through this hook; pin it.
vi.mock('../cluster/useClusterInfo', () => ({
  useClusterInfo: () => ({
    info: {
      clusterName: 'brd-hq-cluster',
      serverVersion: 'v1.33.4',
      apiServerURL: 'https://api.brd-hq-cluster.brd.rw:8443',
    },
    error: false,
  }),
}))

const renderCluster = () =>
  render(
    <MemoryRouter>
      <ClusterView />
    </MemoryRouter>,
  )

describe('ClusterView', () => {
  it('Cluster Operators tab shows health tiles and table', async () => {
    renderCluster()
    expect(await screen.findByText('dns')).toBeInTheDocument()
    expect(screen.getByText('ingress')).toBeInTheDocument()
    expect(screen.getByText('storage')).toBeInTheDocument()
    expect(screen.getByText('Healthy operators')).toBeInTheDocument()
    expect(screen.getByTestId('tile-Healthy')).toHaveTextContent('6')
    expect(screen.getByTestId('tile-Progressing')).toHaveTextContent('2')
    expect(screen.getByTestId('tile-Degraded')).toHaveTextContent('2')
    expect(screen.getByRole('table', { name: 'Cluster operators' })).toBeInTheDocument()
  })

  it('switches tabs', async () => {
    renderCluster()
    await screen.findByText('dns')
    fireEvent.click(screen.getByRole('button', { name: 'Cluster Version' }))
    expect(await screen.findByText('Current Version')).toBeInTheDocument()
    expect(screen.getByText('SDN Plugin')).toBeInTheDocument()
    expect(await screen.findByText(/Update Available: v1\.29\.5, v1\.30\.0/)).toBeInTheDocument()
    expect(screen.queryByText('Healthy operators')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Machine Sets' }))
    expect(await screen.findByText('worker-us-east-1a')).toBeInTheDocument()
    expect(screen.getByText('Instance Type')).toBeInTheDocument()
    expect(screen.getByText('c5.xlarge')).toBeInTheDocument()
    // Column order matches the ui/ mock.
    const labels = screen
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
      .filter((t) => t && t.trim())
    expect(labels).toEqual([
      'Name',
      'Desired',
      'Ready',
      'Available',
      'Zone',
      'Instance Type',
      'Age',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Cluster Settings' }))
    expect(screen.getByText('brd-hq-cluster')).toBeInTheDocument()
  })

  it('Cluster Settings sources real config and labels unsourced rows as sample', () => {
    render(
      <MemoryRouter initialEntries={['/cluster/settings']}>
        <ClusterView />
      </MemoryRouter>,
    )
    expect(screen.getByText('brd-hq-cluster')).toBeInTheDocument()
    expect(screen.getByText('v1.33.4')).toBeInTheDocument()
    expect(screen.getByText('https://api.brd-hq-cluster.brd.rw:8443')).toBeInTheDocument()
    expect(screen.queryByText(/example\.com/)).toBeNull()
    expect(within(screen.getByRole('note')).getByText(/[Ss]ample data/)).toBeInTheDocument()
  })
})
