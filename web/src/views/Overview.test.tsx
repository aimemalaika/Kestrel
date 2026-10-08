import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Overview } from './Overview'

describe('Overview', () => {
  it('renders status tiles, stat cards, charts and bottom panels', async () => {
    render(<Overview />)
    expect(screen.getByText('Cluster Health')).toBeInTheDocument()
    for (const l of ['Nodes', 'Pods', 'Deployments', 'Services', 'Routes', 'Alerts']) {
      expect(screen.getAllByText(l).length).toBeGreaterThan(0)
    }
    expect(screen.getByText('CPU Usage')).toBeInTheDocument()
    expect(screen.getByText('Recent Events')).toBeInTheDocument()
    expect(screen.getByText('Namespace Resources')).toBeInTheDocument()
    expect(screen.getByText('Active Alerts')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('5 / 6 nodes ready')).toBeInTheDocument()
    })
    expect(screen.getByText('1 NotReady')).toBeInTheDocument()
  })

  it('shows sample metrics, status values and firing alerts', () => {
    render(<Overview />)
    expect(screen.getByText('v1.29.3')).toBeInTheDocument()
    expect(screen.getByText('58 MB/s')).toBeInTheDocument()
    expect(screen.getByText('NodeNotReady')).toBeInTheDocument()
  })

  it('has a View all events button and derived Routes/Alerts sublabels', async () => {
    render(<Overview />)
    expect(screen.getByRole('button', { name: 'View all' })).toBeInTheDocument()
    expect(screen.getByText(/\d+ critical, \d+ warning/)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/^[1-9]\d* admitted$/)).toBeInTheDocument()
    })
  })
})
