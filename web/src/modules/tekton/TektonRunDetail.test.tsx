import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TektonRunDetail } from './TektonRunDetail'
import type { K8sObject } from '../../contract/types'

const run: K8sObject = {
  apiVersion: 'tekton.dev/v1',
  kind: 'PipelineRun',
  metadata: { name: 'build-1', namespace: 'default' },
  spec: {
    pipelineRef: { name: 'bp' },
    params: [{ name: 'url', value: 'git://x' }],
    workspaces: [{ name: 'source' }],
  },
  status: {
    conditions: [{ type: 'Succeeded', status: 'False', reason: 'Failed', message: 'boom' }],
    startTime: '2026-10-08T10:00:00Z',
    completionTime: '2026-10-08T10:05:00Z',
    results: [{ name: 'IMAGE', value: 'reg/app' }],
    childReferences: [
      { kind: 'TaskRun', name: 'build-1-fetch', pipelineTaskName: 'fetch' },
      { kind: 'TaskRun', name: 'build-1-test', pipelineTaskName: 'test' },
    ],
  },
} as unknown as K8sObject

const tr = (name: string, ok: boolean, step: string, exitCode: number): K8sObject =>
  ({
    apiVersion: 'tekton.dev/v1',
    kind: 'TaskRun',
    metadata: { name, namespace: 'default' },
    status: {
      conditions: [{ type: 'Succeeded', status: ok ? 'True' : 'False', reason: 'x' }],
      podName: `${name}-pod`,
      steps: [{ name: step, container: `step-${step}`, terminated: { exitCode } }],
    },
  }) as unknown as K8sObject

const TASKRUNS = [tr('build-1-fetch', true, 'clone', 0), tr('build-1-test', false, 'unit', 1)]

vi.mock('../../streaming/LogViewer', () => ({
  LogViewer: (p: { container?: string }) => <div data-testid="logs">{p.container}</div>,
}))

const PIPELINE = {
  kind: 'Pipeline',
  metadata: { name: 'bp', namespace: 'default' },
  spec: { tasks: [{ name: 'fetch' }, { name: 'test' }, { name: 'deploy' }] },
} as unknown as K8sObject

vi.mock('../../table/useResourceStream', () => ({
  useResourceStream: (gvr: { resource: string }) => ({
    rows: gvr.resource === 'taskruns' ? TASKRUNS : [PIPELINE],
    status: 'ready',
  }),
}))

describe('TektonRunDetail', () => {
  it('renders timeline with duration and failure reason', () => {
    render(<TektonRunDetail object={run} />)
    expect(screen.getByText('Failed: boom')).toBeTruthy()
    expect(screen.getByText('5m 0s')).toBeTruthy()
    expect(screen.getByText('2026-10-08T10:00:00Z')).toBeTruthy()
    expect(screen.getByText('2026-10-08T10:05:00Z')).toBeTruthy()
  })

  it('renders stage pills, including pending pipeline tasks', () => {
    render(<TektonRunDetail object={run} />)
    expect(screen.getByRole('button', { name: /fetch/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /test/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /deploy/ })).toBeTruthy()
  })

  it('selecting a stage reveals its steps and logs', () => {
    render(<TektonRunDetail object={run} />)
    fireEvent.click(screen.getByRole('button', { name: /test/ }))
    expect(screen.getByText('unit')).toBeTruthy()
    expect(screen.getByTestId('logs').textContent).toBe('step-unit')
    fireEvent.click(screen.getByRole('button', { name: /fetch/ }))
    expect(screen.getByText('clone')).toBeTruthy()
  })

  it('renders params, results, workspaces and pipeline spec', () => {
    render(<TektonRunDetail object={run} />)
    expect(screen.getByText('url')).toBeTruthy()
    expect(screen.getByText('git://x')).toBeTruthy()
    expect(screen.getByText('IMAGE')).toBeTruthy()
    expect(screen.getByText('reg/app')).toBeTruthy()
    expect(screen.getByText('source')).toBeTruthy()
    expect(screen.getByText('Pipeline spec')).toBeTruthy()
  })

  it('shows Signed badge and transparency link for a signed run', () => {
    render(
      <TektonRunDetail
        object={
          {
            ...run,
            metadata: {
              ...run.metadata,
              annotations: {
                'chains.tekton.dev/signed': 'true',
                'chains.tekton.dev/transparency': 'https://rekor.example/entry/1',
              },
            },
          } as K8sObject
        }
      />,
    )
    expect(screen.getByText('Chains signature')).toBeTruthy()
    expect(screen.getByText('Signed')).toBeTruthy()
    const link = screen.getByText('View transparency log') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://rekor.example/entry/1')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('shows Unsigned and no transparency link for an unsigned run', () => {
    render(<TektonRunDetail object={run} />)
    expect(screen.getByText('Unsigned')).toBeTruthy()
    expect(screen.queryByText('View transparency log')).toBeNull()
  })
})
