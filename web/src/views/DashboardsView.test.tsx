import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DashboardsView } from './DashboardsView'

describe('DashboardsView', () => {
  it('renders sample panels with sample notice', () => {
    render(<DashboardsView />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText(/Sample data — no metrics source connected/)).toBeInTheDocument()
    expect(screen.getByText('Cluster CPU')).toBeInTheDocument()
    expect(screen.getByText('Pod count')).toBeInTheDocument()
  })
})
