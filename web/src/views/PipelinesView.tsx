import { useState } from 'react'
import { useResourceStream } from '../table/useResourceStream'
import { Age } from '../table/Age'
import { getPath } from '../table/columns'
import { durationStr, runStatus, stagesFromRun } from '../modules/tekton/model'
import type { K8sObject } from '../contract/types'
import { Card, FilterBar, Icon, Mono, PrimaryBtn, StageViz, StatusBadge, ViewHeader } from '../ui'

const PIPELINES = { group: 'tekton.dev', version: 'v1', resource: 'pipelines' }
const TASKRUNS = { group: 'tekton.dev', version: 'v1', resource: 'taskruns' }
const PIPELINERUNS = { group: 'tekton.dev', version: 'v1', resource: 'pipelineruns' }

function duration(run: K8sObject): string {
  return (
    durationStr(
      getPath(run, 'status.startTime') as string | undefined,
      getPath(run, 'status.completionTime') as string | undefined,
    ) ?? '—'
  )
}

const STATUSES = ['All', 'Succeeded', 'Running', 'Failed', 'Cancelled']

export function PipelinesView() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('All')
  const runsStream = useResourceStream(PIPELINERUNS, undefined)
  const pipesStream = useResourceStream(PIPELINES, undefined)
  const taskRunsStream = useResourceStream(TASKRUNS, undefined)

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
                <StageViz stages={stagesFromRun(run, taskRunsStream.rows, pipesStream.rows)} />
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
