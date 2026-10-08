import type { Chart, ChartRepo, HelmClient, ReleaseDetail } from './HelmClient'

const RELEASES: ReleaseDetail[] = [
  {
    name: 'ingress-nginx',
    namespace: 'ingress',
    revision: 4,
    status: 'deployed',
    chart: 'ingress-nginx',
    chartVersion: '4.11.2',
    appVersion: '1.11.2',
    updated: '2026-10-01T09:12:00Z',
    values: 'controller:\n  replicaCount: 2\n  service:\n    type: LoadBalancer\n',
    notes: 'The ingress-nginx controller has been installed.',
    manifestSummary: 'Deployment x1, Service x2, ConfigMap x1, ServiceAccount x1',
  },
  {
    name: 'postgres',
    namespace: 'data',
    revision: 2,
    status: 'failed',
    chart: 'postgresql',
    chartVersion: '15.5.1',
    appVersion: '16.3.0',
    updated: '2026-10-05T14:40:00Z',
    values: 'auth:\n  database: app\nprimary:\n  persistence:\n    size: 20Gi\n',
    notes: 'Upgrade failed: timed out waiting for the condition.',
    manifestSummary: 'StatefulSet x1, Service x2, Secret x1, PVC x1',
  },
  {
    name: 'prometheus',
    namespace: 'monitoring',
    revision: 7,
    status: 'pending-upgrade',
    chart: 'prometheus',
    chartVersion: '25.27.0',
    appVersion: 'v2.54.1',
    updated: '2026-10-07T18:03:00Z',
    values: 'server:\n  retention: 15d\nalertmanager:\n  enabled: true\n',
    notes: 'Prometheus server is reachable within the cluster on port 80.',
    manifestSummary: 'Deployment x3, Service x3, ConfigMap x2, ClusterRole x2',
  },
]

const REPOS: ChartRepo[] = [
  { name: 'bitnami', url: 'https://charts.bitnami.com/bitnami' },
  { name: 'ingress-nginx', url: 'https://kubernetes.github.io/ingress-nginx' },
]

const CHARTS: Record<string, Chart[]> = {
  bitnami: [
    { name: 'postgresql', version: '15.5.1', description: 'PostgreSQL relational database' },
    { name: 'redis', version: '20.1.0', description: 'In-memory key-value store' },
    { name: 'nginx', version: '18.2.0', description: 'NGINX web server' },
  ],
  'ingress-nginx': [
    { name: 'ingress-nginx', version: '4.11.2', description: 'Ingress controller for Kubernetes' },
  ],
}

export function createMockHelm(): HelmClient {
  return {
    async listReleases() {
      return RELEASES.map((r) => ({
        name: r.name,
        namespace: r.namespace,
        revision: r.revision,
        status: r.status,
        chart: r.chart,
        chartVersion: r.chartVersion,
        appVersion: r.appVersion,
        updated: r.updated,
      }))
    },
    async getRelease(ns, name) {
      const r = RELEASES.find((x) => x.namespace === ns && x.name === name)
      if (!r) throw new Error(`release ${ns}/${name} not found`)
      return { ...r }
    },
    async listRepos() {
      return REPOS.map((r) => ({ ...r }))
    },
    async listCharts(repo) {
      return (CHARTS[repo] ?? []).map((c) => ({ ...c }))
    },
  }
}
