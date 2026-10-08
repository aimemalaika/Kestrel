import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ClusterView } from './ClusterView'

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
    fireEvent.click(screen.getByRole('button', { name: 'Cluster Settings' }))
    expect(screen.getByText('kestrel-cluster')).toBeInTheDocument()
  })
})
