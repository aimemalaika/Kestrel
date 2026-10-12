import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { AuthInfo } from '../authInfo'

const authInfo = vi.fn<() => Promise<AuthInfo>>()
const passwordLogin = vi.fn<(u: string, p: string) => Promise<void>>()
vi.mock('../../client/createClient', () => ({
  createClient: () => ({ authInfo, passwordLogin }),
}))

const redirectTo = vi.fn()
vi.mock('../redirect', () => ({ redirectTo: (url: string) => redirectTo(url) }))

import { AuthProvider } from '../AuthProvider'
import { LoginScreen } from '../LoginScreen'

afterEach(() => {
  authInfo.mockReset()
  passwordLogin.mockReset()
  redirectTo.mockReset()
})

function renderLogin() {
  authInfo.mockResolvedValue({
    mode: 'oidc',
    user: null,
    options: [
      { id: 'github', label: 'Log in with GitHub', start: '/auth/login?connector=gh' },
      { id: 'password', label: 'Username & password', start: '/auth/password' },
    ],
  })
  render(
    <AuthProvider>
      <LoginScreen />
    </AuthProvider>,
  )
}

describe('LoginScreen', () => {
  it('GitHub button redirects to its start URL', async () => {
    renderLogin()
    const btn = await screen.findByRole('button', { name: /log in with github/i })
    fireEvent.click(btn)
    expect(redirectTo).toHaveBeenCalledWith('/auth/login?connector=gh')
  })

  it('password form submits credentials via the client', async () => {
    passwordLogin.mockResolvedValue()
    renderLogin()
    fireEvent.change(await screen.findByLabelText(/username/i), {
      target: { value: 'alice@corp.com' },
    })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 's3cret' } })
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
    await waitFor(() => expect(passwordLogin).toHaveBeenCalledWith('alice@corp.com', 's3cret'))
  })

  it('shows an inline error when password login is rejected (no navigation)', async () => {
    passwordLogin.mockRejectedValue({
      error: 'invalid credentials',
      code: 401,
      reason: 'Unauthorized',
    })
    renderLogin()
    fireEvent.change(await screen.findByLabelText(/username/i), { target: { value: 'u' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'bad' } })
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid credentials/i)
    expect(redirectTo).not.toHaveBeenCalled()
  })
})
