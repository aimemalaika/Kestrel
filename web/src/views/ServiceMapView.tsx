import { useEffect, useMemo, useState } from 'react'
import { ViewHeader, EmptyState, Card } from '../ui'
import { parseServiceMap } from '../modules/servicemap/parse'
import { projectSla } from '../modules/servicemap/sla'
import { layoutGraph, graphSize } from '../modules/servicemap/layout'
import { ServiceNode } from '../modules/servicemap/ServiceNode'
import { ServiceEdge } from '../modules/servicemap/ServiceEdge'
import { UploadPanel } from '../modules/servicemap/UploadPanel'
import type { ApiError } from '../contract/types'
import type { ParseResult } from '../modules/servicemap/types'
import { getServiceMap, putServiceMap } from '../modules/servicemap/serviceMapClient'

export function ServiceMapView() {
  // `null` result + `loading` = fetching the stored map; `null` result when not
  // loading = nothing stored (empty state). The sample is a client-side preview
  // only (no PUT), so it never overwrites the persisted cluster map.
  const [result, setResult] = useState<ParseResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getServiceMap()
      .then((model) => {
        if (!active) return
        if (model.services.length > 0) setResult({ ok: true, model })
      })
      .catch((err: ApiError) => {
        if (active) setLoadError(err.error)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const onPreview = (text: string) => {
    setSelected(null)
    setLoadError(null)
    setResult(parseServiceMap(text))
  }

  const onSubmit = (text: string) => {
    setSelected(null)
    setLoadError(null)
    setPending(true)
    putServiceMap(text)
      .then((r) => setResult(r))
      .catch((err: ApiError) => setLoadError(err.error))
      .finally(() => setPending(false))
  }

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
      <UploadPanel onPreview={onPreview} onSubmit={onSubmit} pending={pending} />

      {loadError && (
        <Card className="p-4">
          <p className="text-sm font-medium text-red-400">Could not load service map</p>
          <p className="text-xs text-zinc-400 mt-1">{loadError}</p>
        </Card>
      )}

      {loading && (
        <Card className="p-4">
          <p className="text-sm text-zinc-400">Loading service map…</p>
        </Card>
      )}

      {!loading && !loadError && !result && (
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
