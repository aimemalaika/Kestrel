// Alerts are not a Kubernetes resource; this is a static demo dataset until a
// real alerting backend is wired in. Names are vendor-neutral.
export type AlertSeverity = 'critical' | 'warning' | 'info'
export type AlertState = 'Firing' | 'Pending'

export interface Alert {
  id: string
  name: string
  severity: AlertSeverity
  state: AlertState
  namespace: string
  component: string
  message: string
  age: string
  runbook?: string
}

export interface AlertRule {
  name: string
  severity: AlertSeverity
  state: AlertState
  duration: string
  source: string
}

export const ALERTS: Alert[] = [
  {
    id: 'a1',
    name: 'NodeNotReady',
    severity: 'critical',
    state: 'Firing',
    namespace: 'kube-system',
    component: 'kubelet',
    message: 'Node worker-02 has been NotReady for more than 5 minutes.',
    age: '12m',
    runbook: 'https://runbooks.example.com/node-not-ready',
  },
  {
    id: 'a2',
    name: 'PodCrashLooping',
    severity: 'critical',
    state: 'Firing',
    namespace: 'payments',
    component: 'checkout-api',
    message: 'Pod checkout-api-6f9c restarted 14 times in the last 30 minutes.',
    age: '28m',
    runbook: 'https://runbooks.example.com/pod-crash-looping',
  },
  {
    id: 'a3',
    name: 'HighMemoryUsage',
    severity: 'warning',
    state: 'Firing',
    namespace: 'monitoring',
    component: 'metrics-store',
    message: 'Memory usage is above 90% of the container limit.',
    age: '1h',
    runbook: 'https://runbooks.example.com/high-memory',
  },
  {
    id: 'a4',
    name: 'PersistentVolumeFillingUp',
    severity: 'warning',
    state: 'Pending',
    namespace: 'data',
    component: 'orders-db',
    message: 'Volume data-orders-db-0 is projected to fill within 24 hours.',
    age: '3m',
  },
  {
    id: 'a5',
    name: 'CertificateExpiringSoon',
    severity: 'info',
    state: 'Pending',
    namespace: 'ingress',
    component: 'cert-manager',
    message: 'Certificate web-tls expires in 12 days.',
    age: '2d',
    runbook: 'https://runbooks.example.com/cert-expiry',
  },
]

export const ALERT_RULES: AlertRule[] = ALERTS.map((a) => ({
  name: a.name,
  severity: a.severity,
  state: a.state,
  duration: a.age,
  source: 'PrometheusRule',
}))

export function firingAlerts(): Alert[] {
  return ALERTS.filter((a) => a.state === 'Firing')
}
