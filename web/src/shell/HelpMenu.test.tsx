import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

import { HelpMenu } from './HelpMenu'

function renderMenu() {
  render(
    <MemoryRouter>
      <HelpMenu />
    </MemoryRouter>,
  )
}

describe('HelpMenu', () => {
  it('opens a menu with the four help items', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    const menu = screen.getByRole('menu')
    for (const name of ['Documentation', 'Keyboard shortcuts', 'API Explorer', 'About Kestrel']) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument()
    }
    expect(menu).toBeInTheDocument()
  })

  it('About Kestrel opens a dialog that says Kestrel and not OpenShift/OKD', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'About Kestrel' }))
    const dialog = screen.getByRole('dialog', { name: /About Kestrel/ })
    expect(dialog).toHaveTextContent(/Kestrel/)
    expect(dialog).not.toHaveTextContent(/OpenShift/i)
    expect(dialog).not.toHaveTextContent(/OKD/i)
  })

  it('Keyboard shortcuts dialog lists "/" and Esc', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Keyboard shortcuts' }))
    const dialog = screen.getByRole('dialog', { name: /Keyboard shortcuts/ })
    expect(dialog).toHaveTextContent('/')
    expect(dialog).toHaveTextContent('Esc')
  })

  it('API Explorer navigates and opens no dialog', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'API Explorer' }))
    expect(navigate).toHaveBeenCalledWith('/api-explorer')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
