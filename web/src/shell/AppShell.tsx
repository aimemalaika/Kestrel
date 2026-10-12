import { useState } from 'react'
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
import type { Perspective } from '../nav/categoryMap'

export function AppShell() {
  const { status } = useAuth()
  const [perspective, setPerspective] = useState<Perspective>(() => loadDefaultPerspective())
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
        onPerspectiveChange={setPerspective}
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
