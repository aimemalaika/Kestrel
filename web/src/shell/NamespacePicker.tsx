import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createClient } from '../client/createClient'
import { useSelection } from '../state/selection'

export function NamespacePicker() {
  const [namespaces, setNamespaces] = useState<string[]>([])
  const { namespace } = useSelection()
  const navigate = useNavigate()

  useEffect(() => {
    const stop = createClient().watch(
      { group: 'core', version: 'v1', resource: 'namespaces' },
      {},
      (e) => {
        if ('object' in e && e.object.kind === 'Namespace') {
          setNamespaces((prev) =>
            prev.includes(e.object.metadata.name) ? prev : [...prev, e.object.metadata.name].sort(),
          )
        }
      },
    )
    return stop
  }, [])

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Namespace</span>
      <select
        aria-label="Namespace"
        value={namespace ?? '_all'}
        onChange={(e) => navigate(`/ns/${e.target.value}`)}
        className="text-xs bg-zinc-800/70 border border-zinc-700/70 rounded-lg px-2.5 py-1.5 text-zinc-300 focus:outline-none focus:border-brand"
      >
        <option value="_all">All Namespaces</option>
        {namespaces.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  )
}
