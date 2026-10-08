import { AreaChart, Card, CardHeader, MiniBar, StatCard, ViewHeader } from '../ui'

// Placeholder series only — no metrics source is wired up.
const PLACEHOLDER = [30, 34, 31, 38, 36, 42, 40, 45, 43, 48]

const PANELS = [
  { label: 'Cluster CPU', icon: 'cpu', color: 'text-sky-400', stroke: '#38bdf8', bar: 40 },
  { label: 'Cluster Memory', icon: 'memory', color: 'text-violet-400', stroke: '#a78bfa', bar: 55 },
  { label: 'Network I/O', icon: 'network', color: 'text-cyan-400', stroke: '#22d3ee', bar: 25 },
  { label: 'Pod count', icon: 'pods', color: 'text-emerald-400', stroke: '#34d399', bar: 60 },
]

export function DashboardsView() {
  return (
    <div>
      <ViewHeader title="Dashboard" />
      <p className="text-xs text-zinc-500 mb-4" role="note">
        Metrics pending — not wired to a metrics source. Values below are placeholders.
      </p>
      <div
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5"
        data-testid="dashboard-stats"
      >
        {PANELS.map((p) => (
          <StatCard
            key={p.label}
            label={p.label}
            value="--"
            sub="Metrics pending"
            color={p.color}
            icon={p.icon}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {PANELS.map((p) => (
          <Card key={p.label}>
            <CardHeader title={`${p.label} (placeholder)`} />
            <div className="p-5 space-y-3">
              <AreaChart data={PLACEHOLDER} color={p.stroke} width={400} height={80} />
              <MiniBar value={p.bar} className="w-full" />
              <p className="text-[10px] text-zinc-600">Illustrative data, not live.</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
