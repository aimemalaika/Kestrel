import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from './AppShell'
import { AuthProvider } from '../auth/AuthProvider'
import { createMockClient } from '../client/MockClient'
import type { AuthInfo } from '../auth/authInfo'

// Drive the whole shell off a controllable /authinfo while keeping the real mock
// client for everything else (catalog, streams, cluster-info).
let authInfoValue: AuthInfo
vi.mock('../client/createClient', () => ({
  createClient: () => {
    const c = createMockClient()
    return { ...c, authInfo: async () => authInfoValue }
  },
}))

const SINGLE_OPERATOR: AuthInfo = {
  mode: 'single-operator',
  user: { name: 'kestrel-operator' },
  options: [],
}

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
  beforeEach(() => {
    authInfoValue = SINGLE_OPERATOR
  })
  afterEach(() => vi.clearAllMocks())

  it('shows the login screen (no shell chrome) when not authenticated', async () => {
    authInfoValue = {
      mode: 'oidc',
      user: null,
      options: [{ id: 'oidc', label: 'Log in', start: '/auth/login' }],
    }
    renderShell()
    expect(await screen.findByRole('group', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByTestId('sidebar')).toBeNull()
  })

  describe('signed in (single-operator)', () => {
    it('renders Kestrel wordmark, breadcrumb, and catalog nav', async () => {
      renderShell()
      await screen.findByTestId('sidebar')
      // Wait for the cluster pill to resolve so the only remaining "Kestrel" text
      // is the wordmark, not the pill's loading fallback.
      await screen.findByText('kestrel-mock')
      expect(screen.getByText('Kestrel')).toBeInTheDocument()
      expect(screen.queryByText('OKD')).toBeNull()
      expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Overview')
      expect(await screen.findByRole('link', { name: 'Pods' })).toBeInTheDocument()
    })

    it('perspective toggle switches the sidebar sections', async () => {
      renderShell()
      await screen.findByTestId('sidebar')
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

    it('header has cluster pill, notifications dropdown and help', async () => {
      renderShell()
      await screen.findByTestId('sidebar')
      expect(
        await within(screen.getByTestId('cluster-pill')).findByText('kestrel-mock'),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
      expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument()
      expect(screen.queryByText('No notifications')).toBeNull()
    })

    it('collapses the sidebar to an icon rail', async () => {
      renderShell()
      const aside = await screen.findByTestId('sidebar')
      expect(aside.className).toContain('w-56')
      fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
      expect(aside.className).toContain('w-12')
    })

    it('user menu shows the operator identity; no sign-out in single-operator mode', async () => {
      renderShell()
      await screen.findByTestId('sidebar')
      fireEvent.click(screen.getByRole('button', { name: 'User menu' }))
      expect(screen.getAllByText('kestrel-operator').length).toBeGreaterThan(0)
      expect(screen.queryByRole('menuitem', { name: 'Sign out' })).toBeNull()
    })

    it('header search opens the command palette', async () => {
      renderShell()
      await screen.findByTestId('sidebar')
      expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Search' }))
      expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
    })
  })

  describe('signed in (oidc)', () => {
    beforeEach(() => {
      authInfoValue = {
        mode: 'oidc',
        user: { name: 'alice@corp.com', groups: ['devs'] },
        options: [],
      }
    })

    it('user menu shows the real user and a Sign out item', async () => {
      renderShell()
      await screen.findByTestId('sidebar')
      fireEvent.click(screen.getByRole('button', { name: 'User menu' }))
      expect(screen.getAllByText('alice@corp.com').length).toBeGreaterThan(0)
      expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
    })

    it('user menu: focuses first item on open, ArrowDown advances, Escape restores trigger focus', async () => {
      renderShell()
      await screen.findByTestId('sidebar')
      const trigger = screen.getByRole('button', { name: 'User menu' })
      fireEvent.click(trigger)
      const items = screen.getAllByRole('menuitem')
      expect(items[0]).toHaveFocus() // first item focused on open
      fireEvent.keyDown(items[0], { key: 'ArrowDown' })
      expect(items[1]).toHaveFocus() // advances to the next item
      fireEvent.keyDown(items[1], { key: 'Escape' })
      expect(screen.queryByRole('menu')).toBeNull()
      expect(trigger).toHaveFocus()
    })
  })
})
