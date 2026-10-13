import { useState, useSyncExternalStore } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { SessionsDock } from '../sessions/SessionsDock'
import { useAuth } from '../auth/AuthProvider'
import { LoginScreen } from '../auth/LoginScreen'
import { CommandPalette } from '../search/CommandPalette'
import { ErrorBoundary } from './ErrorBoundary'
import { WebTerminalDrawer } from './WebTerminalDrawer'
import { loadDefaultPerspective } from './perspectivePref'
import { allowedPerspective, canAdmin as computeCanAdmin } from './perspective'
import { getIdentity, subscribe } from '../auth/identity'
import type { Perspective } from '../nav/categoryMap'

export function AppShell() {
  const { status, mode, adminGroups } = useAuth()
  const identity = useSyncExternalStore(subscribe, getIdentity, getIdentity)
  const canAdmin = computeCanAdmin(mode, identity?.groups, adminGroups)
  // The user's chosen perspective; the group rule is the ceiling. Deriving the
  // effective perspective (rather than storing it) auto-corrects for any
  // identity/authInfo load order: a non-admin is always `developer`, and an
  // admin is restored to their choice once canAdmin resolves true.
  const [chosen, setChosen] = useState<Perspective>(() => loadDefaultPerspective())
  const perspective = allowedPerspective(chosen, canAdmin)
  const [terminalOpen, setTerminalOpen] = useState(false)
  if (status === 'loading')
    return (
      <div className="min-h-screen grid place-items-center bg-page text-zinc-500 text-sm">
        Loading…
      </div>
    )
  if (status === 'needs-login') return <LoginScreen />
  return (
    <div className="flex flex-col h-screen bg-page text-zinc-200 overflow-hidden">
      <TopBar
        perspective={perspective}
        canAdmin={canAdmin}
        onPerspectiveChange={setChosen}
        terminalOpen={terminalOpen}
        onToggleTerminal={() => setTerminalOpen((o) => !o)}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar perspective={perspective} />
        <main className="flex-1 min-w-0 overflow-y-auto">
          <ErrorBoundary label="This view">
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <WebTerminalDrawer open={terminalOpen} onClose={() => setTerminalOpen(false)} />
      <SessionsDock />
      <CommandPalette />
    </div>
  )
}
