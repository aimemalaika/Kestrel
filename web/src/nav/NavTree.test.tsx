import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NavTree } from './NavTree'

describe('NavTree', () => {
  it('renders sections and resource leaves from the mock catalog', async () => {
    render(
      <MemoryRouter initialEntries={['/ns/default']}>
        <NavTree />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Workloads')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /pods/i })).toBeInTheDocument()
  })

  it('leaf links target the GVR route under the current namespace', async () => {
    render(
      <MemoryRouter initialEntries={['/ns/shop']}>
        <NavTree />
      </MemoryRouter>,
    )
    const link = (await screen.findByRole('link', { name: /deployments/i })) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/ns/shop/apps/v1/deployments')
  })

  it('collapses and expands a section via its toggle', async () => {
    render(
      <MemoryRouter initialEntries={['/ns/default']}>
        <NavTree />
      </MemoryRouter>,
    )
    const toggle = await screen.findByRole('button', { name: /workloads/i })
    expect(await screen.findByRole('link', { name: /pods/i })).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByRole('link', { name: /pods/i })).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByRole('link', { name: /pods/i })).toBeInTheDocument()
  })
})
