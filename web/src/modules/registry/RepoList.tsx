import { Mono, TD, TR, Table } from '../../ui'

export function RepoList({
  repos,
  onSelect,
}: {
  repos: string[]
  onSelect: (repo: string) => void
}) {
  return (
    <Table aria-label="Repositories" headers={['Repository']}>
      {repos.map((r) => (
        <TR key={r}>
          <TD>
            <button
              type="button"
              onClick={() => onSelect(r)}
              className="bg-transparent border-0 p-0 cursor-pointer hover:underline"
            >
              <Mono>{r}</Mono>
            </button>
          </TD>
        </TR>
      ))}
    </Table>
  )
}
