import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'
import { SessionsProvider } from './SessionsProvider'
import { SessionsDock } from './SessionsDock'
import { PortForwardButton } from './PortForwardButton'

const pod = { group: 'core', version: 'v1', resource: 'pods', namespace: 'default', name: 'web-1' }

function Harness() {
  return (
    <SessionsProvider>
      <PortForwardButton target={pod} />
      <Link to="/elsewhere">go</Link>
      <Routes>
        <Route path="/" element={<div>home</div>} />
        <Route path="/elsewhere" element={<div>elsewhere</div>} />
      </Routes>
      <SessionsDock />
    </SessionsProvider>
  )
}

describe('port-forward sessions', () => {
  it('starts a forward, lists it, survives navigation, and stops it', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Harness />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /forward port/i }))
    expect(screen.getByText(/web-1 8080→80/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('go')) // navigate
    expect(screen.getByText('elsewhere')).toBeInTheDocument()
    expect(screen.getByText(/web-1 8080→80/)).toBeInTheDocument() // dock persists
    fireEvent.click(screen.getByRole('button', { name: /stop/i }))
    expect(screen.queryByText(/web-1 8080→80/)).not.toBeInTheDocument()
  })
})
