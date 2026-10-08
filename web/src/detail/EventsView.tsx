import { Card } from '../ui'
import type { K8sObject } from '../contract/types'
import { useResourceStream } from '../table/useResourceStream'

export function EventsView({ object }: { object: K8sObject }) {
  const ns = object.metadata.namespace
  const { rows } = useResourceStream({ group: 'core', version: 'v1', resource: 'events' }, ns)
  const events = rows
    .filter((e) => {
      const io = e.involvedObject as { name?: string } | undefined
      return io?.name === object.metadata.name
    })
    .sort((a, b) => String(b.lastTimestamp).localeCompare(String(a.lastTimestamp)))

  if (!events.length) return <p className="text-sm text-zinc-500">No events.</p>
  return (
    <Card>
      <ul className="list-none p-0 m-0 divide-y divide-zinc-800/80">
        {events.map((e) => (
          <li key={e.metadata.uid ?? e.metadata.name} className="px-4 py-3">
            <div className="flex gap-2 text-xs">
              <strong className="text-zinc-100">{String(e.reason ?? '')}</strong>
              <span className="text-zinc-500">{String(e.lastTimestamp ?? '')}</span>
            </div>
            <div className="mt-1 text-xs text-zinc-400">{String(e.message ?? '')}</div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
