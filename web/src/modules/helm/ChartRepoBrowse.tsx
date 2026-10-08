import { useEffect, useState } from 'react'
import type { Chart, ChartRepo, HelmClient } from './HelmClient'

const btn = (active: boolean) =>
  ({
    padding: 'var(--space-2) var(--space-3)',
    background: active ? 'var(--brand-600)' : 'var(--surface)',
    color: active ? 'var(--surface)' : 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-badge)',
    cursor: 'pointer',
    marginRight: 'var(--space-2)',
  }) as const

export function ChartRepoBrowse({ client }: { client: HelmClient }) {
  const [repos, setRepos] = useState<ChartRepo[]>([])
  const [repo, setRepo] = useState<string | null>(null)
  const [charts, setCharts] = useState<Chart[]>([])

  useEffect(() => {
    let active = true
    client.listRepos().then((r) => active && setRepos(r))
    return () => {
      active = false
    }
  }, [client])

  useEffect(() => {
    if (!repo) return
    let active = true
    client.listCharts(repo).then((c) => active && setCharts(c))
    return () => {
      active = false
    }
  }, [client, repo])

  return (
    <div>
      <div role="group" aria-label="Chart repositories" style={{ marginBottom: 'var(--space-3)' }}>
        {repos.map((r) => (
          <button
            key={r.name}
            type="button"
            style={btn(r.name === repo)}
            onClick={() => setRepo(r.name)}
          >
            {r.name}
          </button>
        ))}
      </div>
      {repo && (
        <>
          <p style={{ color: 'var(--text-muted)' }}>{repos.find((r) => r.name === repo)?.url}</p>
          <ul aria-label="Charts" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {charts.map((c) => (
              <li
                key={c.name}
                style={{ padding: 'var(--space-2) 0', borderTop: '1px solid var(--border)' }}
              >
                <strong>{c.name}</strong>{' '}
                <span style={{ color: 'var(--text-muted)' }}>{c.version}</span>
                <div style={{ color: 'var(--text-muted)' }}>{c.description}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
