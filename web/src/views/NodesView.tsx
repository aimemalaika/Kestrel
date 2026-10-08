import { useResourceStream } from '../table/useResourceStream'
import { StatusPill } from '../table/StatusPill'
import { Age } from '../table/Age'
import { getPath } from '../table/columns'
import type { K8sObject } from '../contract/types'

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

export function formatTaint(t: Taint): string {
  return `${t.key}=${t.value ?? ''}:${t.effect}`
}

function res(n: K8sObject, group: 'capacity' | 'allocatable'): string {
  const get = (k: string) => String(getPath(n, `status.${group}.${k}`) ?? '—')
  return `cpu ${get('cpu')} · mem ${get('memory')} · pods ${get('pods')}`
}

const th = {
  textAlign: 'left' as const,
  padding: 'var(--space-2) var(--space-3)',
  color: 'var(--text-muted)',
  fontWeight: 500,
  fontSize: 12,
}
const td = { padding: 'var(--space-2) var(--space-3)', borderTop: '1px solid var(--border)' }

export function NodesView() {
  const { rows, status } = useResourceStream(NODES, undefined)
  const nodes = [...rows].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name))
  return (
    <div style={{ padding: 'var(--space-6)' }}>
      <h2 style={{ marginTop: 0 }}>Nodes</h2>
      {status === 'ready' && nodes.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No nodes.</p>
      )}
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--r-card)',
          boxShadow: 'var(--shadow-card)',
          overflowX: 'auto',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {[
                'Name',
                'Ready',
                'Conditions',
                'Taints',
                'Capacity',
                'Allocatable',
                'CPU usage',
                'Mem usage',
                'Age',
              ].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {nodes.map((n) => {
              const conds = conditions(n)
              const ready = conds.find((c) => c.type === 'Ready')
              const isReady = ready?.status === 'True'
              const problems = conds.filter((c) => c.type !== 'Ready' && c.status === 'True')
              const ts = taints(n)
              return (
                <tr key={n.metadata.uid ?? n.metadata.name}>
                  <td style={td}>{n.metadata.name}</td>
                  <td style={td}>
                    <StatusPill value={isReady ? 'Running' : 'Failed'} />{' '}
                    <span>{isReady ? 'Ready' : 'NotReady'}</span>
                    {!isReady && ready?.reason && (
                      <span style={{ color: 'var(--text-muted)' }}> ({ready.reason})</span>
                    )}
                  </td>
                  <td style={td}>
                    {problems.length === 0
                      ? '—'
                      : problems.map((c) => (
                          <span key={c.type} style={{ color: 'var(--risk-fg)', marginRight: 8 }}>
                            {c.type}
                          </span>
                        ))}
                  </td>
                  <td style={td}>
                    {ts.length === 0
                      ? '—'
                      : ts.map((t) => <div key={formatTaint(t)}>{formatTaint(t)}</div>)}
                  </td>
                  <td style={td}>{res(n, 'capacity')}</td>
                  <td style={td}>{res(n, 'allocatable')}</td>
                  <td style={{ ...td, color: 'var(--text-muted)' }}>n/a</td>
                  <td style={{ ...td, color: 'var(--text-muted)' }}>n/a</td>
                  <td style={td}>
                    <Age creationTimestamp={n.metadata.creationTimestamp} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
