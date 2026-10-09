import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmBrowser } from './HelmBrowser'
import { createMockHelm } from './helmMock'

function setup() {
  render(
    <MemoryRouter>
      <HelmBrowser client={createMockHelm()} />
    </MemoryRouter>,
  )
}

describe('HelmBrowser', () => {
  it('renders releases', async () => {
    setup()
    expect(await screen.findByRole('button', { name: 'orders-db' })).toBeInTheDocument()
    expect(screen.getAllByText('deployed').length).toBeGreaterThan(1)
    expect(screen.getByText('failed')).toBeInTheDocument()
  })

  it('drills into a release detail', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'edge-proxy' }))
    expect(await screen.findByText('Revision')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('edge-proxy-4.11.2')).toBeInTheDocument()
    expect(screen.getByText(/replicaCount: 2/)).toBeInTheDocument()
  })

  it('browses a chart repo', async () => {
    setup()
    fireEvent.click(screen.getByRole('tab', { name: 'Chart repos' }))
    fireEvent.click(await screen.findByRole('button', { name: 'stable' }))
    expect(await screen.findByText('cache')).toBeInTheDocument()
    expect(screen.getByText('Relational database')).toBeInTheDocument()
  })
})
