import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { K8sObject } from '../../contract/types'
import { BindingAccess } from './BindingAccess'

let result: { object: K8sObject | undefined; status: string }
const spy = vi.fn()
vi.mock('../../detail/useResourceObject', () => ({
  useResourceObject: (...args: unknown[]) => {
    spy(...args)
    return result
  },
}))

const binding = {
  apiVersion: 'rbac.authorization.k8s.io/v1',
  kind: 'RoleBinding',
  metadata: { name: 'rb', namespace: 'default' },
  roleRef: { kind: 'Role', name: 'pod-reader' },
  subjects: [
    { kind: 'ServiceAccount', name: 'builder', namespace: 'ci' },
    { kind: 'User', name: 'alice' },
  ],
} as K8sObject

const role = {
  apiVersion: 'rbac.authorization.k8s.io/v1',
  kind: 'Role',
  metadata: { name: 'pod-reader', namespace: 'default' },
  rules: [{ apiGroups: [''], resources: ['pods'], verbs: ['get', 'list'] }],
} as K8sObject

const ui = (
  <MemoryRouter>
    <BindingAccess object={binding} />
  </MemoryRouter>
)

describe('BindingAccess', () => {
  beforeEach(() => spy.mockClear())

  it('renders subjects and the referenced role matrix', () => {
    result = { object: role, status: 'ready' }
    render(ui)
    expect(screen.getByText('Subjects')).toBeInTheDocument()
    expect(screen.getByText('ServiceAccount/ci/builder').closest('a')).toHaveAttribute(
      'href',
      '/ns/ci/core/v1/serviceaccounts/builder',
    )
    expect(screen.getByText('User/alice')).toBeInTheDocument()
    expect(screen.getByText('/pods')).toBeInTheDocument()
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ resource: 'roles' }),
      'default',
      'pod-reader',
    )
  })

  it('shows a note when the role is not found', () => {
    result = { object: undefined, status: 'notfound' }
    render(ui)
    expect(screen.getByText(/referenced role not found/i)).toBeInTheDocument()
    expect(screen.getByText('User/alice')).toBeInTheDocument()
  })
})
