import { linkButton } from './styles'

export function TagList({ tags, onSelect }: { tags: string[]; onSelect: (tag: string) => void }) {
  if (tags.length === 0) return <p style={{ color: 'var(--text-muted)' }}>No tags.</p>
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Tags">
      {tags.map((t) => (
        <li key={t}>
          <button type="button" style={linkButton} onClick={() => onSelect(t)}>
            {t}
          </button>
        </li>
      ))}
    </ul>
  )
}
