import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ResourceTable } from './ResourceTable'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ResourceTable />
    </MemoryRouter>,
  )
}

describe('ResourceTable', () => {
  it('shows the empty-selection state with no gvr', () => {
    renderAt('/ns/default')
    expect(screen.getByText(/select a resource type/i)).toBeInTheDocument()
  })

  it('renders live rows for pods from the mock', async () => {
    renderAt('/ns/default/core/v1/pods')
    expect(await screen.findByText('web-1')).toBeInTheDocument()
    expect(await screen.findByText('web-2')).toBeInTheDocument()
    expect(screen.getByText('Name')).toBeInTheDocument()
  })

  it('adapts columns to the kind', async () => {
    renderAt('/ns/default/core/v1/pods')
    await screen.findByText('web-1')
    expect(screen.getByText('Phase')).toBeInTheDocument()
    expect(screen.getByText('Node')).toBeInTheDocument()
  })
})
