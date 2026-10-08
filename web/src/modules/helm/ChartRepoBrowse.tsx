import { useEffect, useState } from 'react'
import { Card } from '../../ui'
import type { Chart, ChartRepo, HelmClient } from './HelmClient'

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
      <div role="group" aria-label="Chart repositories" className="mb-3 flex flex-wrap gap-2">
        {repos.map((r) => (
          <button
            key={r.name}
            type="button"
            onClick={() => setRepo(r.name)}
            className={`text-xs px-3 py-1.5 rounded-md border cursor-pointer transition-colors ${
              r.name === repo
                ? 'bg-brand/15 text-brand-fg border-brand/30'
                : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>
      {repo && (
        <>
          <p className="text-xs text-zinc-500 font-mono">
            {repos.find((r) => r.name === repo)?.url}
          </p>
          <Card>
            <ul aria-label="Charts" className="list-none m-0 p-0 divide-y divide-zinc-800/60">
              {charts.map((c) => (
                <li key={c.name} className="px-5 py-3">
                  <strong className="font-mono text-sky-400 text-xs">{c.name}</strong>{' '}
                  <span className="text-xs tabular-nums text-zinc-400">{c.version}</span>
                  <div className="text-xs text-zinc-500 mt-0.5">{c.description}</div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}
