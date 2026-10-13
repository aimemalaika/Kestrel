import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { setIdentity } from './identity'
import type { Identity } from './identity'
import type { AuthInfo, AuthOption } from './authInfo'
import { createClient } from '../client/createClient'
import { redirectTo } from './redirect'

type Status = 'loading' | 'needs-login' | 'authed'
type Mode = 'single-operator' | 'oidc'

interface AuthValue {
  status: Status
  mode: Mode
  identity: Identity | null
  options: AuthOption[]
  adminGroups: string[]
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [mode, setMode] = useState<Mode>('oidc')
  const [identity, setLocalIdentity] = useState<Identity | null>(null)
  const [options, setOptions] = useState<AuthOption[]>([])
  const [adminGroups, setAdminGroups] = useState<string[]>([])

  useEffect(() => {
    let live = true
    createClient()
      .authInfo()
      .then((info: AuthInfo) => {
        if (!live) return
        const id: Identity | null = info.user
          ? { name: info.user.name, groups: info.user.groups }
          : info.mode === 'single-operator'
            ? { name: 'kestrel-operator' }
            : null
        setMode(info.mode)
        setOptions(info.options ?? [])
        setAdminGroups(info.adminGroups ?? [])
        setLocalIdentity(id)
        setIdentity(id) // sync the module store (useCanI / mock canI observe it)
        setStatus(id ? 'authed' : 'needs-login')
      })
      .catch(() => {
        if (!live) return
        // Fail closed: show the login screen with whatever options we have (none).
        setStatus('needs-login')
      })
    return () => {
      live = false
    }
  }, [])

  const signOut = useCallback(() => {
    // OIDC: end the server session. Single-operator has no session to end.
    if (mode === 'oidc') redirectTo('/auth/logout')
  }, [mode])

  const value = useMemo<AuthValue>(
    () => ({ status, mode, identity, options, adminGroups, signOut }),
    [status, mode, identity, options, adminGroups, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
