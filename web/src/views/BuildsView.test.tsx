import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { BuildsView } from './BuildsView'

const override = vi.hoisted(() => ({ streams: null as Record<string, unknown[]> | null }))
vi.mock('../table/useResourceStream', async (orig) => {
  const actual = await orig<typeof import('../table/useResourceStream')>()
  return {
    ...actual,
    useResourceStream: (...a: Parameters<typeof actual.useResourceStream>) =>
      override.streams
        ? { rows: override.streams[a[0]!.resource] ?? [], status: 'ready' }
        : actual.useResourceStream(...a),
  }
})

afterEach(() => {
  override.streams = null
})

describe('BuildsView', () => {
  it('lists seeded builds, Running then Failed first, with status badges', async () => {
    render(<BuildsView />)
    expect(await screen.findByText('shop-web-2')).toBeInTheDocument()
    const rows = within(screen.getByRole('table', { name: 'Builds' })).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('shop-web-2')
    expect(rows[1]).toHaveTextContent('Running')
    expect(rows[2]).toHaveTextContent('api-1')
    expect(rows[2]).toHaveTextContent('Failed')
    expect(rows[3]).toHaveTextContent('Complete')
  })

  it('shows trigger chip and commit hash', () => {
    override.streams = {
      builds: [
        {
          apiVersion: 'build.openshift.io/v1',
          kind: 'Build',
          metadata: { name: 'b-1', namespace: 'ns' },
          spec: { triggeredBy: 'Webhook', commit: 'abcdef1234567' },
          status: { phase: 'Running', duration: '2m 3s' },
        },
      ],
    }
    render(<BuildsView />)
    expect(screen.getByText('Webhook')).toBeInTheDocument()
    expect(screen.getByText('abcdef1')).toBeInTheDocument()
    expect(screen.getByText('2m 3s')).toBeInTheDocument()
  })

  it('switches tabs', async () => {
    render(<BuildsView />)
    await screen.findByText('shop-web-2')
    fireEvent.click(screen.getByRole('button', { name: 'BuildConfigs' }))
    expect(screen.queryByRole('table', { name: 'Builds' })).toBeNull()
    expect(screen.getByRole('table', { name: 'BuildConfigs' })).toBeInTheDocument()
    expect(screen.getByText('Build Strategy')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ImageStreams' }))
    expect(screen.getByRole('table', { name: 'ImageStreams' })).toBeInTheDocument()
    expect(screen.getByText('latest, v1')).toBeInTheDocument()
  })

  it('shows empty state when there are no ImageStreams', () => {
    override.streams = {}
    render(<BuildsView />)
    fireEvent.click(screen.getByRole('button', { name: 'ImageStreams' }))
    expect(screen.getByText('No ImageStreams found in selected namespace')).toBeInTheDocument()
  })
})
