import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NodesView } from './NodesView'

describe('NodesView', () => {
  it('card view shows conditions, taints, capacity and n/a metrics', async () => {
    render(<NodesView />)
    expect(await screen.findByText('node-1')).toBeInTheDocument()
    expect(screen.getByText('node-2')).toBeInTheDocument()
    expect(screen.getAllByText('Ready').length).toBeGreaterThan(0)
    expect(screen.getByText('NotReady')).toBeInTheDocument()
    expect(screen.getByText('(KubeletNotReady)')).toBeInTheDocument()
    expect(screen.getByText('DiskPressure')).toBeInTheDocument()
    expect(screen.getByText('dedicated=gpu:NoSchedule')).toBeInTheDocument()
    expect(screen.getAllByText(/cpu 8 · mem 32Gi · pods 110/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('n/a').length).toBeGreaterThan(0)
    expect(screen.getAllByText('worker').length).toBeGreaterThan(0)
  })

  it('toggles to the table view keeping conditions and taints', async () => {
    render(<NodesView />)
    await screen.findByText('node-1')
    expect(screen.queryByRole('table')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    expect(screen.getByRole('table', { name: 'Nodes' })).toBeInTheDocument()
    expect(screen.getByText('DiskPressure')).toBeInTheDocument()
    expect(screen.getByText('dedicated=gpu:NoSchedule')).toBeInTheDocument()
    expect(screen.getAllByText(/cpu 4 · mem 16Gi · pods 110/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Cards' }))
    expect(screen.queryByRole('table')).toBeNull()
  })
})
