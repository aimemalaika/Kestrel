import { useEffect, useState } from 'react'
import { createClient } from '../client/createClient'
import type { CatalogEntry } from '../contract/types'
import { EmptyState, FilterBar, Mono, Table, TD, TR, ViewHeader } from '../ui'

export function ApiExplorerView() {
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let live = true
    createClient()
      .catalog()
      .then((c) => live && setEntries(c))
      .catch(() => live && setError(true))
    return () => {
      live = false
    }
  }, [])

  const q = query.trim().toLowerCase()
  const rows = (entries ?? []).filter(
    (e) => !q || `${e.kind} ${e.group} ${e.resource}`.toLowerCase().includes(q),
  )

  return (
    <div>
      <ViewHeader title="API Explorer" count={entries ? rows.length : undefined} />
      <FilterBar query={query} onQuery={setQuery} />
      {error ? (
        <EmptyState title="Could not load the API catalog" />
      ) : !entries ? (
        <EmptyState title="Loading catalog..." />
      ) : rows.length === 0 ? (
        <EmptyState title="No resource kinds match" hint="Try a different kind or group" />
      ) : (
        <Table
          aria-label="API resource kinds"
          headers={['Group', 'Version', 'Resource', 'Kind', 'Namespaced', 'Verbs']}
        >
          {rows.map((e) => (
            <TR key={`${e.group}/${e.version}/${e.resource}`}>
              <TD>{e.group || 'core'}</TD>
              <TD>{e.version}</TD>
              <TD>
                <Mono>{e.resource}</Mono>
              </TD>
              <TD>{e.kind}</TD>
              <TD>{e.namespaced ? 'yes' : 'no'}</TD>
              <TD>
                <Mono>{e.verbs.join(', ')}</Mono>
              </TD>
            </TR>
          ))}
        </Table>
      )}
    </div>
  )
}
