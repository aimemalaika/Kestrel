import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// xterm needs a real terminal/canvas; stub it (same as streaming/Terminal.test.tsx).
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    open() {}
    write() {}
    loadAddon() {}
    onData() {
      return { dispose() {} }
    }
    onResize() {
      return { dispose() {} }
    }
    cols = 80
    rows = 24
    dispose() {}
  },
}))
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}))
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

import { WebTerminalDrawer } from './WebTerminalDrawer'

function renderDrawer(open = true, onClose = () => {}) {
  return render(
    <MemoryRouter initialEntries={['/ns/shop/core/v1/pods']}>
      <WebTerminalDrawer open={open} onClose={onClose} />
    </MemoryRouter>,
  )
}

describe('WebTerminalDrawer', () => {
  it('renders nothing when closed', () => {
    renderDrawer(false)
    expect(screen.queryByText('Web Terminal')).toBeNull()
  })

  it('shows the header and a connect prompt, and no mock "oc" simulation', () => {
    renderDrawer()
    expect(screen.getByText('Web Terminal')).toBeInTheDocument()
    expect(screen.getByText(/select a namespace and pod/i)).toBeInTheDocument()
    expect(screen.queryByText(/oc/i)).toBeNull()
  })

  it('connects to a real pod exec when a pod is chosen', async () => {
    renderDrawer()
    fireEvent.change(screen.getByLabelText(/pod/i), { target: { value: 'web-1' } })
    fireEvent.click(screen.getByRole('button', { name: /connect/i }))
    expect(await screen.findByTestId('terminal-host')).toBeInTheDocument()
  })

  it('close button calls onClose', () => {
    const onClose = vi.fn()
    renderDrawer(true, onClose)
    fireEvent.click(screen.getByRole('button', { name: /close terminal/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape in the drawer calls onClose', async () => {
    const onClose = vi.fn()
    renderDrawer(true, onClose)
    fireEvent.keyDown(screen.getByText('Web Terminal'), { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
