import { Mono, StatusBadge, TD, TR, Table } from '../../ui'
import { ageString } from '../../table/columns'
import type { TagHistory } from './RegistryClient'

export function shortDigest(d: string): string {
  const hex = d.replace(/^sha256:/, '')
  return `sha256:${hex.slice(0, 12)}`
}

function megabytes(n: number): string {
  return `${(n / 1_000_000).toFixed(1)} MB`
}

/** Album view: one row per tag, newest first (order as served). */
export function TagList({
  history,
  deployed,
  onSelect,
}: {
  history: TagHistory[]
  /** Tags currently running in a workload (best-effort). */
  deployed?: ReadonlySet<string>
  onSelect: (tag: string) => void
}) {
  if (history.length === 0) return <p className="text-sm text-zinc-500">No tags.</p>
  return (
    <Table aria-label="Tags" headers={['Tag', 'Digest', 'Created', 'Size']}>
      {history.map((h) => (
        <TR key={h.tag}>
          <TD>
            <button
              type="button"
              onClick={() => onSelect(h.tag)}
              className="bg-transparent border-0 p-0 cursor-pointer hover:underline"
            >
              <Mono>{h.tag}</Mono>
            </button>
            {deployed?.has(h.tag) && (
              <span className="ml-2">
                <StatusBadge status="Deployed" />
              </span>
            )}
          </TD>
          <TD>
            <Mono>{shortDigest(h.digest)}</Mono>
          </TD>
          <TD>{ageString(h.created)}</TD>
          <TD>{megabytes(h.size)}</TD>
        </TR>
      ))}
    </Table>
  )
}
