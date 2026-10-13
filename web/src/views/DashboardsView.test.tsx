import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DashboardsView } from './DashboardsView'

const state = vi.hoisted(() => ({ metrics: {} as unknown }))
vi.mock('../table/useResourceStream', () => ({
  useResourceStream: () => ({
    status: 'ready',
    rows: [{ metadata: { name: 'node-b', uid: 'b' } }, { metadata: { name: 'node-a', uid: 'a' } }],
  }),
}))
vi.mock('../modules/observe/useNodeMetrics', () => ({
  useNodeMetrics: () => state.metrics,
}))

beforeEach(() => {
  state.metrics = {
    enabled: true,
    loading: false,
    cluster: { cpu: 41.6, mem: 67.2 },
    byNode: new Map([['node-a', { cpu: 50, mem: 60, storage: 30 }]]),
    grafanaUrl: 'https://grafana.example/d',
  }
})

describe('DashboardsView', () => {
  it('renders cluster cards, per-node rows and the Grafana link', () => {
    render(<DashboardsView />)
    expect(screen.getByText('Cluster Summary')).toBeInTheDocument()
    expect(screen.getByText('42%')).toBeInTheDocument()
    expect(screen.getByText('67%')).toBeInTheDocument()
    expect(screen.getByText('node-a')).toBeInTheDocument()
    expect(screen.getByText('node-b')).toBeInTheDocument()
    // node-b has no metrics: 3 n/a cells + 1 cluster storage card
    expect(screen.getAllByText('n/a')).toHaveLength(4)
    const link = screen.getByRole('link', { name: /Open in Grafana/ })
    expect(link).toHaveAttribute('href', 'https://grafana.example/d')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.queryByText(/No metrics source connected/)).toBeNull()
  })

  it('shows the no-metrics note when disabled', () => {
    state.metrics = { enabled: false, loading: false, cluster: {}, byNode: new Map() }
    render(<DashboardsView />)
    expect(
      screen.getByText(/No metrics source connected \(set --prometheus-url\)/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Grafana/ })).toBeNull()
  })
})
