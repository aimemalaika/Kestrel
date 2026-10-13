import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { K8sObject } from '../contract/types'

function run(
  name: string,
  status: 'True' | 'False' | 'Unknown',
  reason: string,
  tasks: string[],
): K8sObject {
  return {
    apiVersion: 'tekton.dev/v1',
    kind: 'PipelineRun',
    metadata: { name, namespace: 'default', uid: name, creationTimestamp: '2026-01-01T00:00:00Z' },
    spec: { pipelineRef: { name: 'bp' } },
    status: {
      conditions: [{ type: 'Succeeded', status, reason }],
      childReferences: tasks.map((t) => ({
        kind: 'TaskRun',
        name: `${name}-${t}`,
        pipelineTaskName: t,
      })),
    },
  } as unknown as K8sObject
}
function taskRun(name: string, ok: boolean): K8sObject {
  return {
    apiVersion: 'tekton.dev/v1',
    kind: 'TaskRun',
    metadata: { name, namespace: 'default', uid: name },
    status: { conditions: [{ type: 'Succeeded', status: ok ? 'True' : 'False', reason: 'x' }] },
  } as unknown as K8sObject
}
const RUNS = [
  run('run-ok', 'True', 'Succeeded', ['clone', 'build']),
  run('run-bad', 'False', 'Failed', ['clone', 'build']),
]
const TASKRUNS = [
  taskRun('run-ok-clone', true),
  taskRun('run-ok-build', true),
  taskRun('run-bad-clone', true),
  taskRun('run-bad-build', false),
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
    rows: gvr.resource === 'pipelines' ? PIPES : gvr.resource === 'taskruns' ? TASKRUNS : RUNS,
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
