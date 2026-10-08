import { Mono, StatusBadge, TD, TR, Table } from '../../ui'
import type { Release } from './HelmClient'

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
      headers={['Name', 'Chart', 'Version', 'Status', 'Namespace', 'App version']}
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
            <span className="text-xs font-mono text-zinc-400">
              {r.chart}-{r.chartVersion}
            </span>
          </TD>
          <TD>
            <span className="text-xs tabular-nums text-zinc-300">{r.revision}</span>
          </TD>
          <TD>
            <StatusBadge status={r.status} />
          </TD>
          <TD>
            <span className="text-xs text-zinc-400">{r.namespace}</span>
          </TD>
          <TD>
            <span className="text-xs text-zinc-500">{r.appVersion}</span>
          </TD>
        </TR>
      ))}
    </Table>
  )
}
