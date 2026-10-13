import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { K8sObject } from '../../contract/types'
import { RoleAccess } from './RoleAccess'

const bindings: Record<string, K8sObject[]> = {
  rolebindings: [
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: { name: 'rb-ok', namespace: 'default' },
      roleRef: { kind: 'Role', name: 'pod-reader' },
      subjects: [{ kind: 'ServiceAccount', name: 'builder', namespace: 'ci' }],
    },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: { name: 'rb-other-ns', namespace: 'other' },
      roleRef: { kind: 'Role', name: 'pod-reader' },
      subjects: [{ kind: 'User', name: 'mallory' }],
    },
  ],
  clusterrolebindings: [],
}
vi.mock('../../table/useResourceStream', () => ({
  useResourceStream: (gvr: { resource: string }) => ({
    rows: bindings[gvr.resource] ?? [],
    status: 'ready',
  }),
}))

const role = {
  apiVersion: 'rbac.authorization.k8s.io/v1',
  kind: 'Role',
  metadata: { name: 'pod-reader', namespace: 'default' },
  rules: [{ apiGroups: [''], resources: ['pods'], verbs: ['get', 'list'] }],
} as K8sObject

describe('RoleAccess', () => {
  it('renders the matrix and the bound-by subjects', () => {
    render(
      <MemoryRouter>
        <RoleAccess object={role} />
      </MemoryRouter>,
    )
    expect(screen.getByText('/pods')).toBeInTheDocument()
    expect(screen.queryByText('Granted by')).toBeNull()
    expect(screen.getByText('rb-ok')).toBeInTheDocument()
    const link = screen.getByText('ServiceAccount/ci/builder')
    expect(link.closest('a')).toHaveAttribute('href', '/ns/ci/core/v1/serviceaccounts/builder')
    expect(screen.queryByText('rb-other-ns')).toBeNull()
  })
})
