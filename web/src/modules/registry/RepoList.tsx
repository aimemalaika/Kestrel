import { linkButton } from './styles'

export function RepoList({
  repos,
  onSelect,
}: {
  repos: string[]
  onSelect: (repo: string) => void
}) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Repositories">
      {repos.map((r) => (
        <li key={r}>
          <button type="button" style={linkButton} onClick={() => onSelect(r)}>
            {r}
          </button>
        </li>
      ))}
    </ul>
  )
}
