import { Link } from 'react-router-dom'
import type { K8sObject } from '../../contract/types'
import { getPath } from '../../table/columns'
import { StatusBadge } from '../../ui'
import { durationStr, params, results, runStatus, type TknCondition } from './model'
import { SigningBadge } from './SigningBadge'
import { TaskRunSteps } from './TaskRunSteps'

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

export function TaskRunDetail({ object }: { object: K8sObject }) {
  const ns = object.metadata.namespace
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
  const podName = getPath(object, 'status.podName') as string | undefined
  const ps = params(object)
  const rs = results(object)

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

      <Section title="Steps">
        <TaskRunSteps taskRun={object} />
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
      {podName && (
        <Section title="Pod">
          <Link
            to={`/ns/${ns}/core/v1/pods/${podName}`}
            className="text-xs text-sky-400 hover:underline"
          >
            {podName}
          </Link>
        </Section>
      )}
    </div>
  )
}
