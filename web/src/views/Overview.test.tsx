import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { Overview } from './Overview'

describe('Overview', () => {
  it('renders counts and health rollups', async () => {
    render(<Overview />)
    await waitFor(() => {
      expect(within(screen.getByTestId('card-nodes')).getByText('2')).toBeInTheDocument()
    })
    const nodes = within(screen.getByTestId('card-nodes'))
    expect(nodes.getByText('1 Ready')).toBeInTheDocument()
    expect(nodes.getByText('1 Not ready')).toBeInTheDocument()
    expect(within(screen.getByTestId('card-pods')).getByText(/Running/)).toBeInTheDocument()
    expect(screen.getByTestId('card-deployments')).toBeInTheDocument()
    expect(screen.getByTestId('card-namespaces')).toBeInTheDocument()
  })
})
