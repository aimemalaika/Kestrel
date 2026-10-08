import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EventsView } from './EventsView'

describe('EventsView', () => {
  it('lists events newest-first with type and reason', async () => {
    render(<EventsView />)
    await screen.findByText('OOMKilled')
    expect(screen.getAllByText('Warning').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Normal').length).toBeGreaterThan(0)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.length).toBeGreaterThan(1)
    // verify descending order by age: seconds/min/hours/days units ascend
    const ages = rows.map((r) => r.lastElementChild!.textContent ?? '')
    const secs = ages.map((a) => {
      const n = parseInt(a, 10)
      const u = a.slice(-1)
      return n * ({ s: 1, m: 60, h: 3600, d: 86400 } as Record<string, number>)[u]
    })
    expect(secs).toEqual([...secs].sort((a, b) => a - b))
  })
})
