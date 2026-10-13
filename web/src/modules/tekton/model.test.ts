import { describe, it, expect } from 'vitest'
import type { K8sObject } from '../../contract/types'
import {
  chainsInfo,
  durationStr,
  params,
  results,
  runStatus,
  stagesFromRun,
  stepPhase,
  steps,
  taskRunFor,
  workspaces,
} from './model'

const obj = (o: Record<string, unknown>, ns = 'default', name = 'x'): K8sObject =>
  ({ metadata: { name, namespace: ns }, ...o }) as unknown as K8sObject
const cond = (status: string, reason = '') => ({
  status: { conditions: [{ type: 'Succeeded', status, reason }] },
})

describe('runStatus', () => {
  it('maps conditions', () => {
    expect(runStatus(obj({}))).toBe('Pending')
    expect(runStatus(obj(cond('True', 'Succeeded')))).toBe('Succeeded')
    expect(runStatus(obj(cond('False', 'Failed')))).toBe('Failed')
    expect(runStatus(obj(cond('False', 'Cancelled')))).toBe('Cancelled')
    expect(runStatus(obj(cond('False', 'PipelineRunCancelled')))).toBe('Cancelled')
    expect(runStatus(obj(cond('Unknown', 'Running')))).toBe('Running')
  })
})

describe('stepPhase', () => {
  it('derives from terminated/running', () => {
    expect(stepPhase({ terminated: { exitCode: 0 } })).toBe('Succeeded')
    expect(stepPhase({ terminated: { exitCode: 2 } })).toBe('Failed')
    expect(stepPhase({ running: {} })).toBe('Running')
    expect(stepPhase({})).toBe('Pending')
  })
})

describe('stagesFromRun', () => {
  const run = obj(
    {
      spec: { pipelineRef: { name: 'bp' } },
      status: {
        ...cond('False', 'Failed').status,
        childReferences: [
          { kind: 'TaskRun', name: 'r-clone', pipelineTaskName: 'clone' },
          { kind: 'TaskRun', name: 'r-build', pipelineTaskName: 'build' },
        ],
      },
    },
    'default',
    'r',
  )
  const trs = [
    obj(
      {
        status: {
          ...cond('True', 'Succeeded').status,
          startTime: '2026-01-01T00:00:00Z',
          completionTime: '2026-01-01T00:01:05Z',
        },
      },
      'default',
      'r-clone',
    ),
    obj({ status: cond('False', 'Failed').status }, 'default', 'r-build'),
  ]
  const pipes = [
    obj({ spec: { tasks: [{ name: 'clone' }, { name: 'build' }, { name: 'push' }] } }, '', 'bp'),
  ]

  it('joins childReferences to TaskRuns and appends skipped tasks', () => {
    expect(stagesFromRun(run, trs, pipes)).toEqual([
      { name: 'clone', status: 'Succeeded', duration: '1m 5s' },
      { name: 'build', status: 'Failed', duration: undefined },
      { name: 'push', status: 'Skipped' },
    ])
  })
  it('marks unstarted tasks Pending for a running run', () => {
    const running = obj(
      { ...run, status: { ...cond('Unknown', 'Running').status, childReferences: [] } },
      'default',
      'r',
    )
    ;(running as unknown as { spec: unknown }).spec = { pipelineRef: { name: 'bp' } }
    expect(stagesFromRun(running, [], pipes).map((s) => s.status)).toEqual([
      'Pending',
      'Pending',
      'Pending',
    ])
  })
  it('taskRunFor resolves by pipelineTaskName', () => {
    expect(taskRunFor(run, 'build', trs)?.metadata.name).toBe('r-build')
    expect(taskRunFor(run, 'nope', trs)).toBeUndefined()
  })
})

describe('readers', () => {
  const tr = obj({
    spec: { params: [{ name: 'a', value: '1' }], workspaces: [{ name: 'src', emptyDir: {} }] },
    status: {
      results: [{ name: 'digest', value: 'sha' }],
      steps: [{ name: 'b', container: 'step-b', terminated: { exitCode: 1 } }],
    },
  })
  it('reads steps, params, results, workspaces', () => {
    expect(steps(tr)).toEqual([{ name: 'b', container: 'step-b', phase: 'Failed' }])
    expect(params(tr)).toEqual([{ name: 'a', value: '1' }])
    expect(results(tr)).toEqual([{ name: 'digest', value: 'sha' }])
    expect(workspaces(tr)).toEqual([{ name: 'src' }])
    expect(steps(obj({}))).toEqual([])
  })
})

describe('durationStr', () => {
  it('formats fixed timestamps', () => {
    expect(durationStr('2026-01-01T00:00:00Z', '2026-01-01T00:00:42Z')).toBe('42s')
    expect(durationStr('2026-01-01T00:00:00Z', '2026-01-01T01:02:00Z')).toBe('1h 2m')
    expect(durationStr('2026-01-01T00:00:00Z', undefined, Date.parse('2026-01-01T00:03:00Z'))).toBe(
      '3m 0s',
    )
    expect(durationStr(undefined)).toBeUndefined()
  })
})

describe('chainsInfo', () => {
  it('reads signed + transparency annotations', () => {
    const o = obj({})
    o.metadata.annotations = {
      'chains.tekton.dev/signed': 'true',
      'chains.tekton.dev/transparency': 'https://rekor.example/e/1',
    }
    expect(chainsInfo(o)).toEqual({ signed: true, transparencyUrl: 'https://rekor.example/e/1' })
  })
  it('is unsigned when the signed annotation is not true', () => {
    const o = obj({})
    o.metadata.annotations = { 'chains.tekton.dev/signed': 'false' }
    expect(chainsInfo(o)).toEqual({ signed: false, transparencyUrl: undefined })
  })
  it('handles absent annotations', () => {
    expect(chainsInfo(obj({}))).toEqual({ signed: false, transparencyUrl: undefined })
  })
})
