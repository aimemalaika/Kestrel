import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NodesView } from './NodesView'

describe('NodesView', () => {
  it('shows conditions, taints and capacity', async () => {
    render(<NodesView />)
    expect(await screen.findByText('node-1')).toBeInTheDocument()
    expect(screen.getByText('node-2')).toBeInTheDocument()
    expect(screen.getAllByText('Ready').length).toBeGreaterThan(1)
    expect(screen.getByText('NotReady')).toBeInTheDocument()
    expect(screen.getByText('(KubeletNotReady)')).toBeInTheDocument()
    expect(screen.getByText('DiskPressure')).toBeInTheDocument()
    expect(screen.getByText('dedicated=gpu:NoSchedule')).toBeInTheDocument()
    expect(screen.getByText(/cpu 8 · mem 32Gi · pods 110/)).toBeInTheDocument()
    expect(screen.getAllByText('n/a').length).toBeGreaterThan(0)
  })
})
