import { useMemo, useState } from 'react'
import { useResourceStream } from '../../table/useResourceStream'
import { getPath } from '../../table/columns'
import { ViewHeader, EmptyState, Card, PrimaryBtn, Icon } from '../../ui'
import { ArgoAppGrid } from './ArgoRichView'
import type { K8sObject } from '../../contract/types'

const GVR = { group: 'argoproj.io', version: 'v1alpha1', resource: 'applications' }
const PAGE_SIZES = [12, 24, 48, 96]

/** The Argo project an Application belongs to (`spec.project`; defaults to "default"). */
function projectOf(o: K8sObject): string {
  const p = getPath(o, 'spec.project')
  return typeof p === 'string' && p ? p : 'default'
}

/** The GitOps card grid of Argo Applications (live data via the generic stream). */
export function ArgoApplicationsView() {
  const { rows, status } = useResourceStream(GVR, 'argocd')
  const [q, setQ] = useState('')
  const [project, setProject] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(24)

  const projects = useMemo(() => Array.from(new Set(rows.map(projectOf))).sort(), [rows])

  const needle = q.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      rows.filter(
        (o) =>
          (!needle || o.metadata.name.toLowerCase().includes(needle)) &&
          (!project || projectOf(o) === project),
      ),
    [rows, needle, project],
  )

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const current = Math.min(page, pageCount - 1)
  const start = current * pageSize
  const pageRows = filtered.slice(start, start + pageSize)

  const control =
    'text-xs bg-zinc-800/70 border border-zinc-700/70 rounded-lg px-2.5 py-1.5 text-zinc-300 focus:outline-none focus:border-brand'
  const pageBtn =
    'text-xs px-3 py-1 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-300 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60'

  return (
    <div className="p-6">
      <ViewHeader
        title="Applications"
        count={filtered.length}
        action={
          <PrimaryBtn>
            <Icon name="plus" className="w-3.5 h-3.5" />
            Create Application
          </PrimaryBtn>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Filter by name"
          placeholder="Filter by name..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(0)
          }}
          className={`${control} w-64 max-w-full`}
        />
        <select
          aria-label="Project"
          value={project}
          onChange={(e) => {
            setProject(e.target.value)
            setPage(0)
          }}
          className={control}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {status === 'loading' && (
        <Card>
          <EmptyState title="Loading…" icon="refresh" />
        </Card>
      )}
      {status === 'error' && (
        <Card>
          <EmptyState title="Stream interrupted — resyncing…" icon="alert" />
        </Card>
      )}
      {status === 'ready' && filtered.length === 0 && (
        <Card>
          <EmptyState title="No applications found." />
        </Card>
      )}
      {status === 'ready' && filtered.length > 0 && (
        <>
          <ArgoAppGrid objects={pageRows} />
          <div className="mt-4 flex items-center gap-3 text-xs text-zinc-400">
            <button
              type="button"
              className={pageBtn}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={current === 0}
            >
              Prev
            </button>
            <span>
              {filtered.length === 0 ? 0 : start + 1}–{Math.min(start + pageSize, filtered.length)}{' '}
              of {filtered.length}
            </span>
            <button
              type="button"
              className={pageBtn}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={current >= pageCount - 1}
            >
              Next
            </button>
            <select
              aria-label="Per page"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(0)
              }}
              className={control}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  )
}
