import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { K8sObject } from '../contract/types'

function run(
  name: string,
  status: 'True' | 'False' | 'Unknown',
  reason: string,
  tasks: unknown[],
): K8sObject {
  return {
    apiVersion: 'tekton.dev/v1',
    kind: 'PipelineRun',
    metadata: { name, namespace: 'default', uid: name, creationTimestamp: '2026-01-01T00:00:00Z' },
    spec: { pipelineRef: { name: 'bp' } },
    status: { conditions: [{ type: 'Succeeded', status, reason }], taskRuns: tasks },
  } as unknown as K8sObject
}
const RUNS = [
  run('run-ok', 'True', 'Succeeded', [
    { name: 'a', pipelineTaskName: 'clone', succeeded: true },
    { name: 'b', pipelineTaskName: 'build', succeeded: true },
  ]),
  run('run-bad', 'False', 'Failed', [
    { name: 'a', pipelineTaskName: 'clone', succeeded: true },
    { name: 'b', pipelineTaskName: 'build', steps: [{ name: 's', status: 'Error' }] },
  ]),
]
const PIPES = [
  {
    apiVersion: 'tekton.dev/v1',
    kind: 'Pipeline',
    metadata: { name: 'bp', uid: 'bp' },
    spec: { tasks: [{ name: 'clone' }, { name: 'build' }, { name: 'push' }] },
  },
] as unknown as K8sObject[]

vi.mock('../table/useResourceStream', () => ({
  useResourceStream: (gvr: { resource: string }) => ({
    rows: gvr.resource === 'pipelines' ? PIPES : RUNS,
    status: 'ready',
  }),
}))

import { PipelinesView } from './PipelinesView'

describe('PipelinesView', () => {
  it('renders a card per run with stages', () => {
    render(<PipelinesView />)
    const cards = screen.getAllByTestId('pipeline-run')
    expect(cards).toHaveLength(2)
    const bad = cards.find((c) => within(c).queryByText('run-bad'))!
    expect(within(bad).getByText('clone')).toBeInTheDocument()
    expect(within(bad).getByText('build')).toBeInTheDocument()
    expect(within(bad).getByText('push')).toBeInTheDocument()
    expect(within(bad).getByText('(Failed)')).toBeInTheDocument()
  })

  it('filters by status chip', () => {
    render(<PipelinesView />)
    fireEvent.click(screen.getByRole('button', { name: 'Failed' }))
    const cards = screen.getAllByTestId('pipeline-run')
    expect(cards).toHaveLength(1)
    expect(within(cards[0]).getByText('run-bad')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Running' }))
    expect(screen.queryAllByTestId('pipeline-run')).toHaveLength(0)
    expect(screen.getByText('No matching pipeline runs.')).toBeInTheDocument()
  })
})
