import type { K8sObject } from '../../contract/types'
import { createMockResults } from './resultsMock'
import { createHttpResults } from './httpResults'

export interface RunSummary {
  uid: string
  kind: 'PipelineRun' | 'TaskRun'
  namespace: string
  name: string
  status: string
  startTime?: string
  completionTime?: string
  recordName: string
}

export interface ResultsClient {
  /** Best-effort: true once /api/results/config reports a configured backend. */
  enabled: boolean
  listRuns(opts?: { namespace?: string; kind?: string }): Promise<RunSummary[]>
  getRun(record: string): Promise<K8sObject>
  getLog(record: string): Promise<string>
}

let shared: ResultsClient | undefined

export function createResultsClient(): ResultsClient {
  // Follow the main client's mock/http choice (VITE_CLIENT) by default so
  // `make dev` shows mock run-history instead of a 503 "not configured";
  // VITE_RESULTS overrides it if set. Production (neither set) → http.
  const impl =
    (import.meta.env.VITE_RESULTS as string | undefined) ??
    (import.meta.env.VITE_CLIENT as string | undefined) ??
    'http'
  if (impl !== 'mock' && impl !== 'http') throw new Error(`Unknown results client: ${impl}`)
  shared ??= impl === 'mock' ? createMockResults() : createHttpResults()
  return shared
}
