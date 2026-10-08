import { useMemo, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
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

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (o) => o.metadata.uid ?? `${o.metadata.namespace ?? ''}/${o.metadata.name}`,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

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
      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--surface)' }}>
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
    </div>
  )
}
