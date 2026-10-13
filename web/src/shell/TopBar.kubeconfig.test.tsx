import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'

type AuthValue = {
  status: string
  mode: 'single-operator' | 'oidc'
  identity: { name: string; groups?: string[] } | null
  options: never[]
  signOut: () => void
}

let authValue: AuthValue
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => authValue,
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('../cluster/useClusterInfo', () => ({
  useClusterInfo: () => ({ info: undefined, error: false }),
}))

import { TopBar } from './TopBar'

const OIDC: AuthValue = {
  status: 'authed',
  mode: 'oidc',
  identity: { name: 'alice@corp.com', groups: ['devs'] },
  options: [],
  signOut: () => {},
}
const SINGLE: AuthValue = {
  status: 'authed',
  mode: 'single-operator',
  identity: { name: 'kestrel-operator' },
  options: [],
  signOut: () => {},
}

function renderTopBar() {
  return render(
    <MemoryRouter initialEntries={['/overview']}>
      <TopBar
        perspective="admin"
        canAdmin
        onPerspectiveChange={() => {}}
        terminalOpen={false}
        onToggleTerminal={() => {}}
      />
    </MemoryRouter>,
  )
}

const writeText = vi.fn().mockResolvedValue(undefined)
beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText } })
  writeText.mockClear()
})
afterEach(() => vi.clearAllMocks())

describe('TopBar kubeconfig menu (oidc)', () => {
  beforeEach(() => {
    authValue = OIDC
  })

  it('shows download kubeconfig + copy login command', () => {
    renderTopBar()
    fireEvent.click(screen.getByRole('button', { name: 'User menu' }))
    const dl = screen.getByRole('menuitem', { name: /download kubeconfig/i })
    expect(dl).toHaveAttribute('href', '/api/kubeconfig')
    expect(screen.getByRole('menuitem', { name: /copy login command/i })).toBeInTheDocument()
  })

  it('copy login command writes the command to the clipboard', async () => {
    renderTopBar()
    fireEvent.click(screen.getByRole('button', { name: 'User menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /copy login command/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('kubectl')))
  })
})

describe('TopBar kubeconfig menu (single-operator)', () => {
  beforeEach(() => {
    authValue = SINGLE
  })

  it('hides both kubeconfig items', () => {
    renderTopBar()
    fireEvent.click(screen.getByRole('button', { name: 'User menu' }))
    expect(screen.queryByRole('menuitem', { name: /download kubeconfig/i })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /copy login command/i })).toBeNull()
  })
})
