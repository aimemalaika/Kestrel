import { useState } from 'react'
import { AreaChart, Card, CardHeader, PrimaryBtn, ViewHeader } from '../ui'

// Deterministic sample results (module-level constants; no randomness at render time).
const RESULT = [18, 24, 22, 31, 29, 40, 37, 46, 43, 52, 49, 57]
const QUERY_RATE = [20, 26, 24, 32, 30, 38, 35, 41]
const LATENCY = [48, 52, 45, 60, 55, 72, 64, 58]
const SERIES = [
  { name: 'api-gateway', labels: 'namespace="production"', last: '57.2', avg: '36.4', max: '61.8' },
  {
    name: 'auth-service',
    labels: 'namespace="production"',
    last: '31.5',
    avg: '28.9',
    max: '40.2',
  },
  { name: 'frontend', labels: 'namespace="production"', last: '44.0', avg: '39.1', max: '52.7' },
  { name: 'payments-api', labels: 'namespace="shop"', last: '12.8', avg: '11.4', max: '19.6' },
]

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
        <div className="p-5 space-y-4">
          <p className="text-[10px] text-zinc-500">
            Sample result — no metrics source connected. Showing rate(requests_total[5m]).
          </p>
          <AreaChart data={RESULT} color="#a78bfa" width={800} height={120} />
          <table className="w-full text-xs" data-testid="sample-series">
            <thead>
              <tr className="text-left text-[10px] text-zinc-500 uppercase tracking-widest">
                <th className="py-1 font-medium">Series</th>
                <th className="py-1 font-medium">Labels</th>
                <th className="py-1 font-medium text-right">Last</th>
                <th className="py-1 font-medium text-right">Avg</th>
                <th className="py-1 font-medium text-right">Max</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {SERIES.map((r) => (
                <tr key={r.name} className="text-zinc-300">
                  <td className="py-1.5 font-mono">{r.name}</td>
                  <td className="py-1.5 font-mono text-zinc-500">{r.labels}</td>
                  <td className="py-1.5 text-right">{r.last}</td>
                  <td className="py-1.5 text-right">{r.avg}</td>
                  <td className="py-1.5 text-right">{r.max}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {[
          ['Query rate', QUERY_RATE],
          ['Latency (ms)', LATENCY],
        ].map(([t, data]) => (
          <Card key={t as string}>
            <CardHeader title={t as string} />
            <div className="p-5">
              <AreaChart data={data as number[]} color="#38bdf8" width={400} height={80} />
              <p className="text-[10px] text-zinc-600 mt-2">Sample data.</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
