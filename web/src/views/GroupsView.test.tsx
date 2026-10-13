import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GroupsView } from './GroupsView'
import { setIdentity } from '../auth/identity'

const bindings = vi.hoisted(() => ({
  rb: [
    {
      metadata: { name: 'rb1', namespace: 'shop', uid: '1' },
      roleRef: { name: 'edit' },
      subjects: [
        { kind: 'User', name: 'bob' },
        { kind: 'Group', name: 'devs' },
      ],
    },
  ],
  crb: [
    {
      metadata: { name: 'crb1', uid: '2' },
      roleRef: { name: 'cluster-reader' },
      subjects: [
        { kind: 'User', name: 'alice' },
        { kind: 'Group', name: 'admins' },
      ],
    },
  ],
}))
vi.mock('../table/useResourceStream', () => ({
  useResourceStream: (gvr: { resource: string }) => ({
    status: 'ready',
    rows: gvr.resource === 'rolebindings' ? bindings.rb : bindings.crb,
  }),
}))
vi.mock('../modules/rbac/SubjectMatrix', () => ({
  SubjectMatrix: ({ subject }: { subject: { kind: string; name: string } }) => (
    <div data-testid="matrix">
      {subject.kind}:{subject.name}
    </div>
  ),
}))

beforeEach(() => {
  setIdentity({ name: 'bob', groups: ['devs'] })
})

describe('GroupsView', () => {
  it('shows the caveat and the subject list', () => {
    render(<GroupsView />)
    expect(screen.getByText(/not every identity that can authenticate/)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Groups' })).toBeInTheDocument()
  })
  it('marks the current identity', () => {
    render(<GroupsView />)
    expect(screen.getByText('(your group)')).toBeInTheDocument()
  })
  it('shows the matrix and bindings when selected', () => {
    render(<GroupsView />)
    expect(screen.queryByTestId('matrix')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /admins/ }))
    expect(screen.getByTestId('matrix')).toHaveTextContent('Group:admins')
    expect(screen.getByText('crb1')).toBeInTheDocument()
  })
})
