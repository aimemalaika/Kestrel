import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { SessionsDock } from '../sessions/SessionsDock'
import { useAuth } from '../auth/AuthProvider'
import { LoginScreen } from '../auth/LoginScreen'
import { CommandPalette } from '../search/CommandPalette'
import type { Perspective } from '../nav/categoryMap'

export function AppShell() {
  const { identity } = useAuth()
  const [perspective, setPerspective] = useState<Perspective>('admin')
  if (!identity) return <LoginScreen />
  return (
    <div className="flex flex-col h-screen bg-page text-zinc-200 overflow-hidden">
      <TopBar perspective={perspective} onPerspectiveChange={setPerspective} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar perspective={perspective} />
        <main className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <SessionsDock />
      <CommandPalette />
    </div>
  )
}
