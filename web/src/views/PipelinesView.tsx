import { useState } from 'react'
import { useResourceStream } from '../table/useResourceStream'
import { Age } from '../table/Age'
import { getPath } from '../table/columns'
import type { K8sObject } from '../contract/types'
import { Card, FilterBar, Icon, Mono, PrimaryBtn, StageViz, StatusBadge, ViewHeader } from '../ui'

const PIPELINES = { group: 'tekton.dev', version: 'v1', resource: 'pipelines' }
const PIPELINERUNS = { group: 'tekton.dev', version: 'v1', resource: 'pipelineruns' }

interface Step {
  name?: string
  status?: string
}
interface TaskRun {
  name?: string
  pipelineTaskName?: string
  succeeded?: boolean
  steps?: Step[]
}
interface Stage {
  name: string
  status: string
  duration?: string
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

export function runStatus(run: K8sObject): string {
  const cond = arr<{ type: string; status: string; reason?: string }>(
    getPath(run, 'status.conditions'),
  ).find((c) => c.type === 'Succeeded')
  if (!cond) return 'Pending'
  if (cond.status === 'True') return 'Succeeded'
  if (cond.status === 'False') return /cancel/i.test(cond.reason ?? '') ? 'Cancelled' : 'Failed'
  return 'Running'
}

function taskStatus(t: TaskRun, runState: string): string {
  if (t.succeeded === true) return 'Succeeded'
  if (t.succeeded === false) return 'Failed'
  const steps = arr<Step>(t.steps)
  if (steps.some((s) => s.status === 'Error')) return 'Failed'
  if (steps.length > 0 && steps.every((s) => s.status === 'Completed')) return 'Succeeded'
  return runState === 'Running' || steps.length > 0 ? 'Running' : 'Pending'
}

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

function duration(run: K8sObject): string {
  const start = getPath(run, 'status.startTime')
  if (typeof start !== 'string') return '—'
  const endRaw = getPath(run, 'status.completionTime')
  const end = typeof endRaw === 'string' ? Date.parse(endRaw) : Date.now()
  return fmtDuration(end - Date.parse(start))
}

export function stagesFor(run: K8sObject, pipelines: K8sObject[]): Stage[] {
  const state = runStatus(run)
  const stages: Stage[] = arr<TaskRun>(getPath(run, 'status.taskRuns')).map((t, i) => ({
    name: t.pipelineTaskName ?? t.name ?? `task-${i + 1}`,
    status: taskStatus(t, state),
  }))
  // Append not-yet-started tasks from the referenced Pipeline, if known.
  const ref = getPath(run, 'spec.pipelineRef.name')
  const pipeline = pipelines.find((p) => p.metadata.name === ref)
  const seen = new Set(stages.map((s) => s.name))
  for (const t of arr<{ name: string }>(getPath(pipeline ?? ({} as K8sObject), 'spec.tasks'))) {
    if (!seen.has(t.name)) {
      stages.push({
        name: t.name,
        status: state === 'Failed' || state === 'Cancelled' ? 'Skipped' : 'Pending',
      })
    }
  }
  return stages
}

const STATUSES = ['All', 'Succeeded', 'Running', 'Failed', 'Cancelled']

export function PipelinesView() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('All')
  const runsStream = useResourceStream(PIPELINERUNS, undefined)
  const pipesStream = useResourceStream(PIPELINES, undefined)

  const runs = [...runsStream.rows]
    .map((r) => ({ run: r, status: runStatus(r) }))
    .filter(
      (x) =>
        x.run.metadata.name.toLowerCase().includes(q.toLowerCase()) &&
        (status === 'All' || x.status === status),
    )
    .sort((a, b) =>
      (b.run.metadata.creationTimestamp ?? '').localeCompare(
        a.run.metadata.creationTimestamp ?? '',
      ),
    )

  return (
    <div>
      <ViewHeader
        title="Pipeline Runs"
        count={runs.length}
        action={
          <PrimaryBtn>
            <Icon name="run" className="w-3.5 h-3.5" />
            Start Pipeline
          </PrimaryBtn>
        }
      />
      <FilterBar
        query={q}
        onQuery={setQ}
        statusFilter={status}
        onStatus={setStatus}
        statuses={STATUSES}
      />
      {runsStream.status === 'error' && (
        <p role="alert" className="text-xs text-red-400 mb-3">
          Stream interrupted — resyncing…
        </p>
      )}
      <div className="space-y-3">
        {runs.map(({ run, status: st }) => {
          const trigger = run.metadata.annotations?.['tekton.dev/trigger']
          return (
            <div key={run.metadata.uid ?? run.metadata.name} data-testid="pipeline-run">
              <Card className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Mono>{run.metadata.name}</Mono>
                      <StatusBadge status={st} />
                      {run.metadata.namespace && (
                        <span className="text-[10px] text-zinc-500 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5">
                          {run.metadata.namespace}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                      {trigger && <span>Trigger: {trigger}</span>}
                      <span>Duration: {duration(run)}</span>
                      <span>
                        <Age creationTimestamp={run.metadata.creationTimestamp} /> ago
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 text-zinc-500">
                    <Icon name="logs" className="w-3.5 h-3.5" />
                    <Icon name="refresh" className="w-3.5 h-3.5" />
                  </div>
                </div>
                <StageViz stages={stagesFor(run, pipesStream.rows)} />
              </Card>
            </div>
          )
        })}
        {runsStream.status === 'ready' && runs.length === 0 && (
          <p className="text-sm text-zinc-500">No matching pipeline runs.</p>
        )}
      </div>
    </div>
  )
}
