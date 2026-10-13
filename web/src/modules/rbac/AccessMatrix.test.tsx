import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { AccessMatrix } from './AccessMatrix'
import { createMockRbac } from './rbacMock'
import type { RBACClient } from './RBACClient'
import type { K8sObject } from '../../contract/types'

const sa = (namespace: string, name: string) =>
  ({ apiVersion: 'v1', kind: 'ServiceAccount', metadata: { namespace, name } }) as K8sObject

describe('AccessMatrix', () => {
  it('renders rows with allowed/denied verbs and the granting binding', async () => {
    render(<AccessMatrix object={sa('production', 'api-gateway')} client={createMockRbac()} />)
    expect(
      await screen.findByText('system:serviceaccount:production:api-gateway'),
    ).toBeInTheDocument()
    const row = screen.getByText('/pods').closest('tr') as HTMLElement
    expect(within(row).getAllByLabelText(/allowed$/)).toHaveLength(3)
    expect(within(row).getAllByLabelText(/denied$/)).toHaveLength(5)
    expect(within(row).getByText('RO:deployers/deployer')).toBeInTheDocument()
    expect(screen.getByText('apps/deployments')).toBeInTheDocument()
  })

  it('filter narrows rows', async () => {
    render(<AccessMatrix object={sa('production', 'api-gateway')} client={createMockRbac()} />)
    await screen.findByText('apps/deployments')
    fireEvent.change(screen.getByLabelText('Filter resources'), { target: { value: 'deploy' } })
    expect(screen.getByText('apps/deployments')).toBeInTheDocument()
    expect(screen.queryByText('/pods')).toBeNull()
  })

  it('shows an empty state for an unknown service account', async () => {
    render(<AccessMatrix object={sa('x', 'nobody')} client={createMockRbac()} />)
    expect(await screen.findByText(/No permissions found/)).toBeInTheDocument()
  })

  it('shows the empty state when the request fails', async () => {
    const client: RBACClient = { access: () => Promise.reject({ error: 'forbidden', code: 403 }) }
    render(<AccessMatrix object={sa('x', 'y')} client={client} />)
    expect(await screen.findByText(/not permitted to view them/)).toBeInTheDocument()
  })
})
