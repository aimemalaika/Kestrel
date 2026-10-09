import type { LayoutEdge } from './layout'

export function ServiceEdge({
  edge,
  critical,
  protocol,
  highlighted,
}: {
  edge: LayoutEdge
  critical: boolean
  protocol?: string
  highlighted: boolean
}) {
  const d = edge.points.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')
  const mid = edge.points[1]
  const mid2 = edge.points[2]
  const stroke = highlighted ? '#f59e0b' : critical ? '#a1a1aa' : '#52525b'
  return (
    <g
      data-testid={`edge-${edge.from}-${edge.to}`}
      data-critical={critical}
      data-highlighted={highlighted}
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={highlighted ? 2.5 : critical ? 1.75 : 1.25}
        strokeDasharray={critical ? undefined : '5 4'}
        markerEnd="url(#arrow)"
      />
      {protocol && (
        <text
          x={(mid[0] + mid2[0]) / 2}
          y={(mid[1] + mid2[1]) / 2 - 4}
          textAnchor="middle"
          fill="#a1a1aa"
          fontSize={9}
        >
          {protocol}
        </text>
      )}
    </g>
  )
}
