import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { useClusterInfo } from './useClusterInfo'

const mock = vi.hoisted(() => ({ clusterInfo: vi.fn() }))
vi.mock('../client/createClient', () => ({
  createClient: () => ({ clusterInfo: mock.clusterInfo }),
}))
const clusterInfo = mock.clusterInfo

function Probe() {
  const { info, error } = useClusterInfo()
  return createElement(
    'div',
    null,
    createElement('span', { 'data-testid': 'name' }, info?.clusterName ?? ''),
    createElement('span', { 'data-testid': 'version' }, info?.serverVersion ?? ''),
    createElement('span', { 'data-testid': 'state' }, error ? 'error' : 'ok'),
  )
}

describe('useClusterInfo', () => {
  // Each test sets its own clusterInfo() result (resolve/reject), which replaces
  // the prior implementation — so no mockReset() between tests. (mockReset here
  // interacts badly with Vitest's unhandled-rejection tracking and the mocked
  // rejected promise, flagging an already-handled rejection as unhandled.)

  it('exposes the cluster info after it resolves', async () => {
    clusterInfo.mockResolvedValue({
      clusterName: 'brd-hq-cluster',
      serverVersion: 'v1.33.4',
      apiServerURL: 'https://api.brd-hq-cluster.brd.rw:8443',
    })
    render(createElement(Probe))
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('brd-hq-cluster'))
    expect(screen.getByTestId('version')).toHaveTextContent('v1.33.4')
    expect(screen.getByTestId('state')).toHaveTextContent('ok')
  })

  it('reports error:true when the request rejects', async () => {
    clusterInfo.mockRejectedValue({ error: 'unreachable', code: 503, reason: '' })
    render(createElement(Probe))
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('error'))
    expect(screen.getByTestId('name')).toHaveTextContent('')
  })
})
