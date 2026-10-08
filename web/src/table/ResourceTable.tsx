import { useMemo } from 'react'
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table'
import type { K8sObject } from '../contract/types'
import { useSelection } from '../state/selection'
import { useResourceStream } from './useResourceStream'
import { columnSpecs } from './columns'
import { StatusPill } from './StatusPill'
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
        if (s.kind === 'status') return <StatusPill value={v} />
        if (s.kind === 'age') return <Age creationTimestamp={v === '—' ? undefined : v} />
        return v
      },
    }))
  }, [kind, namespace])

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (o) => o.metadata.uid ?? `${o.metadata.namespace ?? ''}/${o.metadata.name}`,
    getCoreRowModel: getCoreRowModel(),
  })

  if (!gvr) return <Hint>Select a resource type from the sidebar.</Hint>
  if (status === 'loading') return <Hint>Loading…</Hint>
  if (status === 'error') return <Hint>Stream interrupted — resyncing…</Hint>
  if (rows.length === 0) return <Hint>No {gvr.resource} found.</Hint>

  return (
    <div style={{ padding: 'var(--space-6)' }}>
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
                  {flexRender(h.column.columnDef.header, h.getContext())}
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
