import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SubjectMatrix } from './SubjectMatrix'
import { createMockRbac } from './rbacMock'

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
})
