import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { OperatorHubView } from './OperatorHubView'
import { ToastProvider } from '../toast/ToastProvider'

function renderHub() {
  return render(
    <ToastProvider>
      <OperatorHubView />
    </ToastProvider>,
  )
}

describe('OperatorHubView', () => {
  it('renders the catalog and filters by category', () => {
    renderHub()
    expect(screen.getByText('Stream Broker')).toBeInTheDocument()
    expect(screen.getByText('Model Serving')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'AI/ML' }))
    expect(screen.getByText('Model Serving')).toBeInTheDocument()
    expect(screen.queryByText('Stream Broker')).not.toBeInTheDocument()
  })

  it('lands on the OperatorHub tab', () => {
    renderHub()
    expect(screen.getByRole('button', { name: 'OperatorHub' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('clicking a card opens an install-detail modal', () => {
    renderHub()
    fireEvent.click(screen.getByRole('button', { name: /Stream Broker/ }))
    const dialog = screen.getByRole('dialog', { name: /Stream Broker/ })
    expect(dialog).toHaveTextContent('Channel')
    expect(dialog).toHaveTextContent('Install mode')
    expect(dialog).toHaveTextContent('Databases')
  })

  it('installing flips the badge to Installed and toasts, then offers Reinstall', async () => {
    renderHub()
    fireEvent.click(screen.getByRole('button', { name: /Stream Broker/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Install$/ }))
    // Toast confirms, modal closes.
    expect(await screen.findByRole('status')).toHaveTextContent(/installed/i)
    expect(screen.queryByRole('dialog')).toBeNull()
    // The card badge now reads "Installed".
    const card = screen.getByRole('button', { name: /Stream Broker/ })
    expect(within(card).getByText('Installed')).toBeInTheDocument()
    // Reopening shows Reinstall.
    fireEvent.click(card)
    expect(screen.getByRole('button', { name: /^Reinstall$/ })).toBeInTheDocument()
  })
})
