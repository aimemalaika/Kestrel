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
    expect(await screen.findByRole('button', { name: 'postgres' })).toBeInTheDocument()
    expect(screen.getByText('deployed')).toBeInTheDocument()
    expect(screen.getByText('failed')).toBeInTheDocument()
  })

  it('drills into a release detail', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'ingress-nginx' }))
    expect(await screen.findByText('Revision')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('ingress-nginx-4.11.2')).toBeInTheDocument()
    expect(screen.getByText(/replicaCount: 2/)).toBeInTheDocument()
  })

  it('browses a chart repo', async () => {
    setup()
    fireEvent.click(screen.getByRole('tab', { name: 'Chart repos' }))
    fireEvent.click(await screen.findByRole('button', { name: 'bitnami' }))
    expect(await screen.findByText('redis')).toBeInTheDocument()
    expect(screen.getByText('PostgreSQL relational database')).toBeInTheDocument()
  })
})
