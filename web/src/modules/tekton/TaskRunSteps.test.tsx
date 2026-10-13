import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TaskRunSteps } from './TaskRunSteps'
import type { K8sObject } from '../../contract/types'

const logProps: { name: string; container?: string }[] = []
vi.mock('../../streaming/LogViewer', () => ({
  LogViewer: (p: { pod: { name: string }; container?: string }) => {
    logProps.push({ name: p.pod.name, container: p.container })
    return <div data-testid="logs">{`${p.pod.name}/${p.container}`}</div>
  },
}))

vi.mock('../results/ResultsClient', () => ({
  createResultsClient: () => ({ getLog: async () => 'archived line 1' }),
}))

const mk = (podName?: string, record?: string): K8sObject =>
  ({
    kind: 'TaskRun',
    metadata: {
      name: 'tr',
      namespace: 'default',
      annotations: record ? { 'results.tekton.dev/record': record } : undefined,
    },
    status: {
      podName,
      steps: [
        { name: 'clone', container: 'step-clone', terminated: { exitCode: 0 } },
        { name: 'build', container: 'step-build', terminated: { exitCode: 1 } },
        { name: 'push', container: 'step-push' },
      ],
    },
  }) as unknown as K8sObject

describe('TaskRunSteps', () => {
  it('lists steps with badges and defaults to the first failed step', () => {
    render(<TaskRunSteps taskRun={mk('tr-pod')} />)
    expect(screen.getByText('clone')).toBeTruthy()
    expect(screen.getByText('Succeeded')).toBeTruthy()
    expect(screen.getByText('Failed')).toBeTruthy()
    expect(screen.getByTestId('logs').textContent).toBe('tr-pod/step-build')
  })

  it('selecting a step mounts the viewer for its container', () => {
    render(<TaskRunSteps taskRun={mk('tr-pod')} />)
    fireEvent.click(screen.getByRole('button', { name: /clone/ }))
    expect(screen.getByTestId('logs').textContent).toBe('tr-pod/step-clone')
  })

  it('shows a fallback when the pod is gone', () => {
    render(<TaskRunSteps taskRun={mk()} />)
    expect(screen.queryByTestId('logs')).toBeNull()
    expect(screen.getByText(/logs unavailable/)).toBeTruthy()
  })

  it('shows the archived log when the pod is gone but a Results record exists', async () => {
    render(<TaskRunSteps taskRun={mk(undefined, 'ns/results/x/records/y')} />)
    await waitFor(() => expect(screen.getByText('archived line 1')).toBeTruthy())
    expect(screen.queryByTestId('logs')).toBeNull()
    expect(screen.queryByText(/logs unavailable/)).toBeNull()
  })

  it('keeps the live viewer when the pod exists even with a record', () => {
    render(<TaskRunSteps taskRun={mk('tr-pod', 'r')} />)
    expect(screen.getByTestId('logs')).toBeTruthy()
    expect(screen.queryByTestId('archived-log')).toBeNull()
  })
})
