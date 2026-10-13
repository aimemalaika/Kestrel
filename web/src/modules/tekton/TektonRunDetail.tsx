import { useState } from 'react'
import type { K8sObject } from '../../contract/types'
import { getPath } from '../../table/columns'
import { useResourceStream } from '../../table/useResourceStream'
import { Card, StageViz, StatusBadge } from '../../ui'
import {
  durationStr,
  params,
  results,
  runStatus,
  stagesFromRun,
  taskRunFor,
  workspaces,
  type TknCondition,
} from './model'
import { SigningBadge } from './SigningBadge'
import { TaskRunSteps } from './TaskRunSteps'

const TASKRUNS = { group: 'tekton.dev', version: 'v1', resource: 'taskruns' }
const PIPELINES = { group: 'tekton.dev', version: 'v1', resource: 'pipelines' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">
        {title}
      </h3>
      {children}
    </section>
  )
}

function NamedList({ items }: { items: { name: string; value?: string }[] }) {
  return (
    <dl className="m-0 text-xs grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
      {items.map((p) => (
        <div key={p.name} className="contents">
          <dt className="text-zinc-500">{p.name}</dt>
          <dd className="m-0 text-zinc-200 break-all">{p.value ?? ''}</dd>
        </div>
      ))}
    </dl>
  )
}

export function TektonRunDetail({ object }: { object: K8sObject }) {
  const ns = object.metadata.namespace
  const taskRunsStream = useResourceStream(TASKRUNS, ns)
  const pipelinesStream = useResourceStream(PIPELINES, ns)
  const [picked, setPicked] = useState<string | undefined>()

  const phase = runStatus(object)
  const startTime = getPath(object, 'status.startTime') as string | undefined
  const completionTime = getPath(object, 'status.completionTime') as string | undefined
  const duration = durationStr(startTime, completionTime)
  const cond = ((getPath(object, 'status.conditions') as TknCondition[] | undefined) ?? []).find(
    (c) => c.type === 'Succeeded',
  )
  const failure =
    phase === 'Failed' || phase === 'Cancelled'
      ? [cond?.reason, cond?.message].filter(Boolean).join(': ')
      : ''

  const stages = stagesFromRun(object, taskRunsStream.rows, pipelinesStream.rows)
  const selectedName = picked ?? stages[0]?.name
  const selectedTr = selectedName
    ? taskRunFor(object, selectedName, taskRunsStream.rows)
    : undefined

  const pipeline = pipelinesStream.rows.find(
    (p) => p.metadata.name === getPath(object, 'spec.pipelineRef.name'),
  )
  const pipelineTasks = (getPath(pipeline ?? ({} as K8sObject), 'spec.tasks') ?? []) as {
    name: string
  }[]

  const ps = params(object)
  const rs = results(object)
  const ws = workspaces(object)

  return (
    <div className="text-zinc-200">
      <Section title="Status">
        <div className="flex items-center gap-3">
          <StatusBadge status={phase} />
          {duration && <span className="text-xs text-zinc-400">{duration}</span>}
        </div>
        <dl className="my-3 text-xs text-zinc-500">
          <dt>Started</dt>
          <dd className="m-0 text-zinc-200">{startTime ?? '—'}</dd>
          <dt>Completed</dt>
          <dd className="m-0 text-zinc-200">{completionTime ?? '—'}</dd>
        </dl>
        {failure && <p className="text-xs text-red-400 m-0">{failure}</p>}
      </Section>

      <Section title="Chains signature">
        <SigningBadge object={object} />
      </Section>

      <Section title="Tasks">
        {stages.length === 0 && <p className="text-xs text-zinc-500">No tasks.</p>}
        {stages.length > 0 && (
          <Card className="p-4 mb-3 overflow-x-auto">
            <StageViz stages={stages} selected={selectedName} onSelect={setPicked} />
          </Card>
        )}
        {selectedName &&
          (selectedTr ? (
            <TaskRunSteps key={selectedTr.metadata.name} taskRun={selectedTr} />
          ) : (
            <p className="text-xs text-zinc-500">No TaskRun for {selectedName} yet.</p>
          ))}
      </Section>

      {ps.length > 0 && (
        <Section title="Params">
          <NamedList items={ps} />
        </Section>
      )}
      {rs.length > 0 && (
        <Section title="Results">
          <NamedList items={rs} />
        </Section>
      )}
      {ws.length > 0 && (
        <Section title="Workspaces">
          <ul className="list-none p-0 m-0 text-xs">
            {ws.map((w) => (
              <li key={w.name}>{w.name}</li>
            ))}
          </ul>
        </Section>
      )}
      {pipelineTasks.length > 0 && (
        <Section title="Pipeline spec">
          <ol className="m-0 pl-4 text-xs">
            {pipelineTasks.map((t) => (
              <li key={t.name}>{t.name}</li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  )
}
