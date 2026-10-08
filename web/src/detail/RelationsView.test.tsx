import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { K8sObject } from '../contract/types'

const pod = (name: string, ownerUid: string): K8sObject => ({
  apiVersion: 'v1',
  kind: 'Pod',
  metadata: {
    name,
    namespace: 'default',
    uid: `uid-${name}`,
    ownerReferences: [{ apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'rs-1', uid: ownerUid }],
  },
})

vi.mock('../table/useResourceStream', () => ({
  useResourceStream: () => ({
    rows: [pod('child-pod', 'uid-rs-1'), pod('other-pod', 'uid-other')],
    status: 'ready',
  }),
}))

import { RelationsView } from './RelationsView'

describe('RelationsView', () => {
  it('renders owner and streamed children', () => {
    const rs: K8sObject = {
      apiVersion: 'apps/v1',
      kind: 'ReplicaSet',
      metadata: {
        name: 'rs-1',
        namespace: 'default',
        uid: 'uid-rs-1',
        ownerReferences: [
          { apiVersion: 'apps/v1', kind: 'Deployment', name: 'dep-1', uid: 'uid-dep' },
        ],
      },
    }
    render(
      <MemoryRouter>
        <RelationsView object={rs} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Deployment/dep-1')).toBeInTheDocument()
    expect(screen.getByText('Pod/child-pod')).toBeInTheDocument()
    expect(screen.queryByText('Pod/other-pod')).toBeNull()
    expect(screen.getByRole('link', { name: 'Deployment/dep-1' }).getAttribute('href')).toBe(
      '/ns/default/apps/v1/deployments/dep-1',
    )
  })
})
