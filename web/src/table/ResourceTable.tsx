import { useEffect, useMemo, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ViewHeader, FilterBar, Table, TR, TD, Mono, EmptyState, Icon, PrimaryBtn } from '../ui'
import type { K8sObject } from '../contract/types'
import { useSelection } from '../state/selection'
import { useResourceStream } from './useResourceStream'
import { columnSpecs, isDefaultStorageClass } from './columns'
import { StatusPill } from './StatusPill'
import { ScanCell } from './ScanCell'
import { Age } from './Age'

function RestartsCell({ value }: { value: string }) {
  const n = Number(value)
  const tone = n > 5 ? 'text-red-400' : n > 0 ? 'text-amber-400' : 'text-zinc-300'
  return <span className={`tabular-nums ${tone}`}>{value}</span>
}

function PodSquares({ value }: { value: string }) {
  const [r, d] = value.split('/').map((x) => Number(x) || 0)
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${r} of ${d} pods ready`}
      data-testid="pod-squares"
    >
      {Array.from({ length: d }, (_, i) => (
        <span
          key={i}
          data-ready={i < r ? 'true' : 'false'}
          className={`w-2.5 h-2.5 rounded-sm ${i < r ? 'bg-emerald-500' : 'bg-zinc-600'}`}
        />
      ))}
    </span>
  )
}

function ReadyFrac({ value }: { value: string }) {
  const [r, d] = value.split('/').map((x) => Number(x) || 0)
  const tone = r === 0 ? 'text-red-400' : r >= d ? 'text-emerald-400' : 'text-amber-400'
  return <span className={`tabular-nums ${tone}`}>{value}</span>
}

/** Local-only replica stepper (mock mode: no backend write). */
function ScaleCell({ value, name }: { value: string; name: string }) {
  const [n, setN] = useState(Number(value) || 0)
  const btn =
    'w-5 h-5 inline-flex items-center justify-center rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60'
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        className={btn}
        aria-label={`Scale down ${name}`}
        disabled={n <= 0}
        onClick={() => setN((x) => Math.max(0, x - 1))}
      >
        −
      </button>
      <span className="tabular-nums w-4 text-center text-zinc-200" data-testid="replica-count">
        {n}
      </span>
      <button
        type="button"
        className={btn}
        aria-label={`Scale up ${name}`}
        onClick={() => setN((x) => x + 1)}
      >
        +
      </button>
    </span>
  )
}

const dimDash = <span className="text-zinc-500">—</span>

const SVC_TYPE_TONE: Record<string, string> = {
  LoadBalancer: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  NodePort: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  ClusterIP: 'bg-zinc-700/40 text-zinc-400 border-zinc-600/40',
}
const chip = 'inline-flex px-2 py-0.5 rounded text-xs font-medium border'

function Chip({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`${chip} ${tone}`}>{children}</span>
}

function RouteHost({ value }: { value: string }) {
  if (value === '—') return dimDash
  return (
    <a
      href={`https://${value}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-sky-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 rounded"
    >
      {value}
      <Icon name="external" className="w-3 h-3" />
    </a>
  )
}

const TLS_TONE: Record<string, string> = {
  edge: 'text-emerald-400',
  reencrypt: 'text-emerald-400',
  Enabled: 'text-emerald-400',
}

const cellAlign = (a?: 'right') => (a === 'right' ? 'text-right tabular-nums' : '')

const pageBtn =
  'text-xs px-3 py-1 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-300 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60'

export function ResourceTable({
  action,
  rowActions,
}: {
  /** Header action slot (e.g. a Create button). */
  action?: ReactNode
  /** Trailing per-row action slot (logs / terminal / more). */
  rowActions?: (o: K8sObject) => ReactNode
} = {}) {
  const { namespace, gvr } = useSelection()
  const { rows, status } = useResourceStream(gvr, namespace)
  const kind = rows[0]?.kind ?? ''

  const columns = useMemo<ColumnDef<K8sObject>[]>(() => {
    const specs = columnSpecs(kind, { namespaceSelected: !!namespace })
    return specs.map((s) => ({
      id: s.id,
      header: s.header,
      meta: { align: s.align },
      filterFn: 'equalsString',
      accessorFn: (o: K8sObject) => s.value(o),
      cell: (ctx) => {
        const v = String(ctx.getValue() ?? '')
        if (s.id === 'name')
          return (
            <span className="inline-flex items-center gap-2">
              <Link
                to={encodeURIComponent(v)}
                className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 rounded"
              >
                <Mono>{v}</Mono>
              </Link>
              {kind === 'StorageClass' && isDefaultStorageClass(ctx.row.original) && (
                <Chip tone="bg-sky-500/15 text-sky-400 border-sky-500/30">default</Chip>
              )}
            </span>
          )
        if (s.kind === 'status') return <StatusPill value={v} />
        if (s.kind === 'age') return <Age creationTimestamp={v === '—' ? undefined : v} />
        if (s.kind === 'scan') return <ScanCell value={v} />
        if (s.kind === 'restarts') return <RestartsCell value={v} />
        if (s.kind === 'podsquares') return <PodSquares value={v} />
        if (s.kind === 'readyfrac') return <ReadyFrac value={v} />
        if (s.kind === 'scale') return <ScaleCell value={v} name={ctx.row.original.metadata.name} />
        if (s.kind === 'strategy')
          return v === '—' ? (
            <span className="text-zinc-500">—</span>
          ) : (
            <span className={v === 'Recreate' ? 'text-amber-400' : 'text-zinc-300'}>{v}</span>
          )
        if (s.kind === 'svctype')
          return v === '—' ? (
            dimDash
          ) : (
            <Chip tone={SVC_TYPE_TONE[v] ?? SVC_TYPE_TONE.ClusterIP}>{v}</Chip>
          )
        if (s.kind === 'routehost') return <RouteHost value={v} />
        if (s.kind === 'tls') return <span className={TLS_TONE[v] ?? 'text-zinc-500'}>{v}</span>
        if (s.kind === 'keys') return <span className="text-zinc-300">{v} keys</span>
        if (s.kind === 'rolekind')
          return (
            <Chip
              tone={
                v === 'ClusterRole'
                  ? 'bg-violet-500/15 text-violet-400 border-violet-500/30'
                  : 'bg-sky-500/15 text-sky-400 border-sky-500/30'
              }
            >
              {v}
            </Chip>
          )
        if (s.kind === 'rolemono')
          return v === '—' ? (
            dimDash
          ) : (
            <span className="font-mono text-xs text-violet-400">{v}</span>
          )
        if (s.kind === 'check')
          return v === 'true' ? (
            <span className="text-emerald-400" role="img" aria-label="Yes">
              <Icon name="check" />
            </span>
          ) : (
            dimDash
          )
        if (s.kind === 'mono')
          return v === '—' ? <span className="text-zinc-500">—</span> : <Mono>{v}</Mono>
        return s.kind === 'text' && s.id !== 'name' ? <span className="text-zinc-300">{v}</span> : v
      },
    }))
  }, [kind, namespace])

  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [nsFilter, setNsFilter] = useState('')
  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const f: ColumnFiltersState = []
    if (statusFilter) f.push({ id: 'status', value: statusFilter })
    if (nsFilter) f.push({ id: 'namespace', value: nsFilter })
    return f
  }, [statusFilter, nsFilter])

  const [pageSize, setPageSize] = useState(50)
  const [pageIndex, setPageIndex] = useState(0)

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (o) => o.metadata.uid ?? `${o.metadata.namespace ?? ''}/${o.metadata.name}`,
    state: { sorting, globalFilter, columnFilters, pagination: { pageIndex, pageSize } },
    autoResetPageIndex: false,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getColumnCanGlobalFilter: () => true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const gvrKey = gvr ? `${gvr.group}/${gvr.version}/${gvr.resource}` : ''
  useEffect(() => {
    setPageIndex(0)
  }, [gvrKey, namespace, globalFilter, statusFilter, nsFilter])
  // Reset filters when the resource type changes: a status/ns chip from the
  // previous kind would otherwise persist with no visible control to clear it
  // (the new kind may render no matching chips), stranding every row.
  useEffect(() => {
    setStatusFilter('')
    setNsFilter('')
    setGlobalFilter('')
  }, [gvrKey])

  const statusSpec = columns.find((c) => c.id === 'status')
  const statusValue = useMemo(
    () =>
      columnSpecs(kind, { namespaceSelected: !!namespace }).find((c) => c.id === 'status')?.value,
    [kind, namespace],
  )
  const hasNsCol = columns.some((c) => c.id === 'namespace')
  const statuses = useMemo(
    () =>
      statusSpec && statusValue
        ? [...new Set(rows.map((o) => statusValue(o)))].filter((v) => v !== '—').sort()
        : [],
    [rows, statusSpec, statusValue],
  )
  const namespaces = useMemo(
    () =>
      hasNsCol
        ? [...new Set(rows.map((o) => o.metadata.namespace).filter((n): n is string => !!n))].sort()
        : [],
    [rows, hasNsCol],
  )

  const total = table.getFilteredRowModel().rows.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const safeIndex = Math.min(pageIndex, pageCount - 1)
  const first = total === 0 ? 0 : safeIndex * pageSize + 1
  const last = Math.min(total, (safeIndex + 1) * pageSize)

  // A live `deleted` delta can drop the row count below the current page.
  // Clamp pageIndex back into range so the body never strands on a blank page.
  useEffect(() => {
    if (pageIndex > pageCount - 1) setPageIndex(Math.max(0, pageCount - 1))
  }, [pageCount, pageIndex])

  const title = gvr ? kind || gvr.resource : 'Resources'
  // Generic "Create <Kind>" (inert in mock mode) unless the caller supplies an action.
  const headerAction =
    action ??
    (gvr && kind ? (
      <span title={`Create ${kind} (not available in mock mode)`}>
        <PrimaryBtn>
          <Icon name="plus" /> Create {kind}
        </PrimaryBtn>
      </span>
    ) : undefined)
  const wrap = (children: ReactNode) => (
    <div className="p-6">
      <ViewHeader title={title} action={headerAction} />
      {children}
    </div>
  )
  const card = (children: ReactNode) => (
    <div className="bg-surface border border-zinc-800/80 rounded-xl">{children}</div>
  )

  if (!gvr)
    return wrap(card(<EmptyState title="Select a resource type from the sidebar." icon="search" />))
  if (status === 'loading') return wrap(card(<EmptyState title="Loading…" icon="refresh" />))
  if (status === 'error')
    return wrap(card(<EmptyState title="Stream interrupted — resyncing…" icon="alert" />))
  if (rows.length === 0) return wrap(card(<EmptyState title={`No ${gvr.resource} found.`} />))

  const headers = table.getHeaderGroups()[0].headers.map((h) => {
    const align = (h.column.columnDef.meta as { align?: 'right' } | undefined)?.align
    const sorted = h.column.getIsSorted()
    return {
      align,
      label: (
        <button
          type="button"
          onClick={h.column.getToggleSortingHandler()}
          className="uppercase tracking-wider font-semibold hover:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 rounded"
        >
          {flexRender(h.column.columnDef.header, h.getContext())}
          {sorted && (
            <span aria-hidden="true" className="ml-1">
              {sorted === 'asc' ? '▲' : '▼'}
            </span>
          )}
        </button>
      ),
    }
  })
  // Pods get default row actions (logs / terminal / more) matching the design;
  // each opens the pod's drawer (relative link, like the name cell).
  const actBtn =
    'p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60'
  const podActions = (o: K8sObject): ReactNode => (
    <>
      <Link
        to={encodeURIComponent(o.metadata.name)}
        aria-label={`Logs: ${o.metadata.name}`}
        className={actBtn}
      >
        <Icon name="logs" />
      </Link>
      <Link
        to={encodeURIComponent(o.metadata.name)}
        aria-label={`Terminal: ${o.metadata.name}`}
        className={actBtn}
      >
        <Icon name="terminal" />
      </Link>
      <Link
        to={encodeURIComponent(o.metadata.name)}
        aria-label={`More: ${o.metadata.name}`}
        className={actBtn}
      >
        <Icon name="dots" />
      </Link>
    </>
  )
  const deployActions = (o: K8sObject): ReactNode => (
    <>
      <Link
        to={encodeURIComponent(o.metadata.name)}
        aria-label={`Open: ${o.metadata.name}`}
        className={actBtn}
      >
        <Icon name="external" />
      </Link>
      <Link
        to={encodeURIComponent(o.metadata.name)}
        aria-label={`More: ${o.metadata.name}`}
        className={actBtn}
      >
        <Icon name="dots" />
      </Link>
    </>
  )
  const linkActions =
    (icons: Array<[string, string]>) =>
    (o: K8sObject): ReactNode => (
      <>
        {icons.map(([label, icon]) => (
          <Link
            key={label}
            to={encodeURIComponent(o.metadata.name)}
            aria-label={`${label}: ${o.metadata.name}`}
            className={actBtn}
          >
            <Icon name={icon} />
          </Link>
        ))}
      </>
    )
  const KIND_ACTIONS: Partial<Record<string, (o: K8sObject) => ReactNode>> = {
    Pod: podActions,
    Deployment: deployActions,
    ConfigMap: linkActions([
      ['Copy', 'copy'],
      ['More', 'dots'],
    ]),
    Secret: linkActions([
      ['View', 'secret'],
      ['More', 'dots'],
    ]),
    Build: linkActions([
      ['Logs', 'logs'],
      ['More', 'dots'],
    ]),
    BuildConfig: linkActions([
      ['Run', 'run'],
      ['More', 'dots'],
    ]),
  }
  const effectiveRowActions = rowActions ?? KIND_ACTIONS[kind]
  if (effectiveRowActions)
    headers.push({ align: 'right', label: <span className="sr-only">Actions</span> })

  return (
    <div className="p-6">
      <ViewHeader title={title} count={total} action={headerAction} />
      <FilterBar
        query={globalFilter}
        onQuery={setGlobalFilter}
        namespaceFilter={nsFilter}
        onNamespace={hasNsCol ? setNsFilter : undefined}
        namespaces={namespaces}
        statusFilter={statusFilter}
        onStatus={(s) => setStatusFilter((cur) => (cur === s ? '' : s))}
        statuses={statuses}
      />
      <Table headers={headers} aria-label={`${gvr.resource} table`}>
        {total === 0 ? (
          <tr>
            <td colSpan={headers.length}>
              <EmptyState title="No matching rows" hint="Adjust the filters to see more." />
            </td>
          </tr>
        ) : (
          table.getRowModel().rows.map((r) => (
            <TR key={r.id}>
              {r.getVisibleCells().map((c) => (
                <TD
                  key={c.id}
                  className={cellAlign(
                    (c.column.columnDef.meta as { align?: 'right' } | undefined)?.align,
                  )}
                >
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </TD>
              ))}
              {effectiveRowActions && (
                <TD className="text-right">
                  <span className="inline-flex items-center gap-1 text-zinc-500">
                    {effectiveRowActions(r.original)}
                  </span>
                </TD>
              )}
            </TR>
          ))
        )}
      </Table>
      <div className="flex items-center gap-3 mt-4 text-xs text-zinc-500">
        <button
          type="button"
          className={pageBtn}
          onClick={() => setPageIndex(safeIndex - 1)}
          disabled={safeIndex <= 0}
        >
          Prev
        </button>
        <span className="tabular-nums">
          rows {first}–{last} of {total}
        </span>
        <button
          type="button"
          className={pageBtn}
          onClick={() => setPageIndex(safeIndex + 1)}
          disabled={safeIndex >= pageCount - 1}
        >
          Next
        </button>
        <select
          aria-label="Rows per page"
          className="text-xs bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value))
            setPageIndex(0)
          }}
        >
          {[25, 50, 100, 200].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
