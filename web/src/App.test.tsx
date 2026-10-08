import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from './routes'
import { AuthProvider } from './auth/AuthProvider'
import { setIdentity, IDENTITY_PRESETS } from './auth/identity'

describe('App shell', () => {
  beforeEach(() => setIdentity(IDENTITY_PRESETS[0]))
  afterEach(() => setIdentity(null))

  it('renders the empty state at root inside the shell', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /welcome to kestrel/i })).toBeInTheDocument()
  })
})
