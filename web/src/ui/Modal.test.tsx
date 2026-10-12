import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Modal } from './Modal'

describe('Modal', () => {
  it('renders a labelled dialog with its body when open', () => {
    render(
      <Modal open onClose={() => {}} title="About Kestrel">
        body
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'About Kestrel' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="About Kestrel">
        body
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Escape closes', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="About Kestrel">
        body
      </Modal>,
    )
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('backdrop click closes, panel click does not', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="About Kestrel">
        <span>panel-body</span>
      </Modal>,
    )
    fireEvent.click(screen.getByText('panel-body'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('modal-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
