import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { getIdentity, setIdentity, subscribe } from './identity'
import type { Identity } from './identity'

interface AuthValue {
  identity: Identity | null
  signIn: (id: Identity) => void
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [identity, setState] = useState<Identity | null>(getIdentity())
  useEffect(() => {
    setState(getIdentity())
    return subscribe(() => setState(getIdentity()))
  }, [])
  const signIn = useCallback((id: Identity) => setIdentity(id), [])
  const signOut = useCallback(() => setIdentity(null), [])
  const value = useMemo(() => ({ identity, signIn, signOut }), [identity, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
