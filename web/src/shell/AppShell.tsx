import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { SessionsDock } from '../sessions/SessionsDock'
import { useAuth } from '../auth/AuthProvider'
import { LoginScreen } from '../auth/LoginScreen'
import { CommandPalette } from '../search/CommandPalette'

export function AppShell() {
  const { identity } = useAuth()
  if (!identity) return <LoginScreen />
  return (
    <div className="flex flex-col h-screen bg-page text-zinc-200 overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <SessionsDock />
      <CommandPalette />
    </div>
  )
}
