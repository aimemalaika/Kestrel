import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { TaskRunDetail } from './TaskRunDetail'
import type { K8sObject } from '../../contract/types'

vi.mock('../../streaming/LogViewer', () => ({
  LogViewer: (p: { container?: string }) => <div data-testid="logs">{p.container}</div>,
}))

const mk = (over: Record<string, unknown> = {}): K8sObject =>
  ({
    apiVersion: 'tekton.dev/v1',
    kind: 'TaskRun',
    metadata: { name: 'tr-1', namespace: 'default' },
    spec: { params: [{ name: 'url', value: 'git://x' }] },
    status: {
      conditions: [{ type: 'Succeeded', status: 'False', reason: 'Failed', message: 'boom' }],
      startTime: '2026-10-08T10:00:00Z',
      completionTime: '2026-10-08T10:05:00Z',
      podName: 'tr-1-pod',
      results: [{ name: 'IMAGE', value: 'reg/app' }],
      steps: [{ name: 'clone', container: 'step-clone', terminated: { exitCode: 1 } }],
      ...over,
    },
  }) as unknown as K8sObject

const renderIt = (o: K8sObject) =>
  render(
    <MemoryRouter>
      <TaskRunDetail object={o} />
    </MemoryRouter>,
  )

describe('TaskRunDetail', () => {
  it('renders timeline with duration and failure reason', () => {
    renderIt(mk())
    expect(screen.getByText('Failed: boom')).toBeTruthy()
    expect(screen.getByText('5m 0s')).toBeTruthy()
    expect(screen.getByText('2026-10-08T10:00:00Z')).toBeTruthy()
    expect(screen.getByText('2026-10-08T10:05:00Z')).toBeTruthy()
  })

  it('renders steps via TaskRunSteps', () => {
    renderIt(mk())
    expect(screen.getByText('clone')).toBeTruthy()
  })

  it('renders params and results', () => {
    renderIt(mk())
    expect(screen.getByText('url')).toBeTruthy()
    expect(screen.getByText('git://x')).toBeTruthy()
    expect(screen.getByText('IMAGE')).toBeTruthy()
    expect(screen.getByText('reg/app')).toBeTruthy()
  })

  it('links to the backing pod', () => {
    renderIt(mk())
    const a = screen.getByRole('link', { name: 'tr-1-pod' })
    expect(a.getAttribute('href')).toBe('/ns/default/core/v1/pods/tr-1-pod')
  })

  it('omits the pod link when no podName', () => {
    renderIt(mk({ podName: undefined }))
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows Signed badge and transparency link for a signed run', () => {
    const o = mk()
    o.metadata.annotations = {
      'chains.tekton.dev/signed': 'true',
      'chains.tekton.dev/transparency': 'https://rekor.example/entry/1',
    }
    renderIt(o)
    expect(screen.getByText('Chains signature')).toBeTruthy()
    expect(screen.getByText('Signed')).toBeTruthy()
    const link = screen.getByText('View transparency log') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://rekor.example/entry/1')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('shows Unsigned and no transparency link for an unsigned run', () => {
    renderIt(mk())
    expect(screen.getByText('Unsigned')).toBeTruthy()
    expect(screen.queryByText('View transparency log')).toBeNull()
  })
})
