import { useEffect, useState } from 'react'
import { createObserveClient, type ObserveClient, type PromResult } from './ObserveClient'

// Per-node %, keyed on the `node` label. These assume node-exporter plus a
// `node` label (as kube-prometheus-stack recording rules / relabeling provide).
export const Q_CPU = '(1 - avg by (node) (rate(node_cpu_seconds_total{mode="idle"}[5m]))) * 100'
export const Q_MEM =
  '(1 - sum by (node)(node_memory_MemAvailable_bytes) / sum by (node)(node_memory_MemTotal_bytes)) * 100'
export const Q_STORAGE =
  '(1 - sum by (node)(node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay"}) / sum by (node)(node_filesystem_size_bytes{mountpoint="/"})) * 100'

export interface NodeMetrics {
  cpu?: number
  mem?: number
  storage?: number
}

export interface UseNodeMetrics {
  enabled: boolean
  loading: boolean
  byNode: Map<string, NodeMetrics>
  cluster: NodeMetrics
  grafanaUrl?: string
}

/** Parse a vector result into node name -> % (clamped 0-100). */
export function vectorByNode(res: PromResult): Map<string, number> {
  const out = new Map<string, number>()
  for (const el of res?.result ?? []) {
    const metric: Record<string, string> = el?.metric ?? {}
    const key = metric.node || (metric.instance ? metric.instance.replace(/:\d+$/, '') : '')
    if (!key) continue
    const n = Number(el?.value?.[1])
    if (Number.isNaN(n)) continue
    out.set(key, Math.min(100, Math.max(0, n)))
  }
  return out
}

type Key = keyof NodeMetrics

function average(byNode: Map<string, NodeMetrics>, key: Key): number | undefined {
  const vals = [...byNode.values()].map((m) => m[key]).filter((v): v is number => v !== undefined)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined
}

const EMPTY: UseNodeMetrics = {
  enabled: false,
  loading: true,
  byNode: new Map(),
  cluster: {},
}

export function useNodeMetrics(client: ObserveClient = createObserveClient()): UseNodeMetrics {
  const [state, setState] = useState<UseNodeMetrics>(EMPTY)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let cfg
      try {
        cfg = await client.config()
      } catch {
        if (!cancelled) setState({ ...EMPTY, loading: false })
        return
      }
      if (!cfg.prometheus) {
        if (!cancelled)
          setState({ ...EMPTY, loading: false, grafanaUrl: cfg.grafanaUrl || undefined })
        return
      }
      const run = async (q: string) => {
        try {
          return vectorByNode(await client.query(q))
        } catch {
          return new Map<string, number>()
        }
      }
      const [cpu, mem, storage] = await Promise.all([run(Q_CPU), run(Q_MEM), run(Q_STORAGE)])
      const byNode = new Map<string, NodeMetrics>()
      const merge = (m: Map<string, number>, key: Key) => {
        for (const [node, v] of m) byNode.set(node, { ...byNode.get(node), [key]: v })
      }
      merge(cpu, 'cpu')
      merge(mem, 'mem')
      merge(storage, 'storage')
      const cluster: NodeMetrics = {
        cpu: average(byNode, 'cpu'),
        mem: average(byNode, 'mem'),
        storage: average(byNode, 'storage'),
      }
      if (!cancelled)
        setState({
          enabled: true,
          loading: false,
          byNode,
          cluster,
          grafanaUrl: cfg.grafanaUrl || undefined,
        })
    })()
    return () => {
      cancelled = true
    }
  }, [client])

  return state
}
