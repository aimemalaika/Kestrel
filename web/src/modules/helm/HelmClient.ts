import { createMockHelm } from './helmMock'

export interface Release {
  name: string
  namespace: string
  revision: number
  status: string
  chart: string
  chartVersion: string
  appVersion: string
  updated: string
}

export interface ReleaseDetail extends Release {
  values: string
  notes: string
  manifestSummary: string
}

export interface ChartRepo {
  name: string
  url: string
}

export interface Chart {
  name: string
  version: string
  description: string
}

export interface HelmClient {
  listReleases(): Promise<Release[]>
  getRelease(ns: string, name: string): Promise<ReleaseDetail>
  listRepos(): Promise<ChartRepo[]>
  listCharts(repo: string): Promise<Chart[]>
}

let shared: HelmClient | undefined

export function createHelmClient(): HelmClient {
  const impl = (import.meta.env.VITE_HELM as string | undefined) ?? 'mock'
  if (impl !== 'mock') throw new Error(`Unknown helm client: ${impl}`)
  shared ??= createMockHelm()
  return shared
}
