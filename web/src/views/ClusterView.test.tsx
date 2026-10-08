import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ClusterView } from './ClusterView'

describe('ClusterView', () => {
  it('Cluster Operators tab shows health tiles and table', async () => {
    render(<ClusterView />)
    expect(await screen.findByText('dns')).toBeInTheDocument()
    expect(screen.getByText('ingress')).toBeInTheDocument()
    expect(screen.getByText('storage')).toBeInTheDocument()
    expect(screen.getByText('Healthy operators')).toBeInTheDocument()
    expect(screen.getByTestId('tile-Healthy')).toHaveTextContent('1')
    expect(screen.getByTestId('tile-Progressing')).toHaveTextContent('1')
    expect(screen.getByTestId('tile-Degraded')).toHaveTextContent('1')
    expect(screen.getByRole('table', { name: 'Cluster operators' })).toBeInTheDocument()
  })

  it('switches tabs', async () => {
    render(<ClusterView />)
    await screen.findByText('dns')
    fireEvent.click(screen.getByRole('button', { name: 'Cluster Version' }))
    expect(await screen.findByText('Current Version')).toBeInTheDocument()
    expect(screen.queryByText('Healthy operators')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Machine Sets' }))
    expect(await screen.findByText('worker-us-east-1a')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cluster Settings' }))
    expect(screen.getByText('kestrel-cluster')).toBeInTheDocument()
  })
})
