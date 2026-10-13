import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { EventListenerDetail } from './EventListenerDetail'
import type { K8sObject } from '../../contract/types'

const mk = (over: Record<string, unknown> = {}): K8sObject =>
  ({
    apiVersion: 'triggers.tekton.dev/v1beta1',
    kind: 'EventListener',
    metadata: { name: 'gh', namespace: 'shop' },
    spec: {
      triggers: [
        {
          name: 'github-push',
          bindings: [{ ref: 'b1' }, { ref: 'b2' }],
          template: { ref: 'tmpl-1' },
          interceptors: [{ ref: { name: 'github' } }],
        },
      ],
    },
    status: {
      address: { url: 'http://el-gh.shop.svc:8080' },
      conditions: [{ type: 'Ready', status: 'True', reason: 'MinimumReplicasAvailable' }],
    },
    ...over,
  }) as unknown as K8sObject

describe('EventListenerDetail', () => {
  it('renders sink, Ready badge and trigger wiring', () => {
    render(<EventListenerDetail object={mk()} />)
    expect(screen.getByText('http://el-gh.shop.svc:8080')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('github-push')).toBeInTheDocument()
    expect(screen.getByText('tmpl-1')).toBeInTheDocument()
    expect(screen.getByText('b1, b2')).toBeInTheDocument()
    expect(screen.getByText('github')).toBeInTheDocument()
    expect(screen.getByText('MinimumReplicasAvailable')).toBeInTheDocument()
  })

  it('tolerates missing fields', () => {
    render(<EventListenerDetail object={mk({ spec: {}, status: {} })} />)
    expect(screen.getByText('No triggers')).toBeInTheDocument()
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })
})
