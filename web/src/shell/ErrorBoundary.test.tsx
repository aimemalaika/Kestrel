import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

function Boom({ crash }: { crash: boolean }): React.ReactElement {
  if (crash) throw new Error('kaboom')
  return <div>safe content</div>
}

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary label="This view">
        <Boom crash={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('safe content')).toBeInTheDocument()
  })

  it('catches a child error and shows the fallback instead of unmounting the tree', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary label="This view">
        <Boom crash={true} />
      </ErrorBoundary>,
    )
    expect(screen.queryByText('safe content')).not.toBeInTheDocument()
    expect(screen.getByText(/This view hit an error/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    spy.mockRestore()
  })

  it('clears the error and re-renders children when "Try again" is clicked', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onReset = vi.fn()
    function Harness() {
      const [crash, setCrash] = useState(true)
      return (
        <ErrorBoundary
          label="This view"
          onReset={() => {
            onReset()
            setCrash(false)
          }}
        >
          <Boom crash={crash} />
        </ErrorBoundary>
      )
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onReset).toHaveBeenCalled()
    expect(screen.getByText('safe content')).toBeInTheDocument()
    spy.mockRestore()
  })
})
