import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../toast/ToastProvider'
import { AppRoutes } from '../routes'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('DetailDrawer can-i gating', () => {
  it('enables Delete for an allowed (default) object', async () => {
    renderAt('/ns/default/core/v1/pods/web-1')
    const del = await screen.findByRole('button', { name: /delete web-1/i })
    await waitFor(() => expect(del).not.toBeDisabled())
  })

  it('disables Delete for a denied (kube-system) object', async () => {
    renderAt('/ns/kube-system/core/v1/pods/web-1')
    const del = await screen.findByRole('button', { name: /delete web-1/i })
    await waitFor(() => expect(del).toBeDisabled())
  })
})
