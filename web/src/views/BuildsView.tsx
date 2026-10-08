import { useState } from 'react'
import { useResourceStream } from '../table/useResourceStream'
import { Age } from '../table/Age'
import { getPath } from '../table/columns'
import type { K8sObject } from '../contract/types'
import { EmptyState, Icon, Mono, StatusBadge, Table, TD, TR, ViewHeader } from '../ui'

const BUILDS = { group: 'build.openshift.io', version: 'v1', resource: 'builds' }
const BUILD_CONFIGS = { group: 'build.openshift.io', version: 'v1', resource: 'buildconfigs' }
const IMAGE_STREAMS = { group: 'image.openshift.io', version: 'v1', resource: 'imagestreams' }

const TABS = ['Builds', 'BuildConfigs', 'ImageStreams']
const STATUS_ORDER: Record<string, number> = {
  Running: 0,
  Failed: 1,
  Complete: 2,
  Cancelled: 3,
  New: 4,
}

const str = (o: K8sObject, path: string): string => {
  const v = getPath(o, path)
  return typeof v === 'string' || typeof v === 'number' ? String(v) : ''
}

function duration(b: K8sObject): string {
  const d = getPath(b, 'status.duration')
  if (typeof d === 'string' && d) return d
  const start = Date.parse(str(b, 'status.startTimestamp'))
  if (Number.isNaN(start)) return '—'
  const endRaw = Date.parse(str(b, 'status.completionTimestamp'))
  const secs = Math.max(
    0,
    Math.round(((Number.isNaN(endRaw) ? Date.now() : endRaw) - start) / 1000),
  )
  const m = Math.floor(secs / 60)
  return m > 0 ? `${m}m ${secs % 60}s` : `${secs}s`
}

const TRIGGER_CLASS: Record<string, string> = {
  Webhook: 'text-sky-400 bg-sky-500/10',
  Manual: 'text-zinc-400 bg-zinc-700/40',
}

function TriggerChip({ trigger }: { trigger: string }) {
  if (!trigger) return <span className="text-xs text-zinc-600">—</span>
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded ${TRIGGER_CLASS[trigger] ?? 'text-violet-400 bg-violet-500/10'}`}
    >
      {trigger}
    </span>
  )
}

const cell = 'text-xs text-zinc-400'

export function BuildsView() {
  const [tab, setTab] = useState('Builds')
  const builds = useResourceStream(BUILDS, undefined).rows
  const configs = useResourceStream(BUILD_CONFIGS, undefined).rows
  const streams = useResourceStream(IMAGE_STREAMS, undefined).rows

  const sorted = [...builds].sort(
    (a, b) =>
      (STATUS_ORDER[str(a, 'status.phase')] ?? 9) - (STATUS_ORDER[str(b, 'status.phase')] ?? 9) ||
      a.metadata.name.localeCompare(b.metadata.name),
  )
  const count =
    tab === 'Builds' ? sorted.length : tab === 'BuildConfigs' ? configs.length : streams.length

  return (
    <div>
      <ViewHeader title="Builds" count={count} tabs={TABS} activeTab={tab} onTab={setTab} />
      {tab === 'Builds' && (
        <Table
          aria-label="Builds"
          headers={[
            'Name',
            'Build Config',
            'Namespace',
            'Status',
            'Triggered',
            'Commit',
            'Duration',
            'Age',
          ]}
        >
          {sorted.map((b) => (
            <TR key={`${b.metadata.namespace}/${b.metadata.name}`}>
              <TD>
                <Mono>{b.metadata.name}</Mono>
              </TD>
              <TD>
                <span className={cell}>{str(b, 'metadata.labels.buildconfig') || '—'}</span>
              </TD>
              <TD>
                <span className={cell}>{b.metadata.namespace}</span>
              </TD>
              <TD>
                <StatusBadge status={str(b, 'status.phase') || 'Unknown'} />
              </TD>
              <TD>
                <TriggerChip trigger={str(b, 'spec.triggeredBy')} />
              </TD>
              <TD>
                <span className="text-xs font-mono text-zinc-500">
                  {str(b, 'spec.commit').slice(0, 7) || '—'}
                </span>
              </TD>
              <TD>
                <span className="text-xs tabular-nums text-zinc-400">{duration(b)}</span>
              </TD>
              <TD>
                <span className="text-xs text-zinc-500">
                  <Age creationTimestamp={b.metadata.creationTimestamp} />
                </span>
              </TD>
            </TR>
          ))}
        </Table>
      )}
      {tab === 'BuildConfigs' && (
        <Table
          aria-label="BuildConfigs"
          headers={['Name', 'Namespace', 'Build Strategy', 'Source', 'Last Version', 'Age']}
        >
          {configs.map((c) => (
            <TR key={`${c.metadata.namespace}/${c.metadata.name}`}>
              <TD>
                <Mono>{c.metadata.name}</Mono>
              </TD>
              <TD>
                <span className={cell}>{c.metadata.namespace}</span>
              </TD>
              <TD>
                <span className={cell}>{str(c, 'spec.strategy.type') || '—'}</span>
              </TD>
              <TD>
                <span className={cell}>{str(c, 'spec.source.type') || '—'}</span>
              </TD>
              <TD>
                <span className="text-xs font-mono text-zinc-500">
                  {str(c, 'status.lastVersion') ? `#${str(c, 'status.lastVersion')}` : '—'}
                </span>
              </TD>
              <TD>
                <span className="text-xs text-zinc-500">
                  <Age creationTimestamp={c.metadata.creationTimestamp} />
                </span>
              </TD>
            </TR>
          ))}
        </Table>
      )}
      {tab === 'ImageStreams' &&
        (streams.length === 0 ? (
          <EmptyState
            icon="image"
            title="No ImageStreams found in selected namespace"
            hint="ImageStreams are created automatically from BuildConfigs"
          />
        ) : (
          <Table
            aria-label="ImageStreams"
            headers={['Name', 'Namespace', 'Repository', 'Tags', 'Age']}
          >
            {streams.map((s) => {
              const tags = getPath(s, 'status.tags')
              const names = Array.isArray(tags)
                ? tags.map((t) => String((t as { tag?: string }).tag ?? '')).filter(Boolean)
                : []
              return (
                <TR key={`${s.metadata.namespace}/${s.metadata.name}`}>
                  <TD>
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name="image" className="w-3.5 h-3.5 text-zinc-500" />
                      <Mono>{s.metadata.name}</Mono>
                    </span>
                  </TD>
                  <TD>
                    <span className={cell}>{s.metadata.namespace}</span>
                  </TD>
                  <TD>
                    <span className="text-xs font-mono text-zinc-500">
                      {str(s, 'status.dockerImageRepository') || '—'}
                    </span>
                  </TD>
                  <TD>
                    <span className={cell}>{names.join(', ') || '—'}</span>
                  </TD>
                  <TD>
                    <span className="text-xs text-zinc-500">
                      <Age creationTimestamp={s.metadata.creationTimestamp} />
                    </span>
                  </TD>
                </TR>
              )
            })}
          </Table>
        ))}
    </div>
  )
}
