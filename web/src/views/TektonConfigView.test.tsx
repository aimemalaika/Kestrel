import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TektonConfigView } from './TektonConfigView'

describe('TektonConfigView', () => {
  it('shows health tiles and a per-component table', async () => {
    render(
      <MemoryRouter>
        <TektonConfigView />
      </MemoryRouter>,
    )
    expect(await screen.findByText('TektonConfig')).toBeInTheDocument()
    expect(screen.getByTestId('tile-Ready')).toHaveTextContent('5')
    expect(screen.getByTestId('tile-NotReady')).toHaveTextContent('1')
    expect(screen.getByTestId('tile-Installing')).toHaveTextContent('0')
    const table = screen.getByRole('table', { name: 'Tekton components' })
    for (const k of ['TektonPipeline', 'TektonTrigger', 'TektonChain', 'TektonDashboard']) {
      expect(within(table).getByText(k)).toBeInTheDocument()
    }
    const row = within(table).getByText('TektonResult').closest('tr') as HTMLElement
    expect(within(row).getByText('v0.12.0')).toBeInTheDocument()
    expect(within(row).getByText('False')).toBeInTheDocument()
    expect(within(row).getByText('reconciling installer sets')).toBeInTheDocument()
    expect(within(table).getByText('v0.74.0')).toBeInTheDocument()
  })
})
