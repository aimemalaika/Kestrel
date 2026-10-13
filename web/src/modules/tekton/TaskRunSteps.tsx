import { useState } from 'react'
import type { K8sObject } from '../../contract/types'
import { getPath } from '../../table/columns'
import { LogViewer } from '../../streaming/LogViewer'
import { StatusBadge } from '../../ui'
import { steps as stepsOf } from './model'
import { ArchivedLog } from './ArchivedLog'

export function TaskRunSteps({ taskRun }: { taskRun: K8sObject }) {
  const list = stepsOf(taskRun)
  const defaultStep = (list.find((s) => s.phase === 'Failed') ?? list[list.length - 1])?.name
  const [picked, setPicked] = useState<string | undefined>()
  const selectedName = picked ?? defaultStep
  const selected = list.find((s) => s.name === selectedName)
  const podName = getPath(taskRun, 'status.podName') as string | undefined

  const record = taskRun.metadata.annotations?.['results.tekton.dev/record']

  if (list.length === 0) return <p className="text-xs text-zinc-500">No steps.</p>

  return (
    <div>
      <ul className="list-none p-0 m-0">
        {list.map((s) => (
          <li key={s.name} className="py-1">
            <button
              type="button"
              aria-pressed={s.name === selectedName}
              onClick={() => setPicked(s.name)}
              className={`flex items-center gap-2 text-xs w-full text-left px-2 py-1 rounded border cursor-pointer ${
                s.name === selectedName
                  ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                  : 'border-transparent text-zinc-300 hover:bg-zinc-800/60'
              }`}
            >
              <span>{s.name}</span>
              <StatusBadge status={s.phase} />
            </button>
          </li>
        ))}
      </ul>
      {selected &&
        (podName ? (
          <div className="mt-2 h-64">
            <LogViewer
              pod={{
                group: 'core',
                version: 'v1',
                resource: 'pods',
                namespace: taskRun.metadata.namespace,
                name: podName,
              }}
              container={selected.container}
            />
          </div>
        ) : record ? (
          <ArchivedLog record={record} />
        ) : (
          <p className="mt-2 text-xs text-zinc-500">logs unavailable (pod gone — see Results)</p>
        ))}
    </div>
  )
}
