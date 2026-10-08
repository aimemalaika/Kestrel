import type { ReactNode } from 'react'
import { useResourceStream } from '../table/useResourceStream'
import { getPath } from '../table/columns'
import type { K8sObject } from '../contract/types'
import { Card, MiniBar, ViewHeader } from '../ui'

const PODS = { group: 'core', version: 'v1', resource: 'pods' }
const DEPLOYMENTS = { group: 'apps', version: 'v1', resource: 'deployments' }
const NODES = { group: 'core', version: 'v1', resource: 'nodes' }
const NAMESPACES = { group: 'core', version: 'v1', resource: 'namespaces' }

function nodeReady(n: K8sObject): boolean {
  const c = getPath(n, 'status.conditions')
  return Array.isArray(c) && c.some((x) => x?.type === 'Ready' && x?.status === 'True')
}

function StatTile({
  title,
  testId,
  children,
}: {
  title: string
  testId: string
  children: ReactNode
}) {
  return (
    <Card className="p-4">
      <div data-testid={testId}>
        <div className="text-xs uppercase tracking-widest text-zinc-500">{title}</div>
        {children}
      </div>
    </Card>
  )
}

function Count({ n }: { n: number }) {
  return <div className="text-3xl font-bold text-zinc-100">{n}</div>
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
    <div className="flex gap-3 text-xs">
      <span className="text-emerald-400">
        {ok} {okLabel}
      </span>
      <span className={bad > 0 ? 'text-red-400' : 'text-zinc-500'}>
        {bad} {badLabel}
      </span>
    </div>
  )
}

export function Overview() {
  const podsS = useResourceStream(PODS, undefined)
  const deploymentsS = useResourceStream(DEPLOYMENTS, undefined)
  const nodesS = useResourceStream(NODES, undefined)
  const namespacesS = useResourceStream(NAMESPACES, undefined)
  const pods = podsS.rows
  const deployments = deploymentsS.rows
  const nodes = nodesS.rows
  const namespaces = namespacesS.rows
  const errored = [podsS, deploymentsS, nodesS, namespacesS].some((s) => s.status === 'error')

  const podsRunning = pods.filter((p) => getPath(p, 'status.phase') === 'Running').length
  const nodesReady = nodes.filter(nodeReady).length

  return (
    <div className="p-6">
      <ViewHeader title="Overview" />
      {errored && <p className="text-xs text-zinc-500">Stream interrupted — resyncing…</p>}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <StatTile title="Pods" testId="card-pods">
          <Count n={pods.length} />
          <Sub
            ok={podsRunning}
            bad={pods.length - podsRunning}
            okLabel="Running"
            badLabel="Not running"
          />
          <div className="mt-2">
            <MiniBar value={pods.length ? Math.round((podsRunning / pods.length) * 100) : 0} />
          </div>
        </StatTile>
        <StatTile title="Deployments" testId="card-deployments">
          <Count n={deployments.length} />
        </StatTile>
        <StatTile title="Nodes" testId="card-nodes">
          <Count n={nodes.length} />
          <Sub
            ok={nodesReady}
            bad={nodes.length - nodesReady}
            okLabel="Ready"
            badLabel="Not ready"
          />
        </StatTile>
        <StatTile title="Namespaces" testId="card-namespaces">
          <Count n={namespaces.length} />
        </StatTile>
        <StatTile title="Metrics" testId="card-metrics">
          <div
            title="Metrics pending — metrics-server wiring is not yet in place"
            className="mt-2 text-xs text-zinc-500"
          >
            Metrics pending
          </div>
        </StatTile>
      </div>
    </div>
  )
}
