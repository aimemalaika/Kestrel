import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthProvider'
import { TopBar } from './TopBar'
import { firingAlerts } from '../modules/alerts/alertsMock'

describe('TopBar notification bell', () => {
  it('shows firing count and lists firing alerts in the dropdown', () => {
    render(
      <AuthProvider>
        <MemoryRouter>
          <TopBar perspective="admin" onPerspectiveChange={() => {}} />
        </MemoryRouter>
      </AuthProvider>,
    )
    const bell = screen.getByRole('button', { name: 'Notifications' })
    const n = firingAlerts().length
    expect(bell).toHaveTextContent(String(n))
    fireEvent.click(bell)
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument()
    expect(screen.getByText(firingAlerts()[0].name, { exact: false })).toBeInTheDocument()
    expect(screen.queryByText('No notifications')).toBeNull()
  })
})
