import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { LogViewer } from './LogViewer'

const sinks: ((line: string) => void)[] = []
vi.mock('../client/createClient', () => ({
  createClient: () => ({
    logs: (_ref: unknown, onLine: (l: string) => void) => {
      sinks.push(onLine)
      return () => {}
    },
  }),
}))

beforeEach(() => {
  sinks.length = 0
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

const pod = { group: 'core', version: 'v1', resource: 'pods', namespace: 'default', name: 'web-1' }

describe('LogViewer', () => {
  it('appends streamed lines and filters them', () => {
    render(<LogViewer pod={pod} />)
    act(() => {
      sinks[0]('alpha line')
      sinks[0]('beta line')
    })
    expect(screen.getByText(/alpha line/)).toBeInTheDocument()
    expect(screen.getByText(/beta line/)).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: 'alpha' } })
    expect(screen.getByText(/alpha line/)).toBeInTheDocument()
    expect(screen.queryByText(/beta line/)).not.toBeInTheDocument()
  })
})
