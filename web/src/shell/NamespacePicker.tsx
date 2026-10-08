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
    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Namespace</span>
      <select
        value={namespace ?? ''}
        onChange={(e) => navigate(`/ns/${e.target.value}`)}
        style={{
          padding: '4px var(--space-2)',
          borderRadius: 'var(--r-badge)',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text)',
        }}
      >
        <option value="" disabled>
          Select…
        </option>
        {namespaces.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  )
}
