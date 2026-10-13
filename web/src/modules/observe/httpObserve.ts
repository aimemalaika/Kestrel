import { getJSON, q } from '../moduleFetch'
import type {
  ObserveClient,
  ObserveConfig,
  PromAlert,
  PromResult,
  PromRuleGroup,
  PromTargets,
} from './ObserveClient'

// The proxy passes Prometheus' {status, data} envelope through; unwrap data.
interface Envelope<T> {
  status?: string
  data: T
}

export function createHttpObserve(): ObserveClient {
  return {
    config: () => getJSON<ObserveConfig>('/api/observe/config'),
    async query(expr, time) {
      const t = time ? `&time=${q(time)}` : ''
      const r = await getJSON<Envelope<PromResult>>(`/api/observe/query?query=${q(expr)}${t}`)
      return r.data
    },
    async queryRange(expr, start, end, step) {
      const r = await getJSON<Envelope<PromResult>>(
        `/api/observe/query_range?query=${q(expr)}&start=${q(start)}&end=${q(end)}&step=${q(step)}`,
      )
      return r.data
    },
    async alerts() {
      const r = await getJSON<Envelope<{ alerts: PromAlert[] }>>('/api/observe/alerts')
      return r.data?.alerts ?? []
    },
    async rules() {
      const r = await getJSON<Envelope<{ groups: PromRuleGroup[] }>>('/api/observe/rules')
      return r.data?.groups ?? []
    },
    async targets() {
      const r = await getJSON<Envelope<PromTargets>>('/api/observe/targets')
      return r.data
    },
  }
}
