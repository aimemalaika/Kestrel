import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TopologyView } from './TopologyView'

const data = vi.hoisted(() => ({ byRes: {} as Record<string, unknown[]> }))
vi.mock('../table/useResourceStream', () => ({
  useResourceStream: (gvr: { resource: string }) => ({
    rows: data.byRes[gvr.resource] ?? [],
    status: 'ready',
  }),
}))

const m = (name: string, extra: object = {}) => ({
  metadata: { name, namespace: 'default', ...extra },
})

describe('TopologyView', () => {
  it('renders nodes and opens the panel on click', () => {
    data.byRes = {
      deployments: [m('web')],
      replicasets: [m('web-1', { ownerReferences: [{ kind: 'Deployment', name: 'web' }] })],
      pods: [
        {
          ...m('web-1-a', { ownerReferences: [{ kind: 'ReplicaSet', name: 'web-1' }] }),
          status: { phase: 'Running' },
        },
      ],
      services: [],
    }
    render(
      <MemoryRouter>
        <TopologyView />
      </MemoryRouter>,
    )
    expect(screen.getByText('web-1-a')).toBeInTheDocument()
    expect(screen.queryByTestId('topology-panel')).toBeNull()
    fireEvent.click(screen.getByTestId('node-Pod-web-1-a'))
    expect(screen.getByTestId('topology-panel')).toBeInTheDocument()
    expect(screen.getByText('healthy')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open details' })).toHaveAttribute(
      'href',
      '/ns/default/core/v1/pods/web-1-a',
    )
    fireEvent.click(screen.getByLabelText('Zoom in'))
    expect(screen.getByText('110%')).toBeInTheDocument()
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
