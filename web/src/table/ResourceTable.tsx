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
import { ViewHeader, FilterBar, Table, TR, TD, Mono, EmptyState } from '../ui'
import type { K8sObject } from '../contract/types'
import { useSelection } from '../state/selection'
import { useResourceStream } from './useResourceStream'
import { columnSpecs, getPath } from './columns'
import { StatusPill } from './StatusPill'
import { ScanCell } from './ScanCell'
import { Age } from './Age'

function UsageCell({ value }: { value: string }) {
  const pct = Number(value)
  if (value === 'n/a' || Number.isNaN(pct)) return <span className="text-zinc-500">n/a</span>
  const bar = pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <span className="inline-flex items-center gap-2 tabular-nums text-zinc-300">
      <span aria-hidden="true" className="w-12 h-1.5 rounded bg-zinc-800 overflow-hidden">
        <span className={`block h-full ${bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      {pct}%
    </span>
  )
}

function RestartsCell({ value }: { value: string }) {
  const n = Number(value)
  const tone = n > 5 ? 'text-red-400' : n > 0 ? 'text-amber-400' : 'text-zinc-300'
  return <span className={`tabular-nums ${tone}`}>{value}</span>
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
            <Link
              to={encodeURIComponent(v)}
              className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 rounded"
            >
              <Mono>{v}</Mono>
            </Link>
          )
        if (s.kind === 'status') return <StatusPill value={v} />
        if (s.kind === 'age') return <Age creationTimestamp={v === '—' ? undefined : v} />
        if (s.kind === 'scan') return <ScanCell value={v} />
        if (s.kind === 'usage') return <UsageCell value={v} />
        if (s.kind === 'restarts') return <RestartsCell value={v} />
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
  const hasNsCol = columns.some((c) => c.id === 'namespace')
  const statuses = useMemo(
    () =>
      statusSpec
        ? [...new Set(rows.map((o) => String(getPath(o, 'status.phase') ?? '—')))]
            .filter((v) => v !== '—')
            .sort()
        : [],
    [rows, statusSpec],
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
  const wrap = (children: ReactNode) => (
    <div className="p-6">
      <ViewHeader title={title} action={action} />
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
  if (rowActions) headers.push({ align: 'right', label: <span className="sr-only">Actions</span> })

  return (
    <div className="p-6">
      <ViewHeader title={title} count={total} action={action} />
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
              {rowActions && (
                <TD className="text-right">
                  <span className="inline-flex items-center gap-1 text-zinc-500">
                    {rowActions(r.original)}
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
