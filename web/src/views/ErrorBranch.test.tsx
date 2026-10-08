import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../table/useResourceStream', () => ({
  useResourceStream: () => ({ rows: [], status: 'error' }),
}))

import { EventsView } from './EventsView'
import { NodesView } from './NodesView'
import { Overview } from './Overview'

describe('stream error branch', () => {
  it.each([
    ['EventsView', EventsView],
    ['NodesView', NodesView],
    ['Overview', Overview],
  ])('%s shows interrupted message', (_n, C) => {
    render(<C />)
    expect(screen.getByText('Stream interrupted — resyncing…')).toBeInTheDocument()
  })
  it('Overview shows metrics placeholder', () => {
    render(<Overview />)
    expect(screen.getByTestId('card-metrics')).toHaveTextContent('Metrics pending')
  })
})
