import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { SubjectMatrix } from './SubjectMatrix'
import { createMockRbac } from './rbacMock'
import type { RBACClient } from './RBACClient'

describe('SubjectMatrix', () => {
  it('renders a User subject matrix', async () => {
    render(<SubjectMatrix subject={{ kind: 'User', name: 'alice' }} client={createMockRbac()} />)
    expect(await screen.findByText('alice')).toBeInTheDocument()
    expect(screen.getAllByText('RO:alice-pods/pod-reader').length).toBeGreaterThan(0)
  })

  it('renders a Group subject matrix', async () => {
    render(
      <SubjectMatrix
        subject={{ kind: 'Group', name: 'platform-admins' }}
        client={createMockRbac()}
      />,
    )
    expect(await screen.findByText('apps/deployments')).toBeInTheDocument()
  })

  it('shows the empty state for an unknown group', async () => {
    render(<SubjectMatrix subject={{ kind: 'Group', name: 'nobody' }} client={createMockRbac()} />)
    expect(await screen.findByText(/No permissions found/)).toBeInTheDocument()
  })

  const carol = () =>
    render(<SubjectMatrix subject={{ kind: 'User', name: 'carol' }} client={createMockRbac()} />)
  const section = (title: RegExp) =>
    screen.getByRole('heading', { name: title }).closest('section') as HTMLElement

  it('groups access into cluster-wide and per-namespace sections', async () => {
    carol()
    expect(await screen.findByRole('heading', { name: 'Cluster-wide' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Namespace: production' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Namespace: staging' })).toBeInTheDocument()
    expect(within(section(/Cluster-wide/)).getByText('/pods')).toBeInTheDocument()
    expect(within(section(/production/)).getByText('apps/deployments')).toBeInTheDocument()
    expect(within(section(/staging/)).getByText('/configmaps')).toBeInTheDocument()
  })

  it('does not render a grant under another namespace', async () => {
    carol()
    await screen.findByRole('heading', { name: 'Cluster-wide' })
    expect(within(section(/production/)).queryByText('/configmaps')).toBeNull()
    expect(within(section(/staging/)).queryByText('apps/deployments')).toBeNull()
  })

  it('filters within scopes and skips emptied scopes', async () => {
    carol()
    await screen.findByRole('heading', { name: 'Cluster-wide' })
    fireEvent.change(screen.getByLabelText('Filter resources'), { target: { value: 'deploy' } })
    expect(screen.getByRole('heading', { name: 'Namespace: production' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Cluster-wide' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Namespace: staging' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Filter resources'), { target: { value: 'zzz' } })
    expect(screen.getByText(/No permissions found/)).toBeInTheDocument()
  })

  it('shows a truncation note', async () => {
    const client: RBACClient = {
      access: () => Promise.resolve({ subject: 'x', truncated: true, scopes: [] }),
    }
    render(<SubjectMatrix subject={{ kind: 'User', name: 'x' }} client={client} />)
    expect(await screen.findByText(/access may be larger/)).toBeInTheDocument()
  })
})
