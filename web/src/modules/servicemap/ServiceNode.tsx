import { useResourceStream } from '../../table/useResourceStream'
import { deriveHealth, workloadGvr, HEALTH_COLOR } from './health'
import type { LayoutNode } from './layout'
import type { SlaResult } from './sla'
import type { ServiceNodeModel } from './types'

const fmt = (n: number) => `${Number(n.toFixed(2))}%`

export function ServiceNode({
  svc,
  box,
  sla,
  selected,
  onSelect,
}: {
  svc: ServiceNodeModel
  box: LayoutNode
  sla: SlaResult
  selected: boolean
  onSelect: () => void
}) {
  const gvr = workloadGvr(svc.workload)
  const { rows, status } = useResourceStream(gvr, svc.workload?.namespace)
  const health = deriveHealth(rows, svc.workload, status === 'loading')
  const color = HEALTH_COLOR[health]
  const flagged = Number(sla.projected.toFixed(2)) < Number(sla.declared.toFixed(2))
  return (
    <g
      data-testid={`node-${svc.id}`}
      data-health={health}
      data-flagged={flagged}
      transform={`translate(${box.x},${box.y})`}
      className="cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label={`${svc.displayName}, ${health}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect()
      }}
    >
      <rect
        width={box.w}
        height={box.h}
        rx={8}
        fill="#18181b"
        stroke={selected ? '#e4e4e7' : color}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      <circle cx={14} cy={16} r={5} fill={color} />
      <text x={26} y={20} fill="#f4f4f5" fontSize={12} fontWeight={600}>
        {svc.displayName}
      </text>
      <text x={12} y={40} fill="#a1a1aa" fontSize={10}>
        {`SLO ${fmt(sla.declared)}`}
      </text>
      <text x={12} y={54} fill={flagged ? '#fbbf24' : '#a1a1aa'} fontSize={10}>
        {`SLA ${fmt(sla.projected)}${flagged ? ' ▼' : ''}`}
      </text>
    </g>
  )
}
