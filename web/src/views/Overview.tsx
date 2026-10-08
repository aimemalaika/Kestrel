import type { ReactNode } from 'react'
import { useResourceStream } from '../table/useResourceStream'
import { getPath } from '../table/columns'
import type { K8sObject } from '../contract/types'

const PODS = { group: 'core', version: 'v1', resource: 'pods' }
const DEPLOYMENTS = { group: 'apps', version: 'v1', resource: 'deployments' }
const NODES = { group: 'core', version: 'v1', resource: 'nodes' }
const NAMESPACES = { group: 'core', version: 'v1', resource: 'namespaces' }

function nodeReady(n: K8sObject): boolean {
  const c = getPath(n, 'status.conditions')
  return Array.isArray(c) && c.some((x) => x?.type === 'Ready' && x?.status === 'True')
}

function Card({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  return (
    <div
      data-testid={testId}
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--r-card)',
        boxShadow: 'var(--shadow-card)',
        padding: 'var(--space-4)',
      }}
    >
      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{title}</div>
      {children}
    </div>
  )
}

function Count({ n }: { n: number }) {
  return <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--text)' }}>{n}</div>
}

function Sub({
  ok,
  bad,
  okLabel,
  badLabel,
}: {
  ok: number
  bad: number
  okLabel: string
  badLabel: string
}) {
  return (
    <div style={{ fontSize: 12, display: 'flex', gap: 'var(--space-3)' }}>
      <span style={{ color: 'var(--ok-fg)' }}>
        {ok} {okLabel}
      </span>
      <span style={{ color: bad > 0 ? 'var(--risk-fg)' : 'var(--text-muted)' }}>
        {bad} {badLabel}
      </span>
    </div>
  )
}

export function Overview() {
  const pods = useResourceStream(PODS, undefined).rows
  const deployments = useResourceStream(DEPLOYMENTS, undefined).rows
  const nodes = useResourceStream(NODES, undefined).rows
  const namespaces = useResourceStream(NAMESPACES, undefined).rows

  const podsRunning = pods.filter((p) => getPath(p, 'status.phase') === 'Running').length
  const nodesReady = nodes.filter(nodeReady).length

  return (
    <div style={{ padding: 'var(--space-6)' }}>
      <h2 style={{ marginTop: 0 }}>Overview</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        <Card title="Pods" testId="card-pods">
          <Count n={pods.length} />
          <Sub
            ok={podsRunning}
            bad={pods.length - podsRunning}
            okLabel="Running"
            badLabel="Not running"
          />
        </Card>
        <Card title="Deployments" testId="card-deployments">
          <Count n={deployments.length} />
        </Card>
        <Card title="Nodes" testId="card-nodes">
          <Count n={nodes.length} />
          <Sub
            ok={nodesReady}
            bad={nodes.length - nodesReady}
            okLabel="Ready"
            badLabel="Not ready"
          />
        </Card>
        <Card title="Namespaces" testId="card-namespaces">
          <Count n={namespaces.length} />
        </Card>
      </div>
    </div>
  )
}
