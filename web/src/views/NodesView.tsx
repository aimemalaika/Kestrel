import { useState } from 'react'
import { useResourceStream } from '../table/useResourceStream'
import { Age } from '../table/Age'
import { getPath } from '../table/columns'
import type { K8sObject } from '../contract/types'
import { Card, MiniBar, RoleBadge, StatusBadge, ViewHeader, Table, TR, TD, Mono } from '../ui'

const NODES = { group: 'core', version: 'v1', resource: 'nodes' }

interface Condition {
  type: string
  status: string
  reason?: string
}
interface Taint {
  key: string
  value?: string
  effect: string
}

function conditions(n: K8sObject): Condition[] {
  const c = getPath(n, 'status.conditions')
  return Array.isArray(c) ? (c as Condition[]) : []
}

function taints(n: K8sObject): Taint[] {
  const t = getPath(n, 'spec.taints')
  return Array.isArray(t) ? (t as Taint[]) : []
}

function formatTaint(t: Taint): string {
  // kubectl shows key:effect when a taint has no value (no dangling '=').
  return t.value ? `${t.key}=${t.value}:${t.effect}` : `${t.key}:${t.effect}`
}

function res(n: K8sObject, group: 'capacity' | 'allocatable'): string {
  const get = (k: string) => String(getPath(n, `status.${group}.${k}`) ?? '—')
  return `cpu ${get('cpu')} · mem ${get('memory')} · pods ${get('pods')}`
}

function label(n: K8sObject, key: string): string | undefined {
  const l = (n.metadata as { labels?: Record<string, string> }).labels
  return l?.[key]
}

function role(n: K8sObject): string {
  const l = (n.metadata as { labels?: Record<string, string> }).labels ?? {}
  if ('node-role.kubernetes.io/control-plane' in l) return 'control-plane'
  if ('node-role.kubernetes.io/master' in l) return 'master'
  return 'worker'
}

function str(n: K8sObject, path: string): string {
  const v = getPath(n, path)
  return v == null || v === '' ? '—' : String(v)
}

// Metrics: status.usage.{cpu,memory} as integer-percent strings. Absent => undefined.
function pct(n: K8sObject, k: 'cpu' | 'memory'): number | undefined {
  const raw = getPath(n, `status.usage.${k}`)
  const v = Number(raw)
  return raw == null || raw === '' || Number.isNaN(v) ? undefined : v
}

function podCount(n: K8sObject): string {
  const u = getPath(n, 'status.usage.pods')
  return u != null ? String(u) : str(n, 'status.allocatable.pods')
}

interface NodeInfo {
  node: K8sObject
  name: string
  role: string
  isReady: boolean
  reason?: string
  problems: Condition[]
  taints: Taint[]
  instanceType: string
  zone: string
  cpu?: number
  memory?: number
}

function info(n: K8sObject): NodeInfo {
  const conds = conditions(n)
  const ready = conds.find((c) => c.type === 'Ready')
  return {
    node: n,
    name: n.metadata.name,
    role: role(n),
    isReady: ready?.status === 'True',
    reason: ready?.reason,
    problems: conds.filter((c) => c.type !== 'Ready' && c.status === 'True'),
    taints: taints(n),
    instanceType: label(n, 'node.kubernetes.io/instance-type') ?? '—',
    zone: label(n, 'topology.kubernetes.io/zone') ?? '—',
    cpu: pct(n, 'cpu'),
    memory: pct(n, 'memory'),
  }
}

// Without a metrics source render an explicit n/a (no 0% bar that reads as real data).
function Usage({ name, value }: { name: string; value?: number }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
        <span>{name}</span>
        {value === undefined && <span>n/a</span>}
      </div>
      {value !== undefined && <MiniBar value={value} className="w-full" />}
    </div>
  )
}

function Cell({ value }: { value?: number }) {
  return value === undefined ? (
    <span className="text-xs text-zinc-500">n/a</span>
  ) : (
    <MiniBar value={value} className="w-20" />
  )
}

function ReadyStatus({ i }: { i: NodeInfo }) {
  return (
    <>
      <StatusBadge status={i.isReady ? 'Ready' : 'NotReady'} />
      {!i.isReady && i.reason && <span className="text-[10px] text-zinc-500">({i.reason})</span>}
    </>
  )
}

export function NodesView() {
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const { rows, status } = useResourceStream(NODES, undefined)
  const nodes = [...rows].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)).map(info)
  return (
    <div>
      <ViewHeader
        title="Nodes"
        count={nodes.length}
        action={
          <div className="flex gap-2 items-center">
            <div
              className="flex bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden"
              role="group"
              aria-label="Nodes view"
            >
              {(['cards', 'table'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-inset ${view === v ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  {v === 'cards' ? 'Cards' : 'Table'}
                </button>
              ))}
            </div>
          </div>
        }
      />
      {status === 'error' && (
        <p className="text-xs text-zinc-500 mb-3">Stream interrupted — resyncing…</p>
      )}
      {status === 'ready' && nodes.length === 0 && (
        <p className="text-xs text-zinc-500 mb-3">No nodes.</p>
      )}
      {view === 'cards' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {nodes.map((i) => (
            <Card
              key={i.node.metadata.uid ?? i.name}
              className={i.isReady ? '' : 'border-red-500/30'}
            >
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold font-mono text-zinc-200">{i.name}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <RoleBadge role={i.role} />
                      <ReadyStatus i={i} />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-zinc-500">{i.instanceType}</p>
                    <p className="text-[10px] text-zinc-600">{i.zone}</p>
                  </div>
                </div>
                <div className="space-y-2 mt-3">
                  <Usage name="CPU" value={i.cpu} />
                  <Usage name="Memory" value={i.memory} />
                </div>
                <div className="mt-3 space-y-1 text-[10px] text-zinc-500">
                  <p>
                    Conditions:{' '}
                    {i.problems.length === 0 ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                      i.problems.map((c) => (
                        <span key={c.type} className="text-red-400 mr-2">
                          {c.type}
                        </span>
                      ))
                    )}
                  </p>
                  <div>
                    Taints:{' '}
                    {i.taints.length === 0 ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                      i.taints.map((t, k) => (
                        <div key={k} className="font-mono text-amber-400">
                          {formatTaint(t)}
                        </div>
                      ))
                    )}
                  </div>
                  <p>
                    Capacity: <span className="text-zinc-400">{res(i.node, 'capacity')}</span>
                  </p>
                  <p>
                    Allocatable: <span className="text-zinc-400">{res(i.node, 'allocatable')}</span>
                  </p>
                </div>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-800">
                  <span className="text-[10px] text-zinc-500">{podCount(i.node)} pods</span>
                  <span className="text-[10px] text-zinc-600">
                    {str(i.node, 'status.nodeInfo.osImage')}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-600">
                    {str(i.node, 'status.nodeInfo.kubeletVersion')}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Table
          aria-label="Nodes"
          headers={[
            'Name',
            'Role',
            'Status',
            'Conditions',
            'Taints',
            'Capacity',
            'Allocatable',
            'CPU',
            'Memory',
            'Pods',
            'Zone',
            'Version',
            'OS',
            'Age',
          ]}
        >
          {nodes.map((i) => (
            <TR key={i.node.metadata.uid ?? i.name}>
              <TD>
                <Mono>{i.name}</Mono>
              </TD>
              <TD>
                <RoleBadge role={i.role} />
              </TD>
              <TD>
                <ReadyStatus i={i} />
              </TD>
              <TD>
                {i.problems.length === 0 ? (
                  <span className="text-xs text-zinc-500">—</span>
                ) : (
                  i.problems.map((c) => (
                    <span key={c.type} className="text-xs text-red-400 mr-2">
                      {c.type}
                    </span>
                  ))
                )}
              </TD>
              <TD>
                {i.taints.length === 0 ? (
                  <span className="text-xs text-zinc-500">—</span>
                ) : (
                  i.taints.map((t, k) => (
                    <div key={k} className="text-xs font-mono text-amber-400">
                      {formatTaint(t)}
                    </div>
                  ))
                )}
              </TD>
              <TD>
                <span className="text-xs text-zinc-400">{res(i.node, 'capacity')}</span>
              </TD>
              <TD>
                <span className="text-xs text-zinc-400">{res(i.node, 'allocatable')}</span>
              </TD>
              <TD>
                <Cell value={i.cpu} />
              </TD>
              <TD>
                <Cell value={i.memory} />
              </TD>
              <TD>
                <span className="text-xs tabular-nums text-zinc-300">{podCount(i.node)}</span>
              </TD>
              <TD>
                <span className="text-xs text-zinc-400">{i.zone}</span>
              </TD>
              <TD>
                <span className="text-xs font-mono text-zinc-400">
                  {str(i.node, 'status.nodeInfo.kubeletVersion')}
                </span>
              </TD>
              <TD>
                <span className="text-xs text-zinc-500">
                  {str(i.node, 'status.nodeInfo.osImage')}
                </span>
              </TD>
              <TD>
                <span className="text-xs text-zinc-500">
                  <Age creationTimestamp={i.node.metadata.creationTimestamp} />
                </span>
              </TD>
            </TR>
          ))}
        </Table>
      )}
    </div>
  )
}
