import { createMockObserve } from './observeMock'
import { createHttpObserve } from './httpObserve'

export interface ObserveConfig {
  prometheus: boolean
  alertmanager: boolean
  loki: boolean
  grafanaUrl: string
}

// Loose Prometheus API shapes; views narrow what they need.
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PromResult {
  resultType: 'vector' | 'matrix' | 'scalar' | 'string' | string
  result: any[]
}

export interface PromAlert {
  labels: Record<string, string>
  annotations: Record<string, string>
  state: 'firing' | 'pending' | 'inactive' | string
  activeAt?: string
  value?: string
}

export interface PromRule {
  name: string
  query: string
  type: string
  health?: string
  state?: string
  duration?: number
  labels?: Record<string, string>
  annotations?: Record<string, string>
  alerts?: PromAlert[]
}

export interface PromRuleGroup {
  name: string
  file?: string
  interval?: number
  rules: PromRule[]
}

export interface PromTarget {
  labels: Record<string, string>
  scrapePool: string
  scrapeUrl: string
  health: 'up' | 'down' | 'unknown' | string
  lastError?: string
  lastScrape?: string
}

export interface PromTargets {
  activeTargets: PromTarget[]
  droppedTargets?: any[]
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface ObserveClient {
  config(): Promise<ObserveConfig>
  query(expr: string, time?: string): Promise<PromResult>
  queryRange(expr: string, start: string, end: string, step: string): Promise<PromResult>
  alerts(): Promise<PromAlert[]>
  rules(): Promise<PromRuleGroup[]>
  targets(): Promise<PromTargets>
}

let shared: ObserveClient | undefined

export function createObserveClient(): ObserveClient {
  // Follow the main client's mock/http choice (VITE_CLIENT) by default so
  // `make dev-ui` shows mock data; VITE_OBSERVE overrides it. Production → http.
  const impl =
    (import.meta.env.VITE_OBSERVE as string | undefined) ??
    (import.meta.env.VITE_CLIENT as string | undefined) ??
    'http'
  if (impl !== 'mock' && impl !== 'http') throw new Error(`Unknown observe client: ${impl}`)
  shared ??= impl === 'mock' ? createMockObserve() : createHttpObserve()
  return shared
}
