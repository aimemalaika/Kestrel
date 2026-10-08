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
} from '@tanstack/react-table'
import { Link } from 'react-router-dom'
import type { K8sObject } from '../contract/types'
import { useSelection } from '../state/selection'
import { useResourceStream } from './useResourceStream'
import { columnSpecs } from './columns'
import { StatusPill } from './StatusPill'
import { ScanCell } from './ScanCell'
import { Age } from './Age'

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 'var(--space-6)', color: 'var(--text-muted)' }}>{children}</div>
}

export function ResourceTable() {
  const { namespace, gvr } = useSelection()
  const { rows, status } = useResourceStream(gvr, namespace)
  const kind = rows[0]?.kind ?? ''

  const columns = useMemo<ColumnDef<K8sObject>[]>(() => {
    const specs = columnSpecs(kind, { namespaceSelected: !!namespace })
    return specs.map((s) => ({
      id: s.id,
      header: s.header,
      accessorFn: (o: K8sObject) => s.value(o),
      cell: (ctx) => {
        const v = String(ctx.getValue() ?? '')
        if (s.id === 'name')
          return (
            <Link
              to={encodeURIComponent(v)}
              style={{ color: 'var(--brand-600)', textDecoration: 'none' }}
            >
              {v}
            </Link>
          )
        if (s.kind === 'status') return <StatusPill value={v} />
        if (s.kind === 'age') return <Age creationTimestamp={v === '—' ? undefined : v} />
        if (s.kind === 'scan') return <ScanCell value={v} />
        return v
      },
    }))
  }, [kind, namespace])

  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const [pageSize, setPageSize] = useState(50)
  const [pageIndex, setPageIndex] = useState(0)

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (o) => o.metadata.uid ?? `${o.metadata.namespace ?? ''}/${o.metadata.name}`,
    state: { sorting, globalFilter, pagination: { pageIndex, pageSize } },
    autoResetPageIndex: false,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const gvrKey = gvr ? `${gvr.group}/${gvr.version}/${gvr.resource}` : ''
  useEffect(() => {
    setPageIndex(0)
  }, [gvrKey, namespace, globalFilter])

  const total = table.getFilteredRowModel().rows.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const safeIndex = Math.min(pageIndex, pageCount - 1)
  const first = total === 0 ? 0 : safeIndex * pageSize + 1
  const last = Math.min(total, (safeIndex + 1) * pageSize)

  if (!gvr) return <Hint>Select a resource type from the sidebar.</Hint>
  if (status === 'loading') return <Hint>Loading…</Hint>
  if (status === 'error') return <Hint>Stream interrupted — resyncing…</Hint>
  if (rows.length === 0) return <Hint>No {gvr.resource} found.</Hint>

  return (
    <div style={{ padding: 'var(--space-6)' }}>
      <input
        placeholder="Search…"
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        style={{
          marginBottom: 'var(--space-4)',
          padding: '6px var(--space-3)',
          borderRadius: 'var(--r-badge)',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text)',
          minWidth: 240,
        }}
      />
      <table
        aria-label={`${gvr.resource} table`}
        style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--surface)' }}
      >
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  style={{
                    textAlign: 'left',
                    padding: 'var(--space-3)',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    fontSize: 12,
                    textTransform: 'uppercase',
                  }}
                >
                  <button
                    type="button"
                    onClick={h.column.getToggleSortingHandler()}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      font: 'inherit',
                      color: 'inherit',
                      textTransform: 'inherit',
                    }}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {({ asc: ' ▲', desc: ' ▼' } as Record<string, string>)[
                      h.column.getIsSorted() as string
                    ] ?? ''}
                  </button>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r) => (
            <tr key={r.id}>
              {r.getVisibleCells().map((c) => (
                <td
                  key={c.id}
                  style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)' }}
                >
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          alignItems: 'center',
          marginTop: 'var(--space-4)',
          color: 'var(--text-muted)',
        }}
      >
        <button type="button" onClick={() => setPageIndex(safeIndex - 1)} disabled={safeIndex <= 0}>
          Prev
        </button>
        <span>
          rows {first}–{last} of {total}
        </span>
        <button
          type="button"
          onClick={() => setPageIndex(safeIndex + 1)}
          disabled={safeIndex >= pageCount - 1}
        >
          Next
        </button>
        <select
          aria-label="Rows per page"
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
