import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from './routes'
import { AuthProvider } from './auth/AuthProvider'

describe('App shell', () => {
  it('renders the empty state at root inside the shell', async () => {
    // AuthProvider fetches /authinfo (mock client → single-operator), so the shell
    // enters directly once it resolves.
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: /welcome to kestrel/i })).toBeInTheDocument()
  })
})
