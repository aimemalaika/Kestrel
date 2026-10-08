import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { SessionsDock } from '../sessions/SessionsDock'
import { useAuth } from '../auth/AuthProvider'
import { LoginScreen } from '../auth/LoginScreen'
import { CommandPalette } from '../search/CommandPalette'

export function AppShell() {
  const { identity, signOut } = useAuth()
  if (!identity) return <LoginScreen />
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div
          data-testid="identity-badge"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-1) var(--space-6)',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            color: 'var(--text-muted)',
            fontSize: 12,
          }}
        >
          <span style={{ color: 'var(--text)' }}>{identity.user}</span>
          <span>{identity.role}</span>
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
        <TopBar />
        <main style={{ flex: 1 }}>
          <Outlet />
        </main>
      </div>
      <SessionsDock />
      <CommandPalette />
    </div>
  )
}
