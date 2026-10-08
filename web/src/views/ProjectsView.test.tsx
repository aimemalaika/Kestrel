import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { ProjectsView } from './ProjectsView'

describe('ProjectsView', () => {
  it('renders a card per namespace with pod counts and quota usage', async () => {
    render(<ProjectsView />)
    await waitFor(() => expect(screen.getByTestId('project-shop')).toBeInTheDocument())
    expect(screen.getByText('Projects')).toBeInTheDocument()
    const shop = within(screen.getByTestId('project-shop'))
    expect(shop.getByText('Pods')).toBeInTheDocument()
    expect(shop.getByText('1.8')).toBeInTheDocument()
    expect(screen.getByTestId('project-default')).toBeInTheDocument()
  })
})
