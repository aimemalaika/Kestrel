import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ArgoRichView } from './ArgoRichView'
import type { K8sObject } from '../../contract/types'

const app = {
  apiVersion: 'argoproj.io/v1alpha1',
  kind: 'Application',
  metadata: { name: 'payments', namespace: 'argocd' },
  spec: {
    project: 'default',
    source: { repoURL: 'https://git.example/payments', path: 'deploy', targetRevision: 'main' },
    destination: { server: 'https://kubernetes.default.svc', namespace: 'payments' },
  },
  status: {
    sync: { status: 'OutOfSync' },
    health: { status: 'Degraded' },
    resources: [
      {
        group: 'apps',
        version: 'v1',
        kind: 'Deployment',
        name: 'payments-api',
        namespace: 'payments',
        status: 'OutOfSync',
        health: 'Degraded',
      },
      { group: '', version: 'v1', kind: 'Service', name: 'payments-svc', namespace: 'payments' },
    ],
  },
} as unknown as K8sObject

describe('ArgoRichView', () => {
  it('renders sync, health, source and resource tree', () => {
    render(<ArgoRichView object={app} />)
    expect(screen.getAllByText('OutOfSync').length).toBe(2)
    expect(screen.getAllByText('Degraded').length).toBe(2)
    expect(screen.getByText('https://git.example/payments')).toBeTruthy()
    expect(screen.getByText('https://kubernetes.default.svc')).toBeTruthy()
    expect(screen.getByText('payments-api')).toBeTruthy()
    expect(screen.getByText('payments-svc')).toBeTruthy()
    expect(screen.getByText('Deployment')).toBeTruthy()
  })
})
