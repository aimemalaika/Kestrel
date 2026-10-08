import { describe, it, expect } from 'vitest'
import { columnSpecs, getPath, ageString, scanSummary } from './columns'
import type { K8sObject } from '../contract/types'

const pod: K8sObject = {
  apiVersion: 'v1',
  kind: 'Pod',
  metadata: { name: 'web-1', namespace: 'default', creationTimestamp: '2020-01-01T00:00:00Z' },
  spec: { nodeName: 'node-1' },
  status: { phase: 'Running' },
}

describe('getPath', () => {
  it('reads dot paths and returns undefined for misses', () => {
    expect(getPath(pod, 'status.phase')).toBe('Running')
    expect(getPath(pod, 'spec.nodeName')).toBe('node-1')
    expect(getPath(pod, 'spec.missing.deep')).toBeUndefined()
  })
})

describe('ageString', () => {
  it('formats elapsed time', () => {
    const now = Date.parse('2020-01-01T00:00:45Z')
    expect(ageString('2020-01-01T00:00:00Z', now)).toBe('45s')
    expect(ageString('2020-01-01T00:00:00Z', Date.parse('2020-01-01T02:00:00Z'))).toBe('2h')
    expect(ageString(undefined)).toBe('—')
  })
})

describe('columnSpecs', () => {
  it('default columns + Pod hints, omits Namespace when a namespace is selected', () => {
    const cols = columnSpecs('Pod', { namespaceSelected: true })
    const ids = cols.map((c) => c.id)
    expect(ids).toContain('name')
    expect(ids).not.toContain('namespace')
    expect(ids).toContain('status.phase')
    expect(ids).toContain('status')
    expect(ids).toContain('age')
    expect(cols.find((c) => c.id === 'name')!.value(pod)).toBe('web-1')
  })

  it('includes Namespace when none selected; unknown kind gets defaults only', () => {
    const cols = columnSpecs('Widget', { namespaceSelected: false })
    const ids = cols.map((c) => c.id)
    expect(ids).toContain('namespace')
    expect(ids).toEqual(['name', 'namespace', 'status', 'age'])
  })
})

describe('scanSummary / scan column', () => {
  const run: K8sObject = {
    apiVersion: 'tekton.dev/v1',
    kind: 'PipelineRun',
    metadata: { name: 'r1' },
    status: {
      results: [{ name: 'IMAGE_SCAN_OUTPUT', value: '{"critical":1,"high":2,"medium":3,"low":4}' }],
    },
  }
  it('parses SCAN_OUTPUT counts', () => {
    expect(scanSummary(run)).toEqual({ critical: 1, high: 2, medium: 3, low: 4 })
  })
  it('returns undefined when absent', () => {
    expect(scanSummary(pod)).toBeUndefined()
  })
  it('adds scan column only for PipelineRun', () => {
    const ids = (k: string) => columnSpecs(k, { namespaceSelected: true }).map((c) => c.id)
    expect(ids('PipelineRun')).toContain('scan')
    expect(ids('Pod')).not.toContain('scan')
  })
})
