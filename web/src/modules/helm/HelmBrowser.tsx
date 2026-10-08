import { useEffect, useMemo, useState } from 'react'
import { createHelmClient, type HelmClient, type Release } from './HelmClient'
import { ReleaseList } from './ReleaseList'
import { ReleaseDetail } from './ReleaseDetail'
import { ChartRepoBrowse } from './ChartRepoBrowse'
import { Icon, PrimaryBtn, ViewHeader } from '../../ui'

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

  const tabCls = (active: boolean) =>
    `px-3 py-2 text-xs bg-transparent border-0 border-b-2 cursor-pointer transition-colors ${
      active ? 'border-brand text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'
    }`

  return (
    <section className="p-6 text-zinc-200">
      <ViewHeader
        title="Helm Releases"
        count={releases.length}
        action={
          <PrimaryBtn>
            <Icon name="plus" className="w-3.5 h-3.5" />
            Install Chart
          </PrimaryBtn>
        }
      />
      <div role="tablist" className="mb-4 flex border-b border-zinc-800">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'releases'}
          className={tabCls(view === 'releases')}
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
          className={tabCls(view === 'charts')}
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
            className="mb-3 bg-transparent border-0 p-0 text-xs text-brand-fg cursor-pointer hover:underline"
          >
            Back to releases
          </button>
          <ReleaseDetail client={client} namespace={selected.namespace} name={selected.name} />
        </>
      )}
    </section>
  )
}
