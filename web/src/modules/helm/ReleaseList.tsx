import { Mono, StatusBadge, TD, TR, Table } from '../../ui'
import type { Release } from './HelmClient'

function ago(iso: string): string {
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms) || ms < 0) return '-'
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function ReleaseList({
  releases,
  onSelect,
}: {
  releases: Release[]
  onSelect: (r: Release) => void
}) {
  if (releases.length === 0) return <p className="text-sm text-zinc-500">No releases.</p>
  return (
    <Table
      aria-label="Releases"
      headers={['Name', 'Chart', 'Version', 'Status', 'Namespace', 'Last Updated']}
    >
      {releases.map((r) => (
        <TR key={`${r.namespace}/${r.name}`}>
          <TD>
            <button
              type="button"
              onClick={() => onSelect(r)}
              className="bg-transparent border-0 p-0 cursor-pointer hover:underline"
            >
              <Mono>{r.name}</Mono>
            </button>
          </TD>
          <TD>
            <span className="text-xs font-mono text-zinc-400">{r.chart}</span>
          </TD>
          <TD>
            <span className="text-xs tabular-nums text-zinc-300">{r.chartVersion}</span>
          </TD>
          <TD>
            <StatusBadge status={r.status} />
          </TD>
          <TD>
            <span className="text-xs text-zinc-400">{r.namespace}</span>
          </TD>
          <TD>
            <span className="text-xs text-zinc-500">{ago(r.updated)}</span>
          </TD>
        </TR>
      ))}
    </Table>
  )
}
