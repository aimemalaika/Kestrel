import { useState } from 'react'
import { AreaChart, Card, CardHeader, EmptyState, PrimaryBtn, ViewHeader } from '../ui'

const PLACEHOLDER = [20, 26, 24, 32, 30, 38, 35, 41]

export function MetricsView() {
  const [query, setQuery] = useState('')
  return (
    <div>
      <ViewHeader title="Metrics" />
      <form className="flex items-center gap-2 mb-4 flex-wrap" onSubmit={(e) => e.preventDefault()}>
        <input
          type="text"
          aria-label="Metrics query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Expression, e.g. rate(requests_total[5m])"
          className="flex-1 min-w-[220px] font-mono text-xs bg-zinc-800/80 border border-zinc-700/80 rounded-lg px-3 py-2 text-zinc-300 placeholder-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        />
        <PrimaryBtn>Run</PrimaryBtn>
      </form>
      <Card>
        <CardHeader title="Results" />
        <EmptyState
          title="Metrics source not connected"
          hint="Queries cannot run until a metrics source is configured."
          icon="metrics"
        />
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {['Query rate (placeholder)', 'Latency (placeholder)'].map((t) => (
          <Card key={t}>
            <CardHeader title={t} />
            <div className="p-5">
              <AreaChart data={PLACEHOLDER} color="#38bdf8" width={400} height={80} />
              <p className="text-[10px] text-zinc-600 mt-2">Illustrative data, not live.</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
