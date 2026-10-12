import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthProvider'
import { LoginScreen } from './LoginScreen'
import type { AuthInfo } from './authInfo'

const authInfo = vi.fn<() => Promise<AuthInfo>>()
vi.mock('../client/createClient', () => ({
  createClient: () => ({ authInfo }),
}))

const redirectTo = vi.fn()
vi.mock('./redirect', () => ({ redirectTo: (url: string) => redirectTo(url) }))

afterEach(() => {
  authInfo.mockReset()
  redirectTo.mockReset()
})

function AuthProbe() {
  const { status, mode, identity, options, signOut } = useAuth()
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="mode">{mode}</span>
      <span data-testid="who">{identity?.name ?? 'none'}</span>
      <span data-testid="opts">{options.map((o) => o.id).join(',')}</span>
      <button onClick={signOut}>out</button>
    </div>
  )
}

describe('AuthProvider', () => {
  it('single-operator → authed as the reported operator, no login options', async () => {
    authInfo.mockResolvedValue({
      mode: 'single-operator',
      user: { name: 'kestrel-operator' },
      options: [],
    })
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authed'))
    expect(screen.getByTestId('who')).toHaveTextContent('kestrel-operator')
    expect(screen.getByTestId('mode')).toHaveTextContent('single-operator')
  })

  it('oidc + no user → needs-login', async () => {
    authInfo.mockResolvedValue({
      mode: 'oidc',
      user: null,
      options: [{ id: 'oidc', label: 'Log in', start: '/auth/login' }],
    })
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('needs-login'))
    expect(screen.getByTestId('who')).toHaveTextContent('none')
    expect(screen.getByTestId('opts')).toHaveTextContent('oidc')
  })

  it('oidc + user present → authed as that user', async () => {
    authInfo.mockResolvedValue({
      mode: 'oidc',
      user: { name: 'alice@corp.com', groups: ['developers'] },
      options: [],
    })
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authed'))
    expect(screen.getByTestId('who')).toHaveTextContent('alice@corp.com')
  })

  it('signOut in oidc mode redirects to /auth/logout', async () => {
    authInfo.mockResolvedValue({
      mode: 'oidc',
      user: { name: 'alice@corp.com' },
      options: [],
    })
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authed'))
    fireEvent.click(screen.getByText('out'))
    expect(redirectTo).toHaveBeenCalledWith('/auth/logout')
  })

  it('signOut in single-operator mode does nothing (no session to end)', async () => {
    authInfo.mockResolvedValue({
      mode: 'single-operator',
      user: { name: 'kestrel-operator' },
      options: [],
    })
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authed'))
    fireEvent.click(screen.getByText('out'))
    expect(redirectTo).not.toHaveBeenCalled()
  })

  it('useAuth throws outside provider', () => {
    // Suppress React's error-boundary console noise for the expected throw.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<AuthProbe />)).toThrow()
    spy.mockRestore()
  })
})

describe('LoginScreen', () => {
  it('renders each advertised option and redirects to its start URL on click', async () => {
    authInfo.mockResolvedValue({
      mode: 'oidc',
      user: null,
      options: [
        { id: 'github', label: 'Login with GitHub', start: '/auth/login?c=github' },
        { id: 'password', label: 'Username & password', start: '/auth/login?c=ldap' },
      ],
    })
    render(
      <AuthProvider>
        <LoginScreen />
      </AuthProvider>,
    )
    const github = await screen.findByText('Login with GitHub')
    expect(screen.getByText('Username & password')).toBeInTheDocument()
    fireEvent.click(github)
    expect(redirectTo).toHaveBeenCalledWith('/auth/login?c=github')
  })
})
