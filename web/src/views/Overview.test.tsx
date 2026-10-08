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
      expect(screen.getByText('1 / 2 nodes ready')).toBeInTheDocument()
    })
    expect(screen.getByText('1 NotReady')).toBeInTheDocument()
  })

  it('shows metrics as placeholders (not yet wired to a metrics source)', () => {
    render(<Overview />)
    expect(screen.getAllByText('Metrics pending').length).toBeGreaterThan(0)
  })
})
