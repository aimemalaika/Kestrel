import { useState } from 'react'
import { useResourceStream } from '../table/useResourceStream'
import { ageString, getPath } from '../table/columns'
import type { K8sObject } from '../contract/types'
import { Card, ViewHeader, FilterBar } from '../ui'

const EVENTS = { group: 'core', version: 'v1', resource: 'events' }

function ts(e: K8sObject): number {
  const t = Date.parse(String(e.lastTimestamp ?? e.metadata.creationTimestamp ?? ''))
  return Number.isNaN(t) ? 0 : t
}

export function EventsView() {
  const [typeFilter, setTypeFilter] = useState('All')
  const [q, setQ] = useState('')
  const { rows, status } = useResourceStream(EVENTS, undefined)
  const events = [...rows]
    .sort((a, b) => ts(b) - ts(a))
    .map((e) => {
      const kind = String(getPath(e, 'involvedObject.kind') ?? '')
      const name = String(getPath(e, 'involvedObject.name') ?? '')
      return {
        e,
        type: String(e.type ?? 'Normal'),
        msg: String(e.message ?? ''),
        reason: String(e.reason ?? '—'),
        obj: kind ? `${kind}/${name}` : name,
        ns: getPath(e, 'involvedObject.namespace'),
      }
    })
  const needle = q.toLowerCase()
  const filtered = events.filter(
    (ev) =>
      (typeFilter === 'All' || ev.type === typeFilter) &&
      (ev.msg.toLowerCase().includes(needle) || ev.obj.toLowerCase().includes(needle)),
  )
  return (
    <div>
      <ViewHeader title="Events" count={filtered.length} />
      <FilterBar
        query={q}
        onQuery={setQ}
        statusFilter={typeFilter}
        onStatus={setTypeFilter}
        statuses={['All', 'Warning', 'Normal']}
      />
      {status === 'error' && (
        <p className="text-xs text-zinc-500 mb-3">Stream interrupted — resyncing…</p>
      )}
      {status === 'ready' && events.length === 0 && (
        <p className="text-xs text-zinc-500 mb-3">No events.</p>
      )}
      {status === 'ready' && events.length > 0 && filtered.length === 0 && (
        <p className="text-xs text-zinc-500 mb-3">No matching events.</p>
      )}
      <div className="space-y-2" role="list" aria-label="Events">
        {filtered.map((ev) => (
          <div
            role="listitem"
            key={ev.e.metadata.uid ?? `${ev.e.metadata.namespace}/${ev.e.metadata.name}`}
          >
            <Card className={`px-4 py-3 ${ev.type === 'Warning' ? 'border-amber-500/15' : ''}`}>
              <div className="flex items-start gap-3">
                <span
                  data-testid="event-type"
                  className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 ${ev.type === 'Warning' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}
                >
                  {ev.type}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-300 mb-0.5">{ev.msg}</p>
                  <div className="flex gap-3 text-[10px] text-zinc-500 flex-wrap">
                    <span>
                      Reason: <span className="text-zinc-400">{ev.reason}</span>
                    </span>
                    <span>
                      Object: <span className="text-zinc-400 font-mono">{ev.obj}</span>
                    </span>
                    {ev.ns ? (
                      <span>
                        NS: <span className="text-zinc-400">{String(ev.ns)}</span>
                      </span>
                    ) : null}
                  </div>
                </div>
                {ev.e.lastTimestamp ? (
                  <span data-testid="event-age" className="text-[10px] text-zinc-600 shrink-0">
                    {ageString(String(ev.e.lastTimestamp))} ago
                  </span>
                ) : null}
              </div>
            </Card>
          </div>
        ))}
      </div>
    </div>
  )
}
