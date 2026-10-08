import { useId } from 'react'

export function AreaChart({
  data,
  color,
  height = 56,
  width = 200,
}: {
  data: number[]
  color: string
  height?: number
  width?: number
}) {
  const gradId = `g${useId().replace(/[^a-z0-9]/gi, '')}`
  if (data.length < 2) return null
  const max = Math.max(...data) || 1
  const min = Math.min(...data)
  const range = max - min || 1
  const pad = 4
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - pad - ((v - min) / range) * (height - pad * 2),
  }))
  const lineStr = pts.map((p) => `${p.x},${p.y}`).join(' ')
  const areaStr =
    `M${pts[0].x},${height} ` +
    pts.map((p) => `L${p.x},${p.y}`).join(' ') +
    ` L${pts[pts.length - 1].x},${height} Z`
  const last = pts[pts.length - 1]
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="w-full overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaStr} fill={`url(#${gradId})`} />
      <polyline
        points={lineStr}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last.x} cy={last.y} r="2.5" fill={color} />
    </svg>
  )
}

const STAGE_COLORS: Record<string, string> = {
  Succeeded: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400',
  Running: 'bg-sky-500/20 border-sky-500/50 text-sky-400 animate-pulse',
  Failed: 'bg-red-500/20 border-red-500/50 text-red-400',
  Pending: 'bg-zinc-700/40 border-zinc-600/40 text-zinc-500',
  Skipped: 'bg-zinc-700/20 border-zinc-700/30 text-zinc-600',
  Cancelled: 'bg-zinc-700/30 border-zinc-600/30 text-zinc-500',
}

export function StageViz({
  stages,
}: {
  stages: { name: string; status: string; duration?: string }[]
}) {
  return (
    <ol className="flex items-center gap-0 list-none m-0 p-0">
      {stages.map((s, i) => (
        <li key={i} className="flex items-center" title={s.status}>
          <div
            className={`px-2 py-1 rounded border text-[10px] font-medium ${STAGE_COLORS[s.status] ?? STAGE_COLORS.Pending}`}
          >
            {s.name}
            {s.duration && <span className="ml-1 opacity-60">{s.duration}</span>}
            <span className="sr-only"> ({s.status})</span>
          </div>
          {i < stages.length - 1 && <div className="w-4 h-px bg-zinc-700 mx-0.5" />}
        </li>
      ))}
    </ol>
  )
}
