import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Overview } from './Overview'
import { useNodeMetrics, type UseNodeMetrics } from '../modules/observe/useNodeMetrics'

vi.mock('../modules/observe/useNodeMetrics', () => ({ useNodeMetrics: vi.fn() }))

const enabled: UseNodeMetrics = {
  enabled: true,
  loading: false,
  byNode: new Map(),
  cluster: { cpu: 41.6, mem: 62.2, storage: 17.4 },
  grafanaUrl: 'https://grafana.example/d/x',
}
const disabled: UseNodeMetrics = {
  enabled: false,
  loading: false,
  byNode: new Map(),
  cluster: {},
}

describe('Overview', () => {
  beforeEach(() => {
    vi.mocked(useNodeMetrics).mockReturnValue(enabled)
  })

  it('renders status tiles, stat cards, charts and bottom panels', async () => {
    render(<Overview />)
    expect(screen.getByText('Cluster Health')).toBeInTheDocument()
    for (const l of ['Nodes', 'Pods', 'Deployments', 'Services', 'Routes', 'Alerts']) {
      expect(screen.getAllByText(l).length).toBeGreaterThan(0)
    }
    expect(screen.getByText('CPU %')).toBeInTheDocument()
    expect(screen.getByText('Recent Events')).toBeInTheDocument()
    expect(screen.getByText('Namespace Resources')).toBeInTheDocument()
    expect(screen.getByText('Active Alerts')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('5 / 6 nodes ready')).toBeInTheDocument()
    })
    expect(screen.getByText('1 NotReady')).toBeInTheDocument()
  })

  it('shows status values and firing alerts', () => {
    render(<Overview />)
    expect(screen.getByText('v1.29.3')).toBeInTheDocument()
    expect(screen.getByText('NodeNotReady')).toBeInTheDocument()
  })

  it('renders real cluster CPU/Memory/Storage % and no sample note when enabled', () => {
    render(<Overview />)
    expect(screen.getByText('CPU %')).toBeInTheDocument()
    expect(screen.getByText('42%')).toBeInTheDocument()
    expect(screen.getByText('Memory %')).toBeInTheDocument()
    expect(screen.getByText('62%')).toBeInTheDocument()
    expect(screen.getByText('Storage %')).toBeInTheDocument()
    expect(screen.getByText('17%')).toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    expect(screen.queryByText('Disk I/O')).not.toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Open in Grafana/ })
    expect(link).toHaveAttribute('href', 'https://grafana.example/d/x')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('discloses sample data and shows n/a when no metrics source is connected', () => {
    vi.mocked(useNodeMetrics).mockReturnValue(disabled)
    render(<Overview />)
    expect(screen.getByRole('note')).toHaveTextContent(/Sample data — no metrics source connected/)
    expect(screen.getAllByText('n/a')).toHaveLength(3)
    expect(screen.queryByRole('link', { name: /Open in Grafana/ })).not.toBeInTheDocument()
  })

  it('has a View all events button and derived Routes/Alerts sublabels', async () => {
    render(<Overview />)
    expect(screen.getByRole('button', { name: 'View all' })).toBeInTheDocument()
    expect(screen.getByText(/\d+ critical, \d+ warning/)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/^[1-9]\d* admitted$/)).toBeInTheDocument()
    })
  })
})
