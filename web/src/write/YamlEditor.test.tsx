import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '../toast/ToastProvider'

vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="cm" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))
vi.mock('@codemirror/lang-yaml', () => ({ yaml: () => [] }))

import YamlEditor from './YamlEditor'
import type { K8sObject } from '../contract/types'

const pod: K8sObject = {
  apiVersion: 'v1',
  kind: 'Pod',
  metadata: { name: 'web-1', namespace: 'default' },
  status: { phase: 'Running' },
}

function renderEditor() {
  return render(
    <ToastProvider>
      <YamlEditor object={pod} />
    </ToastProvider>,
  )
}

describe('YamlEditor', () => {
  it('previews a dry-run diff of the edits', async () => {
    renderEditor()
    const cm = screen.getByTestId('cm') as HTMLTextAreaElement
    fireEvent.change(cm, { target: { value: cm.value.replace('Running', 'Pending') } })
    fireEvent.click(screen.getByRole('button', { name: /preview/i }))
    await waitFor(() => expect(screen.getByTestId('diff')).toBeInTheDocument())
    expect(screen.getByTestId('diff').textContent).toMatch(/Pending/)
  })

  it('applies and toasts success', async () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/applied/i))
  })

  it('rejects non-Kubernetes YAML with an error toast', async () => {
    renderEditor()
    fireEvent.change(screen.getByTestId('cm'), { target: { value: 'just a string' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/kubernetes object/i))
  })
})
