import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AlertsView } from './AlertsView'
import { ALERTS, ALERT_RULES } from '../modules/alerts/alertsMock'

describe('AlertsView', () => {
  it('Alerts tab renders a severity card per alert with runbook and actions', () => {
    render(<AlertsView />)
    for (const a of ALERTS) expect(screen.getByText(a.name)).toBeInTheDocument()
    expect(screen.getAllByText('critical').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /Runbook/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Silence' }).length).toBe(ALERTS.length)
  })

  it('Silences tab shows empty state; Alert Rules tab shows table', () => {
    render(<AlertsView />)
    fireEvent.click(screen.getByRole('button', { name: 'Silences' }))
    expect(screen.getByText('No active silences')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Alert Rules' }))
    expect(screen.getByRole('table', { name: 'Alert rules' })).toBeInTheDocument()
    expect(screen.getByText(ALERT_RULES[0].name)).toBeInTheDocument()
  })
})
