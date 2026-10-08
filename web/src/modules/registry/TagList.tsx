import { Mono, TD, TR, Table } from '../../ui'

export function TagList({ tags, onSelect }: { tags: string[]; onSelect: (tag: string) => void }) {
  if (tags.length === 0) return <p className="text-sm text-zinc-500">No tags.</p>
  return (
    <Table aria-label="Tags" headers={['Tag']}>
      {tags.map((t) => (
        <TR key={t}>
          <TD>
            <button
              type="button"
              onClick={() => onSelect(t)}
              className="bg-transparent border-0 p-0 cursor-pointer hover:underline"
            >
              <Mono>{t}</Mono>
            </button>
          </TD>
        </TR>
      ))}
    </Table>
  )
}
