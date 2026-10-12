import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthProvider'
import { TopBar } from './TopBar'
import { firingAlerts } from '../modules/alerts/alertsMock'

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

function renderAt(path: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <TopBar perspective="admin" onPerspectiveChange={() => {}} />
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

describe('TopBar cluster pill', () => {
  it('shows the real cluster name and server version, not the hardcoded placeholder', async () => {
    renderAt('/overview')
    const pill = screen.getByTestId('cluster-pill')
    expect(await within(pill).findByText('brd-hq-cluster')).toBeInTheDocument()
    expect(within(pill).getByText('v1.33.4')).toBeInTheDocument()
    expect(screen.queryByText('kestrel-cluster')).toBeNull()
  })
})

describe('TopBar notification bell', () => {
  it('shows firing count and lists firing alerts in the dropdown', () => {
    render(
      <AuthProvider>
        <MemoryRouter>
          <TopBar perspective="admin" onPerspectiveChange={() => {}} />
        </MemoryRouter>
      </AuthProvider>,
    )
    const bell = screen.getByRole('button', { name: 'Notifications' })
    const n = firingAlerts().length
    expect(bell).toHaveTextContent(String(n))
    fireEvent.click(bell)
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument()
    expect(screen.getByText(firingAlerts()[0].name, { exact: false })).toBeInTheDocument()
    expect(screen.queryByText('No notifications')).toBeNull()
  })

  it('discloses that notifications are sample data', () => {
    render(
      <AuthProvider>
        <MemoryRouter>
          <TopBar perspective="admin" onPerspectiveChange={() => {}} />
        </MemoryRouter>
      </AuthProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(screen.getByText(/Sample data/)).toBeInTheDocument()
  })
})
