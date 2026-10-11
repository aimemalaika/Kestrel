import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

const stream = vi.hoisted(() => ({ rows: [] as unknown[] }))
vi.mock('../table/useResourceStream', () => ({
  useResourceStream: () => ({ rows: stream.rows, status: 'ready' }),
}))

const client = vi.hoisted(() => ({
  getServiceMap: vi.fn(),
  putServiceMap: vi.fn(),
}))
vi.mock('../modules/servicemap/serviceMapClient', () => client)

import { ServiceMapView } from './ServiceMapView'
import { parseServiceMap } from '../modules/servicemap/parse'
import { SAMPLE_YAML } from '../modules/servicemap/sample'
import type { ServiceMapModel } from '../modules/servicemap/types'

const parsed = parseServiceMap(SAMPLE_YAML)
if (!parsed.ok) throw new Error('sample fixture must parse')
const SAMPLE_MODEL: ServiceMapModel = parsed.model
const EMPTY: ServiceMapModel = { name: '', services: [] }

const dep = (name: string, ready: number, replicas = 2) => ({
  apiVersion: 'apps/v1',
  kind: 'Deployment',
  metadata: { name, namespace: 'shop', uid: name },
  spec: { replicas },
  status: { readyReplicas: ready },
})

describe('ServiceMapView', () => {
  beforeEach(() => {
    stream.rows = []
    client.getServiceMap.mockReset()
    client.putServiceMap.mockReset()
    client.getServiceMap.mockResolvedValue(EMPTY)
  })
  afterEach(() => vi.clearAllMocks())

  it('renders the stored map graph on mount', async () => {
    client.getServiceMap.mockResolvedValue(SAMPLE_MODEL)
    render(<ServiceMapView />)
    expect(await screen.findByTestId('node-checkout')).toBeInTheDocument()
    expect(screen.queryByText('No service map loaded')).toBeNull()
  })

  it('shows the empty state when nothing is stored', async () => {
    render(<ServiceMapView />)
    expect(await screen.findByText('No service map loaded')).toBeInTheDocument()
    expect(screen.queryByTestId('node-checkout')).toBeNull()
  })

  it('renders validation errors when an upload 422s', async () => {
    render(<ServiceMapView />)
    await screen.findByText('No service map loaded')
    client.putServiceMap.mockResolvedValue({
      ok: false,
      errors: [{ message: 'undeclared service "ghost"', edge: ['a', 'ghost'] }],
    })
    fireEvent.change(screen.getByLabelText('ServiceMap YAML'), {
      target: { value: 'anything' },
    })
    fireEvent.click(screen.getByText('Render map'))
    expect(
      await within(await screen.findByRole('alert')).findByText(/undeclared service "ghost"/),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('node-a')).toBeNull()
    expect(client.putServiceMap).toHaveBeenCalledWith('anything')
  })

  it('renders the graph when a valid upload is persisted', async () => {
    render(<ServiceMapView />)
    await screen.findByText('No service map loaded')
    client.putServiceMap.mockResolvedValue({ ok: true, model: SAMPLE_MODEL })
    fireEvent.change(screen.getByLabelText('ServiceMap YAML'), {
      target: { value: 'valid yaml' },
    })
    fireEvent.click(screen.getByText('Render map'))
    expect(await screen.findByTestId('node-checkout')).toHaveTextContent('SLO 99.9%')
    expect(screen.getByTestId('node-checkout')).toHaveTextContent('SLA 99.84%')
    expect(screen.getByTestId('node-ledger')).toHaveTextContent('SLA 99.99%')
    expect(screen.getByTestId('edge-checkout-payments')).toHaveAttribute('data-critical', 'true')
    expect(screen.getByTestId('edge-checkout-inventory')).toHaveAttribute('data-critical', 'false')
    expect(screen.getByText(/assumes independent failures and no redundancy/)).toBeInTheDocument()
  })

  it('loads the sample as a client-side preview without persisting', async () => {
    render(<ServiceMapView />)
    await screen.findByText('No service map loaded')
    fireEvent.click(screen.getByText('Load sample'))
    expect(await screen.findByTestId('node-checkout')).toBeInTheDocument()
    expect(client.putServiceMap).not.toHaveBeenCalled()
  })

  it('colors node health from the stream', async () => {
    stream.rows = [dep('checkout', 0), dep('payments', 1), dep('ledger', 2)]
    render(<ServiceMapView />)
    fireEvent.click(await screen.findByText('Load sample'))
    expect(screen.getByTestId('node-checkout')).toHaveAttribute('data-health', 'down')
    expect(screen.getByTestId('node-payments')).toHaveAttribute('data-health', 'degraded')
    expect(screen.getByTestId('node-ledger')).toHaveAttribute('data-health', 'healthy')
    expect(screen.getByTestId('node-inventory')).toHaveAttribute('data-health', 'unknown')
  })

  it('click flagged node shows weakest-link callout', async () => {
    render(<ServiceMapView />)
    fireEvent.click(await screen.findByText('Load sample'))
    fireEvent.click(screen.getByTestId('node-checkout'))
    expect(screen.getByTestId('callout')).toHaveTextContent('≤ 99.84%, limited by payments')
    expect(screen.getByTestId('edge-checkout-payments')).toHaveAttribute('data-highlighted', 'true')
  })

  it('surfaces a load error from the mount GET', async () => {
    client.getServiceMap.mockRejectedValue({ error: 'session expired', code: 401, reason: '' })
    render(<ServiceMapView />)
    expect(await screen.findByText('Could not load service map')).toBeInTheDocument()
    expect(screen.getByText('session expired')).toBeInTheDocument()
  })
})
