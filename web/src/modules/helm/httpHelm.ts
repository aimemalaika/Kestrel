import { getJSON, q } from '../moduleFetch'
import type { Chart, ChartRepo, HelmClient, Release, ReleaseDetail } from './HelmClient'

export function createHttpHelm(): HelmClient {
  return {
    async listReleases() {
      return getJSON<Release[]>('/api/helm/releases')
    },
    async getRelease(ns, name) {
      return getJSON<ReleaseDetail>(
        `/api/helm/releases/detail?namespace=${q(ns)}&name=${q(name)}`,
      )
    },
    async listRepos() {
      return getJSON<ChartRepo[]>('/api/helm/repos')
    },
    async listCharts(repo) {
      return getJSON<Chart[]>(`/api/helm/charts?repo=${q(repo)}`)
    },
  }
}
