import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NavTree } from './NavTree'
import { ADMIN_NAV } from './categoryMap'

const renderTree = (props: Parameters<typeof NavTree>[0] = {}, path = '/ns/default') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <NavTree {...props} />
    </MemoryRouter>,
  )

describe('NavTree', () => {
  it('renders the admin sections in mock order', () => {
    renderTree()
    const headers = screen.getAllByRole('button', { expanded: undefined }).map((b) => b.textContent)
    expect(headers).toEqual(ADMIN_NAV.map((s) => s.section))
  })

  it('dedicated routes render as links', () => {
    renderTree()
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('href')).toBe('/overview')
    expect(screen.getByRole('link', { name: 'Projects' }).getAttribute('href')).toBe('/projects')
    expect(screen.getByRole('link', { name: 'GitOps' }).getAttribute('href')).toBe('/argo')
    expect(screen.getByRole('link', { name: 'Events' }).getAttribute('href')).toBe('/events')
  })

  it('resource links are namespace-aware and catalog-gated', async () => {
    renderTree({}, '/ns/shop')
    const link = await screen.findByRole('link', { name: 'Deployments' })
    expect(link.getAttribute('href')).toBe('/ns/shop/apps/v1/deployments')
  })

  it('not-implemented items are dimmed, non-interactive and not hrefs', () => {
    renderTree()
    const dim = screen.getByText('StatefulSets').closest('[aria-disabled="true"]')!
    expect(dim).not.toBeNull()
    expect(dim.tagName).toBe('DIV')
    expect(dim.getAttribute('href')).toBeNull()
    expect(dim.className).toContain('text-zinc-600')
  })

  it('switches to the developer nav', () => {
    renderTree({ perspective: 'developer' })
    expect(screen.getByRole('button', { name: /^Developer/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Operators/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Helm Releases' }).getAttribute('href')).toBe('/helm')
  })

  it('collapses and expands a section via its toggle', () => {
    renderTree()
    const toggle = screen.getByRole('button', { name: /workloads/i })
    expect(screen.getByText('StatefulSets')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByText('StatefulSets')).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByText('StatefulSets')).toBeInTheDocument()
  })
})

describe('NavTree rail', () => {
  it('renders icon-only items with accessible names and no section headers', async () => {
    renderTree({ rail: true })
    expect(await screen.findByRole('link', { name: 'Pods' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText('Workloads')).toBeNull()
  })
})
