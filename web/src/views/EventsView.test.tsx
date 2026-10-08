import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EventsView } from './EventsView'

describe('EventsView', () => {
  it('lists events newest-first with type and reason', async () => {
    render(<EventsView />)
    await screen.findByText('Container exceeded memory limit')
    expect(screen.getAllByTestId('event-type').length).toBeGreaterThan(1)
    const ages = screen.getAllByTestId('event-age').map((a) => a.textContent ?? '')
    const secs = ages.map((a) => {
      const n = parseInt(a, 10)
      const u = a.split(' ')[0].slice(-1)
      return n * ({ s: 1, m: 60, h: 3600, d: 86400 } as Record<string, number>)[u]
    })
    expect(secs).toEqual([...secs].sort((a, b) => a - b))
  })

  it('filters by type chip and search', async () => {
    render(<EventsView />)
    await screen.findByText('Container exceeded memory limit')
    const total = screen.getAllByTestId('event-type').length
    fireEvent.click(screen.getByRole('button', { name: 'Warning' }))
    const warnings = screen.getAllByTestId('event-type')
    expect(warnings.length).toBeLessThan(total)
    warnings.forEach((w) => expect(w).toHaveTextContent('Warning'))
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'memory limit' } })
    expect(screen.getAllByTestId('event-type')).toHaveLength(1)
    expect(screen.getByText('OOMKilled')).toBeInTheDocument()
  })
})
