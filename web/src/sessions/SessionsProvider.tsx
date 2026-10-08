import { createContext, useContext, useState } from 'react'
import { createClient } from '../client/createClient'
import type { PortForwardSession, ResourceRef } from '../client/Client'

interface SessionsCtx {
  sessions: PortForwardSession[]
  start: (ref: ResourceRef, localPort: number, remotePort: number) => void
  stop: (id: string) => void
}

const Ctx = createContext<SessionsCtx>({ sessions: [], start: () => {}, stop: () => {} })

export function SessionsProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<PortForwardSession[]>([])
  const [client] = useState(() => createClient())
  const start = (ref: ResourceRef, localPort: number, remotePort: number) => {
    const s = client.portForward(ref, localPort, remotePort)
    setSessions((prev) => [...prev, s])
  }
  const stop = (id: string) => {
    setSessions((prev) =>
      prev.filter((s) => {
        if (s.id === id) {
          s.close()
          return false
        }
        return true
      }),
    )
  }
  return <Ctx.Provider value={{ sessions, start, stop }}>{children}</Ctx.Provider>
}

export function useSessions() {
  return useContext(Ctx)
}
