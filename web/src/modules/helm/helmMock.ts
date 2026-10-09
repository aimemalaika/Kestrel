import type { Chart, ChartRepo, HelmClient, ReleaseDetail } from './HelmClient'

const DAY = 86_400_000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

const RELEASES: ReleaseDetail[] = [
  {
    name: 'edge-proxy',
    namespace: 'ingress',
    revision: 4,
    status: 'deployed',
    chart: 'edge-proxy',
    chartVersion: '4.11.2',
    appVersion: '1.11.2',
    updated: ago(2 * DAY + 3_600_000),
    values: 'controller:\n  replicaCount: 2\n  service:\n    type: LoadBalancer\n',
    notes: 'The edge-proxy controller has been installed.',
    manifestSummary: 'Deployment x1, Service x2, ConfigMap x1, ServiceAccount x1',
  },
  {
    name: 'orders-db',
    namespace: 'data',
    revision: 2,
    status: 'failed',
    chart: 'sql-database',
    chartVersion: '15.5.1',
    appVersion: '16.3.0',
    updated: ago(5 * 3_600_000),
    values: 'auth:\n  database: app\nprimary:\n  persistence:\n    size: 20Gi\n',
    notes: 'Upgrade failed: timed out waiting for the condition.',
    manifestSummary: 'StatefulSet x1, Service x2, Secret x1, PVC x1',
  },
  {
    name: 'metrics-stack',
    namespace: 'monitoring',
    revision: 7,
    status: 'pending-upgrade',
    chart: 'metrics-stack',
    chartVersion: '25.27.0',
    appVersion: 'v2.54.1',
    updated: ago(35 * 60_000),
    values: 'server:\n  retention: 15d\nalertmanager:\n  enabled: true\n',
    notes: 'Metrics server is reachable within the cluster on port 80.',
    manifestSummary: 'Deployment x3, Service x3, ConfigMap x2, ClusterRole x2',
  },
  {
    name: 'cache',
    namespace: 'data',
    revision: 3,
    status: 'deployed',
    chart: 'cache',
    chartVersion: '20.1.0',
    appVersion: '7.4.0',
    updated: ago(2 * DAY),
    values: 'architecture: standalone\n',
    notes: 'Cache is ready.',
    manifestSummary: 'StatefulSet x1, Service x1, ConfigMap x1',
  },
  {
    name: 'web-frontend',
    namespace: 'apps',
    revision: 12,
    status: 'deployed',
    chart: 'web',
    chartVersion: '18.2.0',
    appVersion: '1.27.0',
    updated: ago(9 * DAY),
    values: 'replicaCount: 3\n',
    notes: 'Web frontend deployed.',
    manifestSummary: 'Deployment x1, Service x1, Ingress x1',
  },
]

const REPOS: ChartRepo[] = [
  { name: 'stable', url: 'https://charts.example.com/stable' },
  { name: 'edge-proxy', url: 'https://charts.example.com/edge' },
]

const CHARTS: Record<string, Chart[]> = {
  stable: [
    { name: 'sql-database', version: '15.5.1', description: 'Relational database' },
    { name: 'cache', version: '20.1.0', description: 'In-memory key-value store' },
    { name: 'web', version: '18.2.0', description: 'Web server' },
  ],
  'edge-proxy': [
    { name: 'edge-proxy', version: '4.11.2', description: 'Ingress controller for Kubernetes' },
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
