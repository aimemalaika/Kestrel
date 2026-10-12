import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { NamespacePicker } from './NamespacePicker'

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="path">{loc.pathname}</div>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NamespacePicker />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('NamespacePicker', () => {
  it('preserves the current gvr when changing namespace', async () => {
    renderAt('/ns/sonarqube/core/v1/pods')
    const select = (await screen.findByRole('combobox')) as HTMLSelectElement
    expect(await screen.findByRole('option', { name: 'shop' })).toBeInTheDocument()
    fireEvent.change(select, { target: { value: 'shop' } })
    expect(screen.getByTestId('path').textContent).toBe('/ns/shop/core/v1/pods')
  })

  it('drops a specific resource name but keeps the gvr', async () => {
    renderAt('/ns/sonarqube/core/v1/pods/web-1')
    const select = (await screen.findByRole('combobox')) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'shop' } })
    expect(screen.getByTestId('path').textContent).toBe('/ns/shop/core/v1/pods')
  })

  it('routes to All-Namespaces for the same gvr via the _all sentinel', async () => {
    renderAt('/ns/sonarqube/core/v1/pods')
    const select = (await screen.findByRole('combobox')) as HTMLSelectElement
    fireEvent.change(select, { target: { value: '_all' } })
    expect(screen.getByTestId('path').textContent).toBe('/ns/_all/core/v1/pods')
  })

  it('navigates to bare /ns/<ns> when no resource is selected', async () => {
    renderAt('/ns/sonarqube')
    const select = (await screen.findByRole('combobox')) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'shop' } })
    expect(screen.getByTestId('path').textContent).toBe('/ns/shop')
  })
})
