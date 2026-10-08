import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ToastProvider, useToast } from './ToastProvider'

function Fire() {
  const toast = useToast()
  return (
    <button type="button" onClick={() => toast('ok', 'saved!')}>
      fire
    </button>
  )
}

describe('ToastProvider', () => {
  it('shows a toast when fired', () => {
    render(
      <ToastProvider>
        <Fire />
      </ToastProvider>,
    )
    act(() => {
      screen.getByText('fire').click()
    })
    expect(screen.getByRole('status')).toHaveTextContent('saved!')
  })
})
