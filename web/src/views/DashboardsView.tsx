import { AreaChart, Card, CardHeader, MiniBar, StatCard, ViewHeader } from '../ui'

// Deterministic sample series (module-level constants; no randomness at render time).
const PANELS = [
  {
    label: 'Cluster CPU',
    icon: 'cpu',
    color: 'text-sky-400',
    stroke: '#38bdf8',
    bar: 63,
    value: '63%',
    sub: '10.1 / 16 cores',
    series: [34, 38, 36, 45, 52, 49, 61, 57, 66, 59, 62, 63],
  },
  {
    label: 'Cluster Memory',
    icon: 'memory',
    color: 'text-violet-400',
    stroke: '#a78bfa',
    bar: 72,
    value: '72%',
    sub: '46 / 64 GiB',
    series: [58, 59, 61, 60, 63, 65, 64, 67, 69, 68, 71, 72],
  },
  {
    label: 'Network I/O',
    icon: 'network',
    color: 'text-cyan-400',
    stroke: '#22d3ee',
    bar: 38,
    value: '98 MB/s',
    sub: '58 in / 40 out',
    series: [20, 35, 28, 52, 41, 77, 63, 48, 85, 60, 44, 58],
  },
  {
    label: 'Pod count',
    icon: 'pods',
    color: 'text-emerald-400',
    stroke: '#34d399',
    bar: 54,
    value: '54',
    sub: '54 / 100 capacity',
    series: [41, 42, 44, 44, 47, 49, 48, 51, 52, 52, 53, 54],
  },
]

export function DashboardsView() {
  return (
    <div>
      <ViewHeader title="Dashboard" />
      <p className="text-xs text-zinc-500 mb-4" role="note">
        Sample data — no metrics source connected. Values below are illustrative.
      </p>
      <div
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5"
        data-testid="dashboard-stats"
      >
        {PANELS.map((p) => (
          <StatCard
            key={p.label}
            label={p.label}
            value={p.value}
            sub={p.sub}
            color={p.color}
            icon={p.icon}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {PANELS.map((p) => (
          <Card key={p.label}>
            <CardHeader title={`${p.label} (last 1h)`} />
            <div className="p-5 space-y-3">
              <AreaChart data={p.series} color={p.stroke} width={400} height={80} />
              <MiniBar value={p.bar} className="w-full" />
              <p className="text-[10px] text-zinc-600">Sample data.</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
