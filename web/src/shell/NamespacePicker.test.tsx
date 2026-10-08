import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { NamespacePicker } from './NamespacePicker'

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="path">{loc.pathname}</div>
}

describe('NamespacePicker', () => {
  it('lists namespaces from the mock and navigates on change', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <NamespacePicker />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )
    const select = (await screen.findByRole('combobox')) as HTMLSelectElement
    expect(await screen.findByRole('option', { name: 'shop' })).toBeInTheDocument()
    fireEvent.change(select, { target: { value: 'shop' } })
    expect(screen.getByTestId('path').textContent).toBe('/ns/shop')
  })
})
