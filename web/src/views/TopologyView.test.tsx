import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TopologyView } from './TopologyView'

const data = vi.hoisted(() => ({ byRes: {} as Record<string, unknown[]> }))
vi.mock('../table/useResourceStream', () => ({
  useResourceStream: (gvr: { resource: string }) => ({
    rows: data.byRes[gvr.resource] ?? [],
    status: 'ready',
  }),
}))

const w = (name: string, ns: string, replicas: number, ready: number, exposed = false) => ({
  metadata: {
    name,
    namespace: ns,
    ...(exposed ? { annotations: { 'kestrel.io/exposed': 'true' } } : {}),
  },
  spec: { replicas },
  status: { readyReplicas: ready },
})

function setup() {
  data.byRes = {
    deployments: [
      w('api-gateway', 'production', 3, 3, true),
      w('ml-pipeline', 'staging', 2, 0),
      w('redis-cache', 'staging', 1, 1),
    ],
    statefulsets: [w('postgres', 'production', 1, 1), w('prometheus', 'monitoring', 1, 1)],
    daemonsets: [],
  }
  render(
    <MemoryRouter>
      <TopologyView />
    </MemoryRouter>,
  )
}

describe('TopologyView', () => {
  it('renders namespace boxes with workloads, counts, R badge and edges', () => {
    setup()
    for (const ns of ['production', 'staging', 'monitoring'])
      expect(screen.getByTestId(`ns-box-${ns}`)).toBeInTheDocument()
    expect(screen.getByTestId('count-api-gateway')).toHaveTextContent('3/3')
    expect(screen.getByTestId('route-api-gateway')).toBeInTheDocument()
    expect(screen.queryByTestId('route-postgres')).toBeNull()
    const down = screen.getByTestId('count-ml-pipeline')
    expect(down).toHaveTextContent('0/2')
    expect(down).toHaveAttribute('fill', '#f87171')
    expect(screen.getByTestId('count-redis-cache')).toHaveAttribute('fill', '#34d399')
    expect(screen.getAllByTestId('down-dot')).toHaveLength(1)
    expect(screen.getAllByTestId('topology-edge').length).toBeGreaterThan(0)
  })

  it('opens the panel on click and via keyboard, supports zoom and filter', () => {
    setup()
    expect(screen.queryByTestId('topology-panel')).toBeNull()
    fireEvent.click(screen.getByTestId('node-api-gateway'))
    const panel = screen.getByTestId('topology-panel')
    expect(within(panel).getByText('3/3 ready')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open details' })).toHaveAttribute(
      'href',
      '/ns/production/apps/v1/deployments/api-gateway',
    )
    fireEvent.keyDown(screen.getByTestId('node-postgres'), { key: 'Enter' })
    expect(screen.getByRole('link', { name: 'Open details' })).toHaveAttribute(
      'href',
      '/ns/production/apps/v1/statefulsets/postgres',
    )
    fireEvent.click(screen.getByLabelText('Zoom in'))
    expect(screen.getByText('110%')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Namespace'), { target: { value: 'staging' } })
    expect(screen.queryByTestId('ns-box-production')).toBeNull()
    expect(screen.getByTestId('ns-box-staging')).toBeInTheDocument()
  })

  it('shows empty state with no workloads', () => {
    data.byRes = {}
    render(
      <MemoryRouter>
        <TopologyView />
      </MemoryRouter>,
    )
    expect(screen.getByText('No workloads')).toBeInTheDocument()
  })
})
