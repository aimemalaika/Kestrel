import { useEffect, useMemo, useState } from 'react'
import { createHelmClient, type HelmClient, type Release } from './HelmClient'
import { ReleaseList } from './ReleaseList'
import { ReleaseDetail } from './ReleaseDetail'
import { ChartRepoBrowse } from './ChartRepoBrowse'

const tab = (active: boolean) =>
  ({
    padding: 'var(--space-2) var(--space-3)',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid var(--brand-600)' : '2px solid transparent',
    color: active ? 'var(--text)' : 'var(--text-muted)',
    cursor: 'pointer',
  }) as const

export function HelmBrowser({ client: injected }: { client?: HelmClient }) {
  const client = useMemo(() => injected ?? createHelmClient(), [injected])
  const [view, setView] = useState<'releases' | 'charts'>('releases')
  const [releases, setReleases] = useState<Release[]>([])
  const [selected, setSelected] = useState<Release | null>(null)

  useEffect(() => {
    let active = true
    client.listReleases().then((r) => active && setReleases(r))
    return () => {
      active = false
    }
  }, [client])

  return (
    <section style={{ padding: 'var(--space-4)', color: 'var(--text)' }}>
      <h1 style={{ marginTop: 0 }}>Helm</h1>
      <div role="tablist" style={{ marginBottom: 'var(--space-4)' }}>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'releases'}
          style={tab(view === 'releases')}
          onClick={() => {
            setView('releases')
            setSelected(null)
          }}
        >
          Releases
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'charts'}
          style={tab(view === 'charts')}
          onClick={() => setView('charts')}
        >
          Chart repos
        </button>
      </div>
      {view === 'charts' && <ChartRepoBrowse client={client} />}
      {view === 'releases' && !selected && (
        <ReleaseList releases={releases} onSelect={setSelected} />
      )}
      {view === 'releases' && selected && (
        <>
          <button
            type="button"
            onClick={() => setSelected(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--brand-600)',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Back to releases
          </button>
          <ReleaseDetail client={client} namespace={selected.namespace} name={selected.name} />
        </>
      )}
    </section>
  )
}
