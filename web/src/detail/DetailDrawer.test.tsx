import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../routes'
import { AuthProvider } from '../auth/AuthProvider'
import { setIdentity, IDENTITY_PRESETS } from '../auth/identity'

describe('DetailDrawer via routes', () => {
  beforeEach(() => setIdentity(IDENTITY_PRESETS[0]))
  afterEach(() => setIdentity(null))

  it('a Name link opens the drawer for that object', async () => {
    render(
      <MemoryRouter initialEntries={['/ns/default/core/v1/pods']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    )
    const link = (await screen.findByRole('link', { name: 'web-1' })) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/ns/default/core/v1/pods/web-1')
  })

  it('renders the drawer dialog at the :name route', async () => {
    render(
      <MemoryRouter initialEntries={['/ns/default/core/v1/pods/web-1']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /detail/i })).toBeInTheDocument()
  })

  it('offers a relations tab', async () => {
    render(
      <MemoryRouter initialEntries={['/ns/default/core/v1/pods/web-1']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: /relations/i }))
    expect(await screen.findByText('Owners')).toBeInTheDocument()
  })
})
