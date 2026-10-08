import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NodesView } from './NodesView'

const override = vi.hoisted(() => ({ rows: null as unknown[] | null }))
vi.mock('../table/useResourceStream', async (orig) => {
  const actual = await orig<typeof import('../table/useResourceStream')>()
  return {
    ...actual,
    useResourceStream: (...a: Parameters<typeof actual.useResourceStream>) =>
      override.rows ? { rows: override.rows, status: 'ready' } : actual.useResourceStream(...a),
  }
})

afterEach(() => {
  override.rows = null
})

describe('NodesView', () => {
  it('card view shows seeded nodes, metrics bars, conditions, taints and capacity', async () => {
    render(<NodesView />)
    expect(await screen.findByText('master-01')).toBeInTheDocument()
    for (const n of ['master-02', 'master-03', 'worker-01', 'worker-02', 'worker-03'])
      expect(screen.getByText(n)).toBeInTheDocument()
    expect(screen.getAllByText('Ready').length).toBeGreaterThan(0)
    expect(screen.getByText('NotReady')).toBeInTheDocument()
    expect(screen.getByText('(KubeletNotReady)')).toBeInTheDocument()
    expect(screen.getByText('DiskPressure')).toBeInTheDocument()
    expect(screen.getByText('dedicated=gpu:NoSchedule')).toBeInTheDocument()
    expect(screen.getAllByText(/cpu 16 · mem 64Gi · pods 110/).length).toBeGreaterThan(0)
    // 6 nodes x (CPU + Memory)
    const bars = screen.getAllByRole('progressbar')
    expect(bars).toHaveLength(12)
    const values = bars.map((b) => b.getAttribute('aria-valuenow'))
    expect(values).toContain('91')
    expect(values).toContain('67')
    expect(screen.queryByText('n/a')).toBeNull()
    expect(screen.getAllByText('control-plane').length).toBeGreaterThan(0)
    expect(screen.getAllByText('worker').length).toBeGreaterThan(0)
    expect(screen.getByText('32 pods')).toBeInTheDocument()
  })

  it('toggles to the table view keeping conditions, taints and bars', async () => {
    render(<NodesView />)
    await screen.findByText('master-01')
    expect(screen.queryByRole('table')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    expect(screen.getByRole('table', { name: 'Nodes' })).toBeInTheDocument()
    expect(screen.getByText('DiskPressure')).toBeInTheDocument()
    expect(screen.getByText('dedicated=gpu:NoSchedule')).toBeInTheDocument()
    expect(screen.getAllByText(/cpu 8 · mem 32Gi · pods 110/).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('progressbar')).toHaveLength(12)
    fireEvent.click(screen.getByRole('button', { name: 'Cards' }))
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows n/a (no bars) when a node has no metrics', async () => {
    override.rows = [
      {
        apiVersion: 'v1',
        kind: 'Node',
        metadata: { name: 'bare-1', uid: 'u1', creationTimestamp: '2026-09-01T00:00:00Z' },
        status: { conditions: [{ type: 'Ready', status: 'True' }] },
      },
    ]
    render(<NodesView />)
    expect(await screen.findByText('bare-1')).toBeInTheDocument()
    expect(screen.getAllByText('n/a')).toHaveLength(2)
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    expect(screen.getAllByText('n/a')).toHaveLength(2)
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0)
  })
})
