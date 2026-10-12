import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

interface App {
  apiVersion: string
  kind: string
  metadata: { name: string; namespace: string; uid: string }
  spec: { project: string }
}
const app = (name: string, project: string): App => ({
  apiVersion: 'argoproj.io/v1alpha1',
  kind: 'Application',
  metadata: { name, namespace: 'argocd', uid: `argocd/${name}` },
  spec: { project },
})

let rows: App[] = []
vi.mock('../../table/useResourceStream', () => ({
  useResourceStream: () => ({ rows, status: 'ready' }),
}))
// Render the grid as a simple name list so we can assert filtering/pagination.
vi.mock('./ArgoRichView', () => ({
  ArgoAppGrid: ({ objects }: { objects: App[] }) => (
    <ul data-testid="grid">
      {objects.map((o) => (
        <li key={o.metadata.name}>{o.metadata.name}</li>
      ))}
    </ul>
  ),
}))

import { ArgoApplicationsView } from './ArgoApplicationsView'

const names = () =>
  Array.from(document.querySelectorAll('[data-testid="grid"] li')).map((li) => li.textContent)

describe('ArgoApplicationsView filtering/pagination', () => {
  beforeEach(() => {
    rows = []
  })

  it('filters applications by name', () => {
    rows = [app('web', 'team-a'), app('api', 'team-a'), app('billing', 'team-b')]
    render(<ArgoApplicationsView />)
    expect(names()).toHaveLength(3)
    fireEvent.change(screen.getByLabelText('Filter by name'), { target: { value: 'bil' } })
    expect(names()).toEqual(['billing'])
  })

  it('offers a project dropdown and filters by project', () => {
    rows = [app('web', 'team-a'), app('api', 'team-a'), app('billing', 'team-b')]
    render(<ArgoApplicationsView />)
    const project = screen.getByLabelText('Project') as HTMLSelectElement
    expect(screen.getByRole('option', { name: 'team-a' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'team-b' })).toBeInTheDocument()
    fireEvent.change(project, { target: { value: 'team-b' } })
    expect(names()).toEqual(['billing'])
  })

  it('paginates with Prev/Next and a page-size selector', () => {
    rows = Array.from({ length: 30 }, (_, i) => app(`app-${String(i).padStart(2, '0')}`, 'team-a'))
    render(<ArgoApplicationsView />)
    // default page size 24 → first page shows 24
    expect(names()).toHaveLength(24)
    expect(screen.getByText('1–24 of 30')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(names()).toHaveLength(6)
    expect(screen.getByText('25–30 of 30')).toBeInTheDocument()
    // smaller page size resets to page 1
    fireEvent.change(screen.getByLabelText('Per page'), { target: { value: '12' } })
    expect(names()).toHaveLength(12)
    expect(screen.getByText('1–12 of 30')).toBeInTheDocument()
  })
})
