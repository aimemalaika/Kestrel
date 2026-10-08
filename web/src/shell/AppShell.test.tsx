import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from './AppShell'
import { AuthProvider } from '../auth/AuthProvider'
import { setIdentity, IDENTITY_PRESETS } from '../auth/identity'

function renderShell() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/overview']}>
        <AppShell />
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe('AppShell', () => {
  afterEach(() => setIdentity(null))

  it('shows no shell chrome when signed out', () => {
    setIdentity(null)
    renderShell()
    expect(screen.queryByTestId('sidebar')).toBeNull()
  })

  describe('signed in', () => {
    beforeEach(() => setIdentity(IDENTITY_PRESETS[0]))

    it('renders Kestrel wordmark, breadcrumb, and catalog nav', async () => {
      renderShell()
      expect(screen.getByText('Kestrel')).toBeInTheDocument()
      expect(screen.queryByText('OKD')).toBeNull()
      expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Overview')
      expect(await screen.findByRole('link', { name: 'Pods' })).toBeInTheDocument()
    })

    it('perspective toggle switches the sidebar sections', () => {
      renderShell()
      const toggle = within(screen.getByRole('group', { name: 'Perspective' }))
      expect(screen.getByRole('button', { name: /^Operators/ })).toBeInTheDocument()
      expect(toggle.getByRole('button', { name: 'Admin' })).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(toggle.getByRole('button', { name: 'Developer' }))
      expect(toggle.getByRole('button', { name: 'Developer' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      expect(screen.queryByRole('button', { name: /^Operators/ })).toBeNull()
      expect(screen.getByRole('link', { name: 'Helm Releases' })).toBeInTheDocument()
      fireEvent.click(toggle.getByRole('button', { name: 'Admin' }))
      expect(screen.getByRole('button', { name: /^Operators/ })).toBeInTheDocument()
    })

    it('header has cluster pill, notifications dropdown and help', () => {
      renderShell()
      expect(screen.getByTestId('cluster-pill')).toHaveTextContent('kestrel-cluster')
      expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
      expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument()
      expect(screen.queryByText('No notifications')).toBeNull()
    })

    it('collapses the sidebar to an icon rail', () => {
      renderShell()
      const aside = screen.getByTestId('sidebar')
      expect(aside.className).toContain('w-56')
      fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
      expect(aside.className).toContain('w-12')
    })

    it('user menu shows identity and signs out', () => {
      renderShell()
      fireEvent.click(screen.getByRole('button', { name: 'User menu' }))
      expect(screen.getByText('operator')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
      expect(screen.queryByTestId('sidebar')).toBeNull()
    })

    it('user menu: focuses item on open, Escape closes and restores trigger focus', () => {
      renderShell()
      const trigger = screen.getByRole('button', { name: 'User menu' })
      fireEvent.click(trigger)
      const item = screen.getByRole('menuitem', { name: 'Sign out' })
      expect(item).toHaveFocus()
      fireEvent.keyDown(item, { key: 'ArrowDown' })
      expect(item).toHaveFocus() // single item wraps to itself
      fireEvent.keyDown(item, { key: 'Escape' })
      expect(screen.queryByRole('menu')).toBeNull()
      expect(trigger).toHaveFocus()
    })

    it('header search opens the command palette', () => {
      renderShell()
      expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Search' }))
      expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
    })
  })
})
