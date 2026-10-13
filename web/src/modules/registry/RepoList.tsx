import { Mono, TD, TR, Table } from '../../ui'
import { ageString } from '../../table/columns'
import { shortDigest } from './TagList'

export interface RepoSummary {
  name: string
  namespace: string
  repository: string
  tags: string[]
  latestDigest?: string
  created?: string
}

const MAX_TAGS = 3

export function tagsLabel(tags: string[]): string {
  if (tags.length === 0) return '—'
  const shown = tags.slice(0, MAX_TAGS).join(', ')
  return tags.length > MAX_TAGS ? `${shown} +${tags.length - MAX_TAGS}` : shown
}

export function summarizeRepo(
  repo: string,
  tags: string[],
  image?: { digest: string; created?: string },
): RepoSummary {
  const parts = repo.split('/')
  return {
    name: parts[parts.length - 1],
    namespace: parts.length > 1 ? parts[parts.length - 2] : '',
    repository: repo,
    tags,
    latestDigest: image?.digest,
    created: image?.created,
  }
}

export function RepoList({
  repos,
  onSelect,
}: {
  repos: RepoSummary[]
  onSelect: (repo: string) => void
}) {
  return (
    <Table
      aria-label="Repositories"
      headers={['Name', 'Namespace', 'Repository', 'Tags', 'Latest Image', 'Age']}
    >
      {repos.map((r) => (
        <TR key={r.repository}>
          <TD>
            <button
              type="button"
              onClick={() => onSelect(r.repository)}
              className="bg-transparent border-0 p-0 cursor-pointer hover:underline"
            >
              <Mono>{r.name}</Mono>
            </button>
          </TD>
          <TD>{r.namespace || '—'}</TD>
          <TD>
            <Mono>{r.repository}</Mono>
          </TD>
          <TD>{tagsLabel(r.tags)}</TD>
          <TD>{r.latestDigest ? <Mono>{shortDigest(r.latestDigest)}</Mono> : '—'}</TD>
          <TD>{r.created ? ageString(r.created) : '—'}</TD>
        </TR>
      ))}
    </Table>
  )
}
