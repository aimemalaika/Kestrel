import { lazy, Suspense, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useResourceObject } from './useResourceObject'
import { DetailPanel } from './DetailPanel'
import { YamlView } from './YamlView'
import { EventsView } from './EventsView'
import { LogViewer } from '../streaming/LogViewer'
import { RelationsView } from './RelationsView'
import { PortForwardButton } from '../sessions/PortForwardButton'
import { DeleteButton } from '../write/DeleteButton'
import { useCanI } from '../write/useCanI'
import { TektonRunDetail } from '../modules/tekton/TektonRunDetail'
import { ArgoRichView } from '../modules/argo/ArgoRichView'
import type { ResourceRef } from '../client/Client'
import { Icon } from '../ui'

const YamlEditor = lazy(() => import('../write/YamlEditor'))
const Terminal = lazy(() => import('../streaming/Terminal'))

type Tab = 'detail' | 'yaml' | 'events' | 'logs' | 'terminal' | 'run' | 'app' | 'relations'

export function DetailDrawer() {
  const { namespace, group, version, resource, name } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('detail')
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    setEditing(false)
  }, [name, tab])
  const gvr = group && version && resource ? { group, version, resource } : undefined
  const { object, status } = useResourceObject(gvr, namespace, name)
  const isPod = object?.kind === 'Pod'
  const podRef: ResourceRef | undefined = gvr && name ? { ...gvr, namespace, name } : undefined
  const objRef: ResourceRef | undefined = gvr && name ? { ...gvr, namespace, name } : undefined
  const canUpdate = useCanI(objRef ? { verb: 'update', ...objRef } : undefined)
  const canDelete = useCanI(objRef ? { verb: 'delete', ...objRef } : undefined)
  const isPipelineRun = object?.kind === 'PipelineRun'
  const isApplication = object?.kind === 'Application'
  const tabs: Tab[] = isPod
    ? ['detail', 'yaml', 'events', 'relations', 'logs', 'terminal']
    : isPipelineRun
      ? ['detail', 'yaml', 'events', 'relations', 'run']
      : isApplication
        ? ['detail', 'yaml', 'events', 'relations', 'app']
        : ['detail', 'yaml', 'events', 'relations']
  // If the selected tab isn't available for the current object (e.g. after
  // navigating from a Pod/PipelineRun to another kind), fall back to detail so
  // the body never renders blank.
  useEffect(() => {
    if (!tabs.includes(tab)) setTab('detail')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.join(','), tab])

  return (
    <div
      role="dialog"
      aria-label={`${resource ?? ''} ${name ?? ''}`}
      className="fixed top-0 right-0 bottom-0 z-10 flex flex-col bg-[#161b27] border-l border-zinc-800/80 shadow-2xl w-[min(560px,90vw)]"
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-3 min-w-0">
          <strong className="text-sm font-semibold text-zinc-100 truncate">{name}</strong>
          {objRef && <DeleteButton target={objRef} disabled={!canDelete} />}
        </div>
        <button
          type="button"
          onClick={() => navigate('..')}
          aria-label="Close"
          className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded p-1.5 transition-colors"
        >
          <Icon name="close" className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1 px-5 py-2.5 border-b border-zinc-800/80">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`text-xs px-3 py-1 rounded capitalize transition-colors ${
              tab === t
                ? 'bg-brand/15 text-brand-fg border border-brand/30'
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent hover:bg-zinc-800'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-5">
        {status === 'loading' && <p className="text-sm text-zinc-500">Loading…</p>}
        {status === 'notfound' && <p className="text-sm text-zinc-500">{name} no longer exists.</p>}
        {status === 'error' && (
          <p className="text-sm text-zinc-500">Stream interrupted — resyncing…</p>
        )}
        {status === 'ready' && object && (
          <>
            {tab === 'detail' && (
              <>
                <DetailPanel object={object} />
                {isPod && podRef && (
                  <div className="mt-4">
                    <PortForwardButton target={podRef} />
                  </div>
                )}
              </>
            )}
            {tab === 'yaml' && (
              <>
                <div className="mb-3">
                  <button
                    type="button"
                    onClick={() => setEditing((v) => !v)}
                    disabled={!canUpdate}
                    className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-50"
                  >
                    {editing ? 'View' : 'Edit'}
                  </button>
                </div>
                {editing && objRef ? (
                  <Suspense fallback={<p className="text-sm text-zinc-500">Loading editor…</p>}>
                    <YamlEditor object={object} />
                  </Suspense>
                ) : (
                  <YamlView object={object} />
                )}
              </>
            )}
            {tab === 'events' && <EventsView object={object} />}
            {tab === 'relations' && <RelationsView object={object} />}
            {tab === 'run' && isPipelineRun && <TektonRunDetail object={object} />}
            {tab === 'app' && isApplication && <ArgoRichView object={object} />}
            {tab === 'logs' && isPod && podRef && <LogViewer pod={podRef} />}
            {tab === 'terminal' && isPod && podRef ? (
              <Suspense fallback={<p className="text-sm text-zinc-500">Loading terminal…</p>}>
                <Terminal pod={podRef} />
              </Suspense>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
