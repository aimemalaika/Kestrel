import type {
  ObserveClient,
  PromAlert,
  PromResult,
  PromRuleGroup,
  PromTargets,
} from './ObserveClient'

const alerts: PromAlert[] = [
  {
    labels: { alertname: 'HighErrorRate', severity: 'critical', namespace: 'payments' },
    annotations: { summary: 'Error rate above 5% for payments-api' },
    state: 'firing',
    activeAt: '2026-10-13T08:12:00Z',
    value: '7.4e-02',
  },
  {
    labels: { alertname: 'PodCrashLooping', severity: 'warning', namespace: 'web' },
    annotations: { summary: 'Pod web-5d9c is restarting repeatedly' },
    state: 'firing',
    activeAt: '2026-10-13T09:01:00Z',
    value: '3',
  },
  {
    labels: { alertname: 'DiskFillingUp', severity: 'warning', instance: 'node-2' },
    annotations: { summary: 'Disk on node-2 predicted full within 24h' },
    state: 'pending',
    activeAt: '2026-10-13T09:40:00Z',
    value: '8.1e-01',
  },
]

const groups: PromRuleGroup[] = [
  {
    name: 'kestrel.rules',
    file: '/etc/prometheus/rules/kestrel.yaml',
    interval: 30,
    rules: [
      {
        name: 'HighErrorRate',
        query:
          'sum(rate(http_requests_total{code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05',
        type: 'alerting',
        health: 'ok',
        state: 'firing',
        duration: 300,
        labels: { severity: 'critical' },
        annotations: { summary: 'Error rate above 5%' },
        alerts: [alerts[0]],
      },
      {
        name: 'job:http_requests:rate5m',
        query: 'sum by (job) (rate(http_requests_total[5m]))',
        type: 'recording',
        health: 'ok',
      },
    ],
  },
]

const targets: PromTargets = {
  activeTargets: [
    {
      labels: { job: 'kubelet', instance: 'node-1:10250' },
      scrapePool: 'kubelet',
      scrapeUrl: 'https://node-1:10250/metrics',
      health: 'up',
      lastScrape: '2026-10-13T10:00:00Z',
    },
    {
      labels: { job: 'kubelet', instance: 'node-2:10250' },
      scrapePool: 'kubelet',
      scrapeUrl: 'https://node-2:10250/metrics',
      health: 'up',
      lastScrape: '2026-10-13T10:00:01Z',
    },
    {
      labels: { job: 'payments-api', instance: '10.0.3.14:8080' },
      scrapePool: 'payments-api',
      scrapeUrl: 'http://10.0.3.14:8080/metrics',
      health: 'down',
      lastError: 'connection refused',
      lastScrape: '2026-10-13T10:00:02Z',
    },
  ],
  droppedTargets: [],
}

const NOW = 1760349600

export function createMockObserve(): ObserveClient {
  return {
    async config() {
      return {
        prometheus: true,
        alertmanager: false,
        loki: false,
        grafanaUrl: 'https://grafana.example.com',
      }
    },
    async query(expr): Promise<PromResult> {
      return {
        resultType: 'vector',
        result: [
          {
            metric: { __name__: expr, job: 'kubelet', instance: 'node-1:10250' },
            value: [NOW, '1'],
          },
          {
            metric: { __name__: expr, job: 'kubelet', instance: 'node-2:10250' },
            value: [NOW, '1'],
          },
          {
            metric: { __name__: expr, job: 'payments-api', instance: '10.0.3.14:8080' },
            value: [NOW, '0'],
          },
        ],
      }
    },
    async queryRange(expr): Promise<PromResult> {
      const values = (base: number): [number, string][] =>
        Array.from({ length: 12 }, (_, i) => [NOW - (11 - i) * 60, String(base + (i % 4) * 0.1)])
      return {
        resultType: 'matrix',
        result: [
          { metric: { __name__: expr, job: 'kubelet' }, values: values(1) },
          { metric: { __name__: expr, job: 'payments-api' }, values: values(0.2) },
        ],
      }
    },
    async alerts() {
      return alerts
    },
    async rules() {
      return groups
    },
    async targets() {
      return targets
    },
  }
}
