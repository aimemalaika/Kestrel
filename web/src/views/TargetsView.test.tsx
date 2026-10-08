import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TargetsView } from './TargetsView'

describe('TargetsView', () => {
  it('filters by state', () => {
    render(<TargetsView />)
    expect(screen.getByRole('table', { name: 'Scrape targets' })).toBeInTheDocument()
    expect(screen.getAllByText('Healthy').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Error').length).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'down' }))
    expect(screen.queryByText('Healthy')).toBeNull()
    expect(screen.getAllByText('Error').length).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'up' }))
    expect(screen.queryByText('Error')).toBeNull()
  })
  it('filters by search', () => {
    render(<TargetsView />)
    fireEvent.change(screen.getByLabelText('Filter by name'), { target: { value: 'kubelet' } })
    expect(screen.getAllByRole('row')).toHaveLength(2)
  })
})
