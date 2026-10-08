import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DashboardsView } from './DashboardsView'

describe('DashboardsView', () => {
  it('renders placeholder panels with pending notice', () => {
    render(<DashboardsView />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText(/Metrics pending — not wired to a metrics source/)).toBeInTheDocument()
    expect(screen.getByText('Cluster CPU')).toBeInTheDocument()
    expect(screen.getByText('Pod count')).toBeInTheDocument()
  })
})
