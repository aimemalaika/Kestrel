import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { K8sObject } from '../contract/types'

const many: K8sObject[] = Array.from({ length: 120 }, (_, i) => ({
  apiVersion: 'v1',
  kind: 'Pod',
  metadata: { name: `pod-${String(i).padStart(3, '0')}`, namespace: 'default', uid: `u${i}` },
}))

vi.mock('./useResourceStream', () => ({
  useResourceStream: () => ({ rows: many, status: 'ready' }),
}))

import { ResourceTable } from './ResourceTable'

describe('ResourceTable pagination', () => {
  it('renders one page, pages forward, and labels the table', () => {
    render(
      <MemoryRouter initialEntries={['/ns/default/core/v1/pods']}>
        <ResourceTable />
      </MemoryRouter>,
    )
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(51) // header + 50
    expect(screen.getByText('rows 1–50 of 120')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('rows 51–100 of 120')).toBeInTheDocument()
    expect(screen.getByText('pod-050')).toBeInTheDocument()
    expect(screen.queryByText('pod-000')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /prev/i }))
    expect(screen.getByText('pod-000')).toBeInTheDocument()
  })
})
