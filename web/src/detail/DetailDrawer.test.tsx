import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../routes'

describe('DetailDrawer via routes', () => {
  it('a Name link opens the drawer for that object', async () => {
    render(
      <MemoryRouter initialEntries={['/ns/default/core/v1/pods']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    const link = (await screen.findByRole('link', { name: 'web-1' })) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/ns/default/core/v1/pods/web-1')
  })

  it('renders the drawer dialog at the :name route', async () => {
    render(
      <MemoryRouter initialEntries={['/ns/default/core/v1/pods/web-1']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /detail/i })).toBeInTheDocument()
  })
})
