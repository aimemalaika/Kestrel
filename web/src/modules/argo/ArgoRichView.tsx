import type { CSSProperties } from 'react'
import type { K8sObject } from '../../contract/types'
import { StatusPill } from '../../table/StatusPill'

interface ArgoResource {
  group?: string
  version?: string
  kind: string
  name: string
  namespace?: string
  status?: string
  health?: string
}
interface ArgoSpec {
  source?: { repoURL?: string; path?: string; targetRevision?: string }
  destination?: { server?: string; namespace?: string }
}
interface ArgoStatus {
  sync?: { status?: string }
  health?: { status?: string }
  resources?: ArgoResource[]
}

export function ArgoRichView({ object }: { object?: K8sObject }) {
  if (!object) return null
  const spec = (object.spec ?? {}) as ArgoSpec
  const status = (object.status ?? {}) as ArgoStatus
  const resources = status.resources ?? []
  const groups = new Map<string, ArgoResource[]>()
  for (const r of resources) groups.set(r.kind, [...(groups.get(r.kind) ?? []), r])
  const dd: CSSProperties = { color: 'var(--text)', margin: 0 }

  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
        <span style={{ color: 'var(--text-muted)' }}>Sync</span>
        <StatusPill value={status.sync?.status ?? 'Unknown'} />
        <span style={{ color: 'var(--text-muted)' }}>Health</span>
        <StatusPill value={status.health?.status ?? 'Unknown'} />
      </div>
      <dl style={{ color: 'var(--text-muted)', margin: 'var(--space-3) 0' }}>
        <dt>Repository</dt>
        <dd style={dd}>{spec.source?.repoURL ?? '—'}</dd>
        <dt>Path</dt>
        <dd style={dd}>{spec.source?.path ?? '—'}</dd>
        <dt>Revision</dt>
        <dd style={dd}>{spec.source?.targetRevision ?? '—'}</dd>
        <dt>Server</dt>
        <dd style={dd}>{spec.destination?.server ?? '—'}</dd>
        <dt>Namespace</dt>
        <dd style={dd}>{spec.destination?.namespace ?? '—'}</dd>
      </dl>
      {resources.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No resources.</p>}
      {[...groups.entries()].map(([kind, items]) => (
        <section key={kind} aria-label={kind} style={{ marginBottom: 'var(--space-3)' }}>
          <strong style={{ color: 'var(--text)' }}>{kind}</strong>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {items.map((r) => (
              <li
                key={`${r.kind}/${r.namespace ?? ''}/${r.name}`}
                style={{
                  display: 'flex',
                  gap: 'var(--space-2)',
                  alignItems: 'center',
                  padding: 'var(--space-2) 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span style={{ color: 'var(--text)' }}>{r.name}</span>
                {r.namespace && <span style={{ color: 'var(--text-muted)' }}>{r.namespace}</span>}
                {r.status && <StatusPill value={r.status} />}
                {r.health && <StatusPill value={r.health} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
