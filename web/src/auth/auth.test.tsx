import { afterEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthProvider'
import { LoginScreen } from './LoginScreen'
import { IDENTITY_PRESETS, getIdentity, setIdentity } from './identity'
import { useCanI } from '../write/useCanI'

const [operator, viewer] = IDENTITY_PRESETS

function AuthProbe() {
  const { identity, signIn, signOut } = useAuth()
  return (
    <div>
      <span data-testid="who">{identity?.user ?? 'none'}</span>
      <button onClick={() => signIn(viewer)}>in-viewer</button>
      <button onClick={() => signIn(operator)}>in-operator</button>
      <button onClick={signOut}>out</button>
    </div>
  )
}

function CanIProbe() {
  const ok = useCanI({
    verb: 'delete',
    group: '',
    version: 'v1',
    resource: 'pods',
    namespace: 'default',
    name: 'x',
  })
  return <span data-testid="ok">{String(ok)}</span>
}

afterEach(() => setIdentity(null))

describe('auth', () => {
  it('signIn / signOut update identity', () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )
    expect(screen.getByTestId('who').textContent).toBe('none')
    fireEvent.click(screen.getByText('in-viewer'))
    expect(screen.getByTestId('who').textContent).toBe(viewer.user)
    expect(getIdentity()).toEqual(viewer)
    fireEvent.click(screen.getByText('out'))
    expect(screen.getByTestId('who').textContent).toBe('none')
  })

  it('useAuth throws outside provider', () => {
    expect(() => render(<AuthProbe />)).toThrow()
  })

  it('LoginScreen signs in a preset', () => {
    render(
      <AuthProvider>
        <LoginScreen />
        <AuthProbe />
      </AuthProvider>,
    )
    fireEvent.click(screen.getByText(viewer.user))
    expect(screen.getByTestId('who').textContent).toBe(viewer.user)
  })

  it('useCanI follows identity changes', async () => {
    setIdentity(viewer)
    render(
      <AuthProvider>
        <AuthProbe />
        <CanIProbe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('ok').textContent).toBe('false'))
    await act(async () => {
      fireEvent.click(screen.getByText('in-operator'))
    })
    await waitFor(() => expect(screen.getByTestId('ok').textContent).toBe('true'))
  })
})
