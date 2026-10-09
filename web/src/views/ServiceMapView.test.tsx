import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

const stream = vi.hoisted(() => ({ rows: [] as unknown[] }))
vi.mock('../table/useResourceStream', () => ({
  useResourceStream: () => ({ rows: stream.rows, status: 'ready' }),
}))

import { ServiceMapView } from './ServiceMapView'

const dep = (name: string, ready: number, replicas = 2) => ({
  apiVersion: 'apps/v1',
  kind: 'Deployment',
  metadata: { name, namespace: 'shop', uid: name },
  spec: { replicas },
  status: { readyReplicas: ready },
})

describe('ServiceMapView', () => {
  it('previews the sample map by default', () => {
    stream.rows = []
    render(<ServiceMapView />)
    expect(screen.queryByText('No service map loaded')).toBeNull()
    expect(screen.getAllByText(/checkout|payments|ledger/i).length).toBeGreaterThan(0)
  })

  it('renders nodes, edges, SLA labels and caveat for the sample', () => {
    stream.rows = []
    render(<ServiceMapView />)
    fireEvent.click(screen.getByText('Load sample'))
    expect(screen.getByTestId('node-checkout')).toHaveTextContent('SLO 99.9%')
    expect(screen.getByTestId('node-checkout')).toHaveTextContent('SLA 99.84%')
    expect(screen.getByTestId('node-ledger')).toHaveTextContent('SLA 99.99%')
    expect(screen.getByTestId('edge-checkout-payments')).toHaveAttribute('data-critical', 'true')
    expect(screen.getByTestId('edge-checkout-inventory')).toHaveAttribute('data-critical', 'false')
    expect(screen.getByText(/assumes independent failures and no redundancy/)).toBeInTheDocument()
  })

  it('lists validation errors without a graph', () => {
    render(<ServiceMapView />)
    fireEvent.change(screen.getByLabelText('ServiceMap YAML'), {
      target: {
        value:
          'apiVersion: kestrel.dev/v1\nkind: ServiceMap\nservices:\n  - {id: a, slo: 99, dependsOn: [{id: ghost}]}\n',
      },
    })
    fireEvent.click(screen.getByText('Render map'))
    expect(
      within(screen.getByRole('alert')).getByText(/undeclared service "ghost"/),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('node-a')).toBeNull()
  })

  it('colors node health from the stream', () => {
    stream.rows = [dep('checkout', 0), dep('payments', 1), dep('ledger', 2)]
    render(<ServiceMapView />)
    fireEvent.click(screen.getByText('Load sample'))
    expect(screen.getByTestId('node-checkout')).toHaveAttribute('data-health', 'down')
    expect(screen.getByTestId('node-payments')).toHaveAttribute('data-health', 'degraded')
    // ledger is a StatefulSet binding but mock returns same rows for any gvr; name-matched
    expect(screen.getByTestId('node-ledger')).toHaveAttribute('data-health', 'healthy')
    // not present in rows -> unknown, never healthy
    expect(screen.getByTestId('node-inventory')).toHaveAttribute('data-health', 'unknown')
  })

  it('click flagged node shows weakest-link callout', () => {
    stream.rows = []
    render(<ServiceMapView />)
    fireEvent.click(screen.getByText('Load sample'))
    fireEvent.click(screen.getByTestId('node-checkout'))
    expect(screen.getByTestId('callout')).toHaveTextContent('≤ 99.84%, limited by payments')
    expect(screen.getByTestId('edge-checkout-payments')).toHaveAttribute('data-highlighted', 'true')
  })
})
