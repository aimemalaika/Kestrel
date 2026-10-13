import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ObserveClient, PromResult } from './ObserveClient'
import { Q_CPU, Q_MEM, Q_STORAGE, useNodeMetrics, vectorByNode } from './useNodeMetrics'

const vec = (rows: [string, string][]): PromResult => ({
  resultType: 'vector',
  result: rows.map(([node, v]) => ({ metric: { node }, value: [1, v] })),
})

function fake(opts: { prometheus?: boolean; fail?: string[] } = {}): ObserveClient {
  const data: Record<string, PromResult> = {
    [Q_CPU]: vec([
      ['a', '10'],
      ['b', '30'],
    ]),
    [Q_MEM]: vec([
      ['a', '40'],
      ['b', '60'],
    ]),
    [Q_STORAGE]: vec([
      ['a', '20'],
      ['b', '80'],
    ]),
  }
  return {
    config: async () => ({
      prometheus: opts.prometheus ?? true,
      alertmanager: false,
      loki: false,
      grafanaUrl: 'https://g.example',
    }),
    query: async (q: string) => {
      if (opts.fail?.includes(q)) throw new Error('boom')
      return data[q]
    },
    queryRange: async () => ({ resultType: 'matrix', result: [] }),
    alerts: async () => [],
    rules: async () => [],
    targets: async () => ({ activeTargets: [] }),
  }
}

describe('useNodeMetrics', () => {
  it('merges per node and averages the cluster', async () => {
    const c = fake()
    const { result } = renderHook(() => useNodeMetrics(c))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.enabled).toBe(true)
    expect(result.current.byNode.get('a')).toEqual({ cpu: 10, mem: 40, storage: 20 })
    expect(result.current.byNode.get('b')).toEqual({ cpu: 30, mem: 60, storage: 80 })
    expect(result.current.cluster).toEqual({ cpu: 20, mem: 50, storage: 50 })
    expect(result.current.grafanaUrl).toBe('https://g.example')
  })

  it('is disabled when prometheus is off', async () => {
    const c = fake({ prometheus: false })
    const { result } = renderHook(() => useNodeMetrics(c))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.enabled).toBe(false)
    expect(result.current.byNode.size).toBe(0)
  })

  it('tolerates a rejecting query', async () => {
    const c = fake({ fail: [Q_MEM] })
    const { result } = renderHook(() => useNodeMetrics(c))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.byNode.get('a')).toEqual({ cpu: 10, storage: 20 })
    expect(result.current.cluster.mem).toBeUndefined()
    expect(result.current.cluster.cpu).toBe(20)
  })
})

describe('vectorByNode', () => {
  it('uses node label, falls back to instance without port, skips NaN/unlabeled, clamps', () => {
    const res: PromResult = {
      resultType: 'vector',
      result: [
        { metric: { node: 'n1' }, value: [1, '12.5'] },
        { metric: { instance: 'n2:9100' }, value: [1, '150'] },
        { metric: { node: 'n3' }, value: [1, 'NaN'] },
        { metric: {}, value: [1, '5'] },
        { metric: { node: 'n4' }, value: [1, '-3'] },
      ],
    }
    const m = vectorByNode(res)
    expect([...m.entries()]).toEqual([
      ['n1', 12.5],
      ['n2', 100],
      ['n4', 0],
    ])
  })
})
