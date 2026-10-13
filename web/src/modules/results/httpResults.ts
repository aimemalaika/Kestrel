import type { K8sObject } from '../../contract/types'
import { getJSON, q } from '../moduleFetch'
import type { ResultsClient, RunSummary } from './ResultsClient'

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'text/plain' } })
  if (!res.ok) {
    let body: { error?: string; code?: number; reason?: string } = {}
    try {
      body = await res.json()
    } catch {
      /* non-JSON body */
    }
    throw {
      error: body.error ?? res.statusText ?? 'request failed',
      code: body.code ?? res.status,
      reason: body.reason ?? '',
    }
  }
  return res.text()
}

export function createHttpResults(): ResultsClient {
  const client: ResultsClient = {
    enabled: false,
    async listRuns(opts) {
      const p = new URLSearchParams()
      if (opts?.namespace) p.set('namespace', opts.namespace)
      if (opts?.kind) p.set('kind', opts.kind)
      const qs = p.toString()
      const { runs } = await getJSON<{ runs: RunSummary[] }>(
        `/api/results/runs${qs ? `?${qs}` : ''}`,
      )
      return runs ?? []
    },
    async getRun(record) {
      return getJSON<K8sObject>(`/api/results/run?record=${q(record)}`)
    },
    async getLog(record) {
      return getText(`/api/results/logs?record=${q(record)}`)
    },
  }

  // Fire-and-forget config probe; failures (e.g. 503) leave enabled false.
  getJSON<{ enabled: boolean }>('/api/results/config')
    .then((cfg) => {
      client.enabled = cfg.enabled
    })
    .catch(() => {
      /* leave enabled false */
    })

  return client
}
