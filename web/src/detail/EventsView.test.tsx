import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EventsView } from './EventsView'
import type { K8sObject } from '../contract/types'

const web1: K8sObject = {
  apiVersion: 'v1',
  kind: 'Pod',
  metadata: { name: 'web-1', namespace: 'default' },
}

describe('EventsView', () => {
  it('shows events involving this object, not others', async () => {
    render(<EventsView object={web1} />)
    expect(await screen.findByText('Scheduled')).toBeInTheDocument()
    expect(await screen.findByText('Pulled')).toBeInTheDocument()
    // web-1 has exactly 2 events; web-2's event is excluded
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    // newest first
    expect(items[0]).toHaveTextContent('Pulled')
    expect(items[1]).toHaveTextContent('Scheduled')
  })
})
