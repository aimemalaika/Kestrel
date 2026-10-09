import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { OperatorsView } from './OperatorsView'

describe('OperatorsView', () => {
  it('renders installed operator cards from the CSV stream', async () => {
    render(<OperatorsView />)
    await waitFor(() => expect(screen.getByText('Metrics Operator')).toBeInTheDocument())
    expect(screen.getByText('Backup Operator')).toBeInTheDocument()
    expect(screen.getAllByText('Succeeded').length).toBeGreaterThan(0)
    expect(screen.getByText('Installing')).toBeInTheDocument()
  })

  it('shows the channel footer and switches to the OperatorHub tab', async () => {
    render(<OperatorsView />)
    await waitFor(() => expect(screen.getByText('Metrics Operator')).toBeInTheDocument())
    expect(screen.getAllByText(/^Channel:/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'OperatorHub' }))
    expect(screen.getByText('Stream Broker')).toBeInTheDocument()
  })
})
