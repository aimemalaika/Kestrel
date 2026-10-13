import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthProvider'
import { TopBar } from './TopBar'

// The cluster pill reads cluster identity through this hook; pin it so the pill
// has a deterministic real-cluster value across these tests.
vi.mock('../cluster/useClusterInfo', () => ({
  useClusterInfo: () => ({
    info: {
      clusterName: 'brd-hq-cluster',
      serverVersion: 'v1.33.4',
      apiServerURL: 'https://api.brd-hq-cluster.brd.rw:8443',
    },
    error: false,
  }),
}))

function renderAt(
  path: string,
  props: {
    terminalOpen?: boolean
    onToggleTerminal?: () => void
    onPerspectiveChange?: (p: 'admin' | 'developer') => void
    canAdmin?: boolean
  } = {},
) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <TopBar
          perspective="admin"
          canAdmin={props.canAdmin ?? true}
          onPerspectiveChange={props.onPerspectiveChange ?? (() => {})}
          terminalOpen={props.terminalOpen ?? false}
          onToggleTerminal={props.onToggleTerminal ?? (() => {})}
        />
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe('TopBar namespace selector visibility', () => {
  it('shows the namespace selector on resource views', () => {
    renderAt('/ns/_all/core/v1/pods')
    expect(screen.getByRole('combobox', { name: /namespace/i })).toBeInTheDocument()
  })

  it('hides the namespace selector on Overview (not namespace-scoped)', () => {
    renderAt('/overview')
    expect(screen.queryByRole('combobox', { name: /namespace/i })).toBeNull()
  })

  it('hides the namespace selector on Projects (it is the namespace list)', () => {
    renderAt('/projects')
    expect(screen.queryByRole('combobox', { name: /namespace/i })).toBeNull()
  })
})

describe('TopBar user preferences', () => {
  it('opens a preferences modal and persists the default perspective', async () => {
    const onPerspectiveChange = vi.fn()
    renderAt('/overview', { onPerspectiveChange })
    fireEvent.click(await screen.findByRole('button', { name: 'User menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /user preferences/i }))
    const dialog = screen.getByRole('dialog', { name: /user preferences/i })
    const select = within(dialog).getByRole('combobox', { name: /default perspective/i })
    fireEvent.change(select, { target: { value: 'developer' } })
    expect(onPerspectiveChange).toHaveBeenCalledWith('developer')
    const { loadDefaultPerspective } = await import('./perspectivePref')
    expect(loadDefaultPerspective()).toBe('developer')
  })
})

describe('TopBar perspective gating', () => {
  it('shows the toggle and Administrator option to admins', async () => {
    renderAt('/overview')
    expect(screen.getByRole('group', { name: 'Perspective' })).toBeInTheDocument()
  })

  it('hides the toggle and Administrator option from non-admins and never stores admin', async () => {
    localStorage.setItem('kestrel.defaultPerspective', 'admin')
    renderAt('/overview', { canAdmin: false })
    expect(screen.queryByRole('group', { name: 'Perspective' })).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'User menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /user preferences/i }))
    const dialog = screen.getByRole('dialog', { name: /user preferences/i })
    const select = within(dialog).getByRole('combobox', { name: /default perspective/i })
    expect(within(select).queryByRole('option', { name: 'Administrator' })).toBeNull()
    expect((select as HTMLSelectElement).value).toBe('developer')
  })
})

describe('TopBar Terminal button', () => {
  it('is live and toggles the terminal drawer', () => {
    const onToggleTerminal = vi.fn()
    renderAt('/overview', { onToggleTerminal })
    const btn = screen.getByRole('button', { name: 'Terminal' })
    expect(btn).not.toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(btn)
    expect(onToggleTerminal).toHaveBeenCalledTimes(1)
  })

  it('reflects the open state via aria-expanded', () => {
    renderAt('/overview', { terminalOpen: true })
    expect(screen.getByRole('button', { name: 'Terminal' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })
})

describe('TopBar Help menu', () => {
  it('Help is a live menu trigger (not a dead control)', () => {
    renderAt('/overview')
    const help = screen.getByRole('button', { name: 'Help' })
    expect(help).not.toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(help)
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})

describe('TopBar cluster pill', () => {
  it('shows the real cluster name and server version, not the hardcoded placeholder', async () => {
    renderAt('/overview')
    const pill = screen.getByTestId('cluster-pill')
    expect(await within(pill).findByText('brd-hq-cluster')).toBeInTheDocument()
    expect(within(pill).getByText('v1.33.4')).toBeInTheDocument()
    expect(screen.queryByText('kestrel-cluster')).toBeNull()
  })
})
