import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MetricsView } from './MetricsView'

describe('MetricsView', () => {
  it('renders query input, run button and sample result', () => {
    render(<MetricsView />)
    expect(screen.getByLabelText('Metrics query')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /run/i })).toBeInTheDocument()
    expect(screen.getByTestId('sample-series')).toBeInTheDocument()
  })
})
