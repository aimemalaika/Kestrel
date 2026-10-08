import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { OperatorsView } from './OperatorsView'

describe('OperatorsView', () => {
  it('renders installed operator cards from the CSV stream', async () => {
    render(<OperatorsView />)
    await waitFor(() => expect(screen.getByText('Metrics Operator')).toBeInTheDocument())
    expect(screen.getByText('Backup Operator')).toBeInTheDocument()
    expect(screen.getByText('Succeeded')).toBeInTheDocument()
    expect(screen.getByText('Installing')).toBeInTheDocument()
  })
})
