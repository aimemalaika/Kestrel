import { useState } from 'react'
import { useResourceStream } from '../table/useResourceStream'
import { Age } from '../table/Age'
import { getPath } from '../table/columns'
import type { K8sObject } from '../contract/types'
import { Card, CardHeader, Icon, Table, TR, TD, Mono, ViewHeader } from '../ui'

const OPERATORS = { group: 'config.openshift.io', version: 'v1', resource: 'clusteroperators' }
const VERSIONS = { group: 'config.openshift.io', version: 'v1', resource: 'clusterversions' }
const MACHINESETS = { group: 'machine.openshift.io', version: 'v1beta1', resource: 'machinesets' }

const TABS = ['Cluster Operators', 'Cluster Version', 'Machine Sets', 'Cluster Settings']

interface Condition {
  type: string
  status: string
  message?: string
  lastTransitionTime?: string
}

function conds(o: K8sObject): Condition[] {
  const c = getPath(o, 'status.conditions')
  return Array.isArray(c) ? (c as Condition[]) : []
}

function condOf(o: K8sObject, type: string): Condition | undefined {
  return conds(o).find((c) => c.type === type)
}

const isTrue = (c?: Condition) => c?.status === 'True'

function num(o: K8sObject, path: string): number {
  const v = getPath(o, path)
  return typeof v === 'number' ? v : 0
}

function TF({ on, onClass }: { on: boolean; onClass: string }) {
  return (
    <span className={`text-xs font-semibold ${on ? onClass : 'text-zinc-500'}`}>
      {on ? 'True' : 'False'}
    </span>
  )
}

function KV({ rows, mono = true }: { rows: { label: string; value: string }[]; mono?: boolean }) {
  return (
    <>
      {rows.map(({ label, value }) => (
        <div
          key={label}
          className="flex justify-between items-center gap-4 border-b border-zinc-800/50 pb-3 last:border-0 last:pb-0"
        >
          <span className="text-sm text-zinc-500 shrink-0">{label}</span>
          <span className={`text-sm text-zinc-200 text-right break-all ${mono ? 'font-mono' : ''}`}>
            {value}
          </span>
        </div>
      ))}
    </>
  )
}

function OperatorsTab({ rows }: { rows: K8sObject[] }) {
  const ops = [...rows].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name))
  const degraded = ops.filter((o) => isTrue(condOf(o, 'Degraded'))).length
  const progressing = ops.filter(
    (o) => !isTrue(condOf(o, 'Degraded')) && isTrue(condOf(o, 'Progressing')),
  ).length
  const healthy = ops.length - degraded - progressing
  const tiles = [
    {
      label: 'Healthy',
      count: healthy,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
    },
    {
      label: 'Progressing',
      count: progressing,
      color: 'text-sky-400',
      bg: 'bg-sky-500/10 border-sky-500/20',
    },
    {
      label: 'Degraded',
      count: degraded,
      color: 'text-red-400',
      bg: 'bg-red-500/10 border-red-500/20',
    },
  ]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((s) => (
          <div key={s.label} className={`border rounded-xl p-4 flex items-center gap-3 ${s.bg}`}>
            <p className={`text-2xl font-bold ${s.color}`} data-testid={`tile-${s.label}`}>
              {s.count}
            </p>
            <p className="text-xs text-zinc-400">{s.label} operators</p>
          </div>
        ))}
      </div>
      <Table
        aria-label="Cluster operators"
        headers={['Operator', 'Available', 'Progressing', 'Degraded', 'Since', 'Message']}
      >
        {ops.map((op) => {
          const a = condOf(op, 'Available')
          const p = condOf(op, 'Progressing')
          const d = condOf(op, 'Degraded')
          const msg = [d, p, a].find(
            (c) => c && c.message && (c === a ? !isTrue(a) : isTrue(c)),
          )?.message
          return (
            <TR key={op.metadata.name}>
              <TD>
                <Mono>{op.metadata.name}</Mono>
              </TD>
              <TD>
                <TF on={isTrue(a)} onClass="text-emerald-400" />
              </TD>
              <TD>
                <TF on={isTrue(p)} onClass="text-sky-400" />
              </TD>
              <TD>
                <TF on={isTrue(d)} onClass="text-red-400" />
              </TD>
              <TD>
                <span className="text-xs text-zinc-500">
                  <Age creationTimestamp={op.metadata.creationTimestamp} />
                </span>
              </TD>
              <TD>
                {msg ? (
                  <span className="text-xs text-amber-400">{msg}</span>
                ) : (
                  <span className="text-xs text-zinc-700">-</span>
                )}
              </TD>
            </TR>
          )
        })}
      </Table>
    </div>
  )
}

function VersionTab({ rows }: { rows: K8sObject[] }) {
  const cv = rows.find((r) => r.metadata.name === 'version') ?? rows[0]
  if (!cv) {
    return (
      <Card>
        <CardHeader title="Cluster Version" />
        <p className="p-5 text-sm text-zinc-500">No ClusterVersion found.</p>
      </Card>
    )
  }
  const str = (p: string, d = '-') => {
    const v = getPath(cv, p)
    return typeof v === 'string' && v ? v : d
  }
  const history = getPath(cv, 'status.history')
  const current =
    (Array.isArray(history) &&
      (history as { state?: string; version?: string }[]).find((h) => h.state === 'Completed')
        ?.version) ||
    str('status.desired.version')
  const updates = getPath(cv, 'status.availableUpdates')
  const next =
    Array.isArray(updates) && updates.length > 0
      ? (updates[0] as { version?: string }).version
      : undefined
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Cluster Version" />
        <div className="p-5 space-y-4">
          <KV
            rows={[
              { label: 'Current Version', value: current },
              { label: 'Desired Version', value: str('status.desired.version') },
              { label: 'Channel', value: str('spec.channel') },
              { label: 'Cluster ID', value: str('spec.clusterID') },
              { label: 'Available', value: isTrue(condOf(cv, 'Available')) ? 'True' : 'False' },
              { label: 'Progressing', value: isTrue(condOf(cv, 'Progressing')) ? 'True' : 'False' },
            ]}
          />
          {next && (
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-3 flex items-start gap-3">
              <Icon name="alert" className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-300">Update Available: {next}</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Includes security patches and new features.
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 px-3 py-1 rounded-md transition-colors"
                >
                  Update Cluster
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

function MachineSetsTab({ rows }: { rows: K8sObject[] }) {
  const sets = [...rows].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name))
  return (
    <Table aria-label="Machine sets" headers={['Name', 'Desired', 'Ready', 'Available', 'Age']}>
      {sets.map((ms) => {
        const desired = num(ms, 'spec.replicas')
        const ready = num(ms, 'status.readyReplicas')
        return (
          <TR key={ms.metadata.uid ?? ms.metadata.name}>
            <TD>
              <Mono>{ms.metadata.name}</Mono>
            </TD>
            <TD>
              <span className="text-xs text-zinc-300">{desired}</span>
            </TD>
            <TD>
              <span
                className={`text-xs font-semibold ${ready === desired ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {ready}
              </span>
            </TD>
            <TD>
              <span className="text-xs text-zinc-300">{num(ms, 'status.availableReplicas')}</span>
            </TD>
            <TD>
              <span className="text-xs text-zinc-500">
                <Age creationTimestamp={ms.metadata.creationTimestamp} />
              </span>
            </TD>
          </TR>
        )
      })}
    </Table>
  )
}

const SETTINGS = [
  { label: 'Cluster Name', value: 'kestrel-cluster' },
  { label: 'Console URL', value: 'https://console.kestrel-cluster.example.com' },
  { label: 'API URL', value: 'https://api.kestrel-cluster.example.com:6443' },
  { label: 'Authentication', value: 'OIDC, htpasswd' },
  { label: 'Registry', value: 'image-registry.kestrel.svc:5000' },
  { label: 'Monitoring', value: 'Kestrel Metrics (Prometheus-compatible)' },
]

export function ClusterView() {
  const [tab, setTab] = useState(TABS[0])
  const ops = useResourceStream(OPERATORS, undefined)
  const versions = useResourceStream(VERSIONS, undefined)
  const sets = useResourceStream(MACHINESETS, undefined)
  return (
    <div>
      <ViewHeader title="Cluster" tabs={TABS} activeTab={tab} onTab={setTab} />
      {tab === 'Cluster Operators' && <OperatorsTab rows={ops.rows} />}
      {tab === 'Cluster Version' && <VersionTab rows={versions.rows} />}
      {tab === 'Machine Sets' && <MachineSetsTab rows={sets.rows} />}
      {tab === 'Cluster Settings' && (
        <Card>
          <CardHeader title="Global Configuration" />
          <div className="p-5 space-y-3 text-xs">
            <KV rows={SETTINGS} />
          </div>
        </Card>
      )}
    </div>
  )
}
