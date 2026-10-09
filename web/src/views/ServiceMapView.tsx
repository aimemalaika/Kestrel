import { useMemo, useState } from 'react'
import { ViewHeader, EmptyState, Card } from '../ui'
import { parseServiceMap } from '../modules/servicemap/parse'
import { projectSla } from '../modules/servicemap/sla'
import { layoutGraph, graphSize } from '../modules/servicemap/layout'
import { ServiceNode } from '../modules/servicemap/ServiceNode'
import { ServiceEdge } from '../modules/servicemap/ServiceEdge'
import { UploadPanel } from '../modules/servicemap/UploadPanel'
import type { ParseResult } from '../modules/servicemap/types'
import { SAMPLE_YAML } from '../modules/servicemap/sample'

export function ServiceMapView() {
  // Preview the sample map by default so the screen shows a graph on first open.
  const [result, setResult] = useState<ParseResult | null>(() => parseServiceMap(SAMPLE_YAML))
  const [selected, setSelected] = useState<string | null>(null)

  const computed = useMemo(() => {
    if (!result?.ok) return null
    return {
      sla: projectSla(result.model),
      layout: layoutGraph(result.model),
    }
  }, [result])

  const sel = selected && computed ? computed.sla.get(selected) : undefined
  const highlightedEdges = new Set<string>()
  if (sel) {
    for (let i = 0; i < sel.path.length - 1; i++) {
      highlightedEdges.add(`${sel.path[i + 1]}>${sel.path[i]}`)
    }
  }

  return (
    <div className="space-y-4">
      <ViewHeader title="Service Map" />
      <UploadPanel
        onLoad={(t) => {
          setSelected(null)
          setResult(parseServiceMap(t))
        }}
      />

      {!result && (
        <EmptyState
          title="No service map loaded"
          hint="Upload a services.yaml or load the sample to see your services and projected SLAs."
          icon="topology"
        />
      )}

      {result && !result.ok && (
        <Card className="p-4">
          <p className="text-sm font-medium text-red-400 mb-2">
            Validation failed ({result.errors.length})
          </p>
          <ul role="alert" className="space-y-1 text-xs text-zinc-300 list-disc pl-5">
            {result.errors.map((e, i) => (
              <li key={i}>
                {e.message}
                {e.edge && <span className="text-zinc-500"> [{e.edge.join(' → ')}]</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {result?.ok && computed && (
        <Card className="p-4 space-y-3">
          <div className="overflow-x-auto">
            <svg
              role="img"
              aria-label={`Service map ${result.model.name}`}
              {...(() => {
                const s = graphSize(computed.layout.nodes)
                return { width: s.width, height: s.height, viewBox: `0 0 ${s.width} ${s.height}` }
              })()}
            >
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill="#a1a1aa" />
                </marker>
              </defs>
              {computed.layout.edges.map((e) => {
                const dep = result.model.services
                  .find((s) => s.id === e.from)
                  ?.dependsOn.find((d) => d.id === e.to)
                return (
                  <ServiceEdge
                    key={`${e.from}>${e.to}`}
                    edge={e}
                    critical={dep?.critical ?? true}
                    protocol={dep?.protocol}
                    highlighted={highlightedEdges.has(`${e.from}>${e.to}`)}
                  />
                )
              })}
              {result.model.services.map((svc) => (
                <ServiceNode
                  key={svc.id}
                  svc={svc}
                  box={computed.layout.nodes.find((n) => n.id === svc.id)!}
                  sla={computed.sla.get(svc.id)!}
                  selected={selected === svc.id}
                  onSelect={() => setSelected(svc.id)}
                />
              ))}
            </svg>
          </div>

          {sel && (
            <div
              data-testid="callout"
              className="text-xs rounded-md border border-zinc-800 bg-zinc-950 p-3"
            >
              {sel.limitedBy ? (
                <p className="text-amber-300">
                  {`≤ ${Number(sel.projected.toFixed(2))}%, limited by `}
                  <code>{sel.limitedBy}</code>
                  <span className="text-zinc-500">{` (path: ${sel.path.join(' → ')})`}</span>
                </p>
              ) : (
                <p className="text-zinc-300">
                  {`${sel.id}: no critical dependencies, SLA equals declared SLO (${sel.declared}%).`}
                </p>
              )}
            </div>
          )}

          <p className="text-[11px] text-zinc-500">
            Projected SLA is an estimate: it assumes independent failures and no redundancy, and is
            not a guarantee. Solid edges are critical dependencies; dashed edges are soft and
            excluded.
          </p>
        </Card>
      )}
    </div>
  )
}
