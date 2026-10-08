import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TektonRunDetail } from './TektonRunDetail'
import type { K8sObject } from '../../contract/types'

const run: K8sObject = {
  apiVersion: 'tekton.dev/v1',
  kind: 'PipelineRun',
  metadata: { name: 'build-1' },
  status: {
    conditions: [{ type: 'Succeeded', status: 'False', reason: 'Failed' }],
    startTime: '2026-10-08T10:00:00Z',
    completionTime: '2026-10-08T10:05:00Z',
    taskRuns: [
      { name: 'fetch', succeeded: true, steps: [{ name: 'clone', status: 'Completed' }] },
      { name: 'test', succeeded: false, steps: [{ name: 'unit', status: 'Error' }] },
    ],
  },
} as K8sObject

describe('TektonRunDetail', () => {
  it('renders condition, tasks and steps', () => {
    render(<TektonRunDetail object={run} />)
    expect(screen.getAllByText('Failed').length).toBe(2)
    expect(screen.getByText('fetch')).toBeTruthy()
    expect(screen.getByText('test')).toBeTruthy()
    expect(screen.getByText('clone: Completed')).toBeTruthy()
    expect(screen.getByText('unit: Error')).toBeTruthy()
    expect(screen.getByText('2026-10-08T10:00:00Z')).toBeTruthy()
  })
})
