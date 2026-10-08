import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApiExplorerView } from './ApiExplorerView'
import { createClient } from '../client/createClient'

describe('ApiExplorerView', () => {
  it('lists catalog kinds and filters by search', async () => {
    const catalog = await createClient().catalog()
    expect(catalog.length).toBeGreaterThan(1)
    render(<ApiExplorerView />)
    await waitFor(() =>
      expect(screen.getByRole('table', { name: 'API resource kinds' })).toBeInTheDocument(),
    )
    expect(screen.getAllByRole('row')).toHaveLength(catalog.length + 1)
    const kind = catalog[0].kind
    fireEvent.change(screen.getByLabelText('Filter by name'), { target: { value: kind } })
    const expected = catalog.filter((e) =>
      `${e.kind} ${e.group} ${e.resource}`.toLowerCase().includes(kind.toLowerCase()),
    ).length
    expect(screen.getAllByRole('row')).toHaveLength(expected + 1)
  })
})
