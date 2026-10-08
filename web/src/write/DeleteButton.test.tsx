import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../toast/ToastProvider'
import { DeleteButton } from './DeleteButton'

const target = {
  group: 'core',
  version: 'v1',
  resource: 'pods',
  namespace: 'default',
  name: 'web-1',
}

function renderBtn() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <DeleteButton target={target} />
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('DeleteButton', () => {
  it('confirms then deletes and toasts', async () => {
    renderBtn()
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i })) // confirm
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/deleted/i))
  })

  it('cancel closes the dialog without deleting', () => {
    renderBtn()
    fireEvent.click(screen.getByRole('button', { name: /delete web-1/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
