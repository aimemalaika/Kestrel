import type { CSSProperties } from 'react'
import type { K8sObject } from '../../contract/types'

interface Step {
  name: string
  status: string
}
interface TaskRun {
  name: string
  succeeded: boolean
  steps?: Step[]
}
interface Condition {
  type?: string
  status?: string
  reason?: string
}

function tone(status: string | undefined): { bg: string; fg: string } {
  if (status === 'True') return { bg: 'var(--ok-bg)', fg: 'var(--ok-fg)' }
  if (status === 'False') return { bg: 'var(--risk-bg)', fg: 'var(--risk-fg)' }
  return { bg: 'var(--neutral-bg)', fg: 'var(--neutral-fg)' }
}

const pill = (bg: string, fg: string): CSSProperties => ({
  display: 'inline-block',
  padding: '2px var(--space-2)',
  borderRadius: 'var(--r-badge)',
  background: bg,
  color: fg,
})

export function TektonRunDetail({ object }: { object: K8sObject }) {
  const status = (object.status ?? {}) as {
    conditions?: Condition[]
    startTime?: string
    completionTime?: string
    taskRuns?: TaskRun[]
  }
  const cond = status.conditions?.find((c) => c.type === 'Succeeded')
  const t = tone(cond?.status)
  const taskRuns = status.taskRuns ?? []

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span style={pill(t.bg, t.fg)}>{cond?.reason ?? 'Unknown'}</span>
      </div>
      <dl style={{ color: 'var(--text-muted)', margin: 'var(--space-3) 0' }}>
        <dt>Started</dt>
        <dd style={{ color: 'var(--text)', margin: 0 }}>{status.startTime ?? '—'}</dd>
        <dt>Completed</dt>
        <dd style={{ color: 'var(--text)', margin: 0 }}>{status.completionTime ?? '—'}</dd>
      </dl>
      {taskRuns.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No tasks.</p>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {taskRuns.map((tr) => {
          const tt = tone(tr.succeeded ? 'True' : 'False')
          return (
            <li
              key={tr.name}
              style={{ padding: 'var(--space-3) 0', borderBottom: '1px solid var(--border)' }}
            >
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <strong style={{ color: 'var(--text)' }}>{tr.name}</strong>
                <span style={pill(tt.bg, tt.fg)}>{tr.succeeded ? 'Succeeded' : 'Failed'}</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--space-2) 0 0' }}>
                {(tr.steps ?? []).map((s) => (
                  <li key={s.name} style={{ color: 'var(--text-muted)' }}>
                    {s.name}: {s.status}
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
