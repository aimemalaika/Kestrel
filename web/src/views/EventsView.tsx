import { useResourceStream } from '../table/useResourceStream'
import { StatusPill } from '../table/StatusPill'
import { ageString, getPath } from '../table/columns'
import type { K8sObject } from '../contract/types'

const EVENTS = { group: 'core', version: 'v1', resource: 'events' }

function ts(e: K8sObject): number {
  const t = Date.parse(String(e.lastTimestamp ?? e.metadata.creationTimestamp ?? ''))
  return Number.isNaN(t) ? 0 : t
}

const th = {
  textAlign: 'left' as const,
  padding: 'var(--space-2) var(--space-3)',
  color: 'var(--text-muted)',
  fontWeight: 500,
  fontSize: 12,
}
const td = { padding: 'var(--space-2) var(--space-3)', borderTop: '1px solid var(--border)' }

export function EventsView() {
  const { rows, status } = useResourceStream(EVENTS, undefined)
  const events = [...rows].sort((a, b) => ts(b) - ts(a))
  return (
    <div style={{ padding: 'var(--space-6)' }}>
      <h2 style={{ marginTop: 0 }}>Events</h2>
      {status === 'error' && (
        <p style={{ color: 'var(--text-muted)' }}>Stream interrupted — resyncing…</p>
      )}
      {status === 'ready' && events.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No events.</p>
      )}
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--r-card)',
          boxShadow: 'var(--shadow-card)',
          overflowX: 'auto',
        }}
      >
        <table aria-label="Events" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Type', 'Reason', 'Object', 'Message', 'Age'].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const kind = String(getPath(e, 'involvedObject.kind') ?? '')
              const name = String(getPath(e, 'involvedObject.name') ?? '')
              const ns = getPath(e, 'involvedObject.namespace')
              const type = String(e.type ?? 'Normal')
              return (
                <tr key={e.metadata.uid ?? `${e.metadata.namespace}/${e.metadata.name}`}>
                  <td style={td}>
                    <StatusPill value={type} /> <span>{type}</span>
                  </td>
                  <td style={td}>{String(e.reason ?? '—')}</td>
                  <td style={td}>
                    {kind}/{name}
                    {ns ? (
                      <span style={{ color: 'var(--text-muted)' }}> ({String(ns)})</span>
                    ) : null}
                  </td>
                  <td style={td}>{String(e.message ?? '')}</td>
                  <td style={td}>{ageString(String(e.lastTimestamp ?? ''))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
