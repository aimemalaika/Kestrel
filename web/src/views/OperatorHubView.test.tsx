import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OperatorHubView } from './OperatorHubView'

describe('OperatorHubView', () => {
  it('renders the catalog and filters by category', () => {
    render(<OperatorHubView />)
    expect(screen.getByText('Stream Broker')).toBeInTheDocument()
    expect(screen.getByText('Model Serving')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'AI/ML' }))
    expect(screen.getByText('Model Serving')).toBeInTheDocument()
    expect(screen.queryByText('Stream Broker')).not.toBeInTheDocument()
  })

  it('lands on the OperatorHub tab', () => {
    render(<OperatorHubView />)
    expect(screen.getByRole('button', { name: 'OperatorHub' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
