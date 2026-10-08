import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QuotasView, parseQuantity } from './QuotasView'

describe('QuotasView', () => {
  it('parses quantities', () => {
    expect(parseQuantity('500m')).toBeCloseTo(0.5)
    expect(parseQuantity('2Gi')).toBe(2 * 1024 ** 3)
  })
  it('renders quota bars per namespace', async () => {
    render(<QuotasView />)
    await waitFor(() => expect(screen.getByText('shop – ResourceQuota')).toBeInTheDocument())
    expect(screen.getByText('default – ResourceQuota')).toBeInTheDocument()
    expect(screen.getByText('9 / 20 (45%)')).toBeInTheDocument()
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThanOrEqual(5)
  })
})
