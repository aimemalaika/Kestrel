import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DetailPanel } from './DetailPanel'
import type { K8sObject } from '../contract/types'

const pod: K8sObject = {
  apiVersion: 'v1',
  kind: 'Pod',
  metadata: {
    name: 'web-1',
    namespace: 'default',
    uid: 'u1',
    labels: { app: 'web' },
    creationTimestamp: '2020-01-01T00:00:00Z',
    ownerReferences: [{ apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'web-rs', uid: 'rs1' }],
  },
  status: { phase: 'Running' },
}

describe('DetailPanel', () => {
  it('renders metadata, labels, status, and owner refs', () => {
    render(<DetailPanel object={pod} />)
    expect(screen.getByText('web-1')).toBeInTheDocument()
    expect(screen.getByText('default')).toBeInTheDocument()
    expect(screen.getByText('app')).toBeInTheDocument()
    expect(screen.getByText('web')).toBeInTheDocument()
    expect(screen.getByText('web-rs')).toBeInTheDocument() // owner ref
    expect(screen.getByText(/Running/)).toBeInTheDocument() // status json
  })
})
