import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RunHistory } from './RunHistory'
import { createMockResults } from './resultsMock'
import type { ResultsClient } from './ResultsClient'
import type { ApiError } from '../../contract/types'

function setup(client: ResultsClient = createMockResults()) {
  render(
    <MemoryRouter>
      <RunHistory client={client} />
    </MemoryRouter>,
  )
}

describe('RunHistory', () => {
  it('lists past runs with status', async () => {
    setup()
    expect(await screen.findByText('build-web-x7k2')).toBeInTheDocument()
    expect(screen.getByText('lint-r2d4')).toBeInTheDocument()
    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Succeeded').length).toBeGreaterThan(0)
  })

  it('shows the archived log of a selected run', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'build-api-m3p9' }))
    expect(await screen.findByText(/error: step exited with code 1/)).toBeInTheDocument()
  })

  it('shows a not-configured empty state on a 503', async () => {
    const err: ApiError = { error: 'unconfigured', code: 503, reason: '' }
    setup({
      enabled: false,
      listRuns: () => Promise.reject(err),
      getRun: () => Promise.reject(err),
      getLog: () => Promise.reject(err),
    })
    expect(
      await screen.findByText(/Results not configured \(set --results-url\)/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
