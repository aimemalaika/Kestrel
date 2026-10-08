import type { K8sObject } from '../../contract/types'
import { Card, StageViz, StatusBadge } from '../../ui'

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

export function TektonRunDetail({ object }: { object: K8sObject }) {
  const status = (object.status ?? {}) as {
    conditions?: Condition[]
    startTime?: string
    completionTime?: string
    taskRuns?: TaskRun[]
  }
  const cond = status.conditions?.find((c) => c.type === 'Succeeded')
  const taskRuns = status.taskRuns ?? []
  const stages = taskRuns.map((tr) => ({
    name: tr.name,
    status: tr.succeeded ? 'Succeeded' : 'Failed',
  }))

  return (
    <div className="text-zinc-200">
      <div className="flex items-center gap-3">
        <StatusBadge status={cond?.reason ?? 'Unknown'} />
      </div>
      <dl className="my-3 text-xs text-zinc-500">
        <dt>Started</dt>
        <dd className="m-0 text-zinc-200">{status.startTime ?? '—'}</dd>
        <dt>Completed</dt>
        <dd className="m-0 text-zinc-200">{status.completionTime ?? '—'}</dd>
      </dl>
      {taskRuns.length === 0 && <p className="text-xs text-zinc-500">No tasks.</p>}
      {stages.length > 0 && (
        <Card className="p-4 mb-3 overflow-x-auto">
          <StageViz stages={stages} />
        </Card>
      )}
      <ul className="list-none p-0 m-0">
        {taskRuns.map((tr) => (
          <li key={tr.name} className="py-3 border-b border-zinc-800/60">
            <div className="flex items-center gap-2">
              <strong className="text-xs font-semibold text-zinc-200">{tr.name}</strong>
              <StatusBadge status={tr.succeeded ? 'Succeeded' : 'Failed'} />
            </div>
            <ul className="list-none p-0 mt-2 mb-0">
              {(tr.steps ?? []).map((s) => (
                <li key={s.name} className="text-xs text-zinc-500">
                  {s.name}: {s.status}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
