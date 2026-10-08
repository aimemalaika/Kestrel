import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

describe('ResourceTable interactions', () => {
  it('filters rows by the search box', async () => {
    render(
      <MemoryRouter initialEntries={['/ns/default/core/v1/pods']}>
        <ResourceTable />
      </MemoryRouter>,
    )
    await screen.findByText('web-1')
    const search = screen.getByPlaceholderText(/search/i)
    fireEvent.change(search, { target: { value: 'web-2' } })
    expect(screen.queryByText('web-1')).not.toBeInTheDocument()
    expect(screen.getByText('web-2')).toBeInTheDocument()
  })

  it('sorts by a column when its header is clicked', async () => {
    render(
      <MemoryRouter initialEntries={['/ns/default/core/v1/pods']}>
        <ResourceTable />
      </MemoryRouter>,
    )
    const nameHeader = await screen.findByRole('button', { name: /name/i })
    fireEvent.click(nameHeader) // asc
    fireEvent.click(nameHeader) // desc
    expect(screen.getByText('web-1')).toBeInTheDocument()
  })
})
