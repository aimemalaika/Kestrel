import { Card, CardHeader, ViewHeader } from '../ui'
import { useResourceStream } from '../table/useResourceStream'
import { getPath } from '../table/columns'

const QUOTAS = { group: 'core', version: 'v1', resource: 'resourcequotas' }

/** Parse a k8s quantity to a plain number (cores / bytes / count). */
export function parseQuantity(q: string): number {
  const m = /^([0-9.]+)([a-zA-Z]*)$/.exec(q.trim())
  if (!m) return NaN
  const n = parseFloat(m[1])
  const mult: Record<string, number> = {
    '': 1,
    m: 1e-3,
    k: 1e3,
    K: 1e3,
    M: 1e6,
    G: 1e9,
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
  }
  return n * (mult[m[2]] ?? NaN)
}

export function QuotasView() {
  const { rows } = useResourceStream(QUOTAS, undefined)
  const quotas = [...rows].sort((a, b) =>
    (a.metadata.namespace ?? '').localeCompare(b.metadata.namespace ?? ''),
  )

  return (
    <div>
      <ViewHeader title="Resource Quotas" />
      <div className="space-y-4">
        {quotas.map((q) => {
          const hard = (getPath(q, 'status.hard') ?? getPath(q, 'spec.hard') ?? {}) as Record<
            string,
            string
          >
          const used = (getPath(q, 'status.used') ?? {}) as Record<string, string>
          const ns = q.metadata.namespace ?? ''
          return (
            <Card key={q.metadata.uid ?? `${ns}/${q.metadata.name}`}>
              <CardHeader title={`${ns} – ResourceQuota`} />
              <div className="p-5 space-y-3">
                {Object.entries(hard).map(([resource, limit]) => {
                  const u = used[resource] ?? '0'
                  const ratio = parseQuantity(u) / parseQuantity(limit)
                  const pct = Number.isFinite(ratio) ? Math.round(ratio * 100) : 0
                  return (
                    <div key={resource} className="flex items-center gap-4">
                      <span className="text-xs text-zinc-400 w-28 shrink-0">{resource}</span>
                      <div className="flex-1">
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            role="progressbar"
                            aria-valuenow={pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            className={`h-full rounded-full ${pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs tabular-nums text-zinc-400 w-36 text-right shrink-0">
                        {u} / {limit} ({pct}%)
                      </span>
                    </div>
                  )
                })}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
