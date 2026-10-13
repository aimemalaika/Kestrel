import type { K8sObject } from '../../contract/types'
import { getPath } from '../../table/columns'
import { StatusBadge } from '../../ui'

type Rec = Record<string, unknown>

const list = (v: unknown): Rec[] =>
  Array.isArray(v) ? v.filter((x): x is Rec => !!x && typeof x === 'object') : []

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">
        {title}
      </h3>
      {children}
    </section>
  )
}

function readyPhase(c: Rec | undefined): string {
  if (!c) return 'Unknown'
  if (c.status === 'True') return 'Ready'
  if (c.status === 'False') return 'NotReady'
  return 'Unknown'
}

export function EventListenerDetail({ object }: { object: K8sObject }) {
  const url = getPath(object, 'status.address.url') as string | undefined
  const ready = list(getPath(object, 'status.conditions')).find((c) => c.type === 'Ready')
  const triggers = list(getPath(object, 'spec.triggers'))
  const reasonMsg = [ready?.reason, ready?.message].filter(Boolean).join(': ')

  return (
    <div className="text-zinc-200">
      <Section title="Sink">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs break-all">{url ?? '—'}</span>
          <StatusBadge status={readyPhase(ready)} />
        </div>
      </Section>

      <Section title="Triggers">
        {triggers.length === 0 ? (
          <p className="text-xs text-zinc-500 m-0">No triggers</p>
        ) : (
          <ul className="m-0 p-0 list-none space-y-2">
            {triggers.map((t, i) => {
              const tmpl = (t.template as Rec | undefined)?.ref as string | undefined
              const bindings = list(t.bindings)
                .map((b) => b.ref)
                .filter(Boolean)
                .join(', ')
              const interceptors = list(t.interceptors)
                .map((x) => (x.ref as Rec | undefined)?.name)
                .filter(Boolean)
                .join(', ')
              return (
                <li key={`${String(t.name)}-${i}`} className="text-xs">
                  <div className="font-medium text-zinc-200">
                    {String(t.name ?? `trigger-${i}`)}
                  </div>
                  <dl className="m-0 mt-1 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
                    <dt className="text-zinc-500">Template</dt>
                    <dd className="m-0 break-all">{tmpl ?? '—'}</dd>
                    <dt className="text-zinc-500">Bindings</dt>
                    <dd className="m-0 break-all">{bindings || '—'}</dd>
                    {interceptors && (
                      <>
                        <dt className="text-zinc-500">Interceptors</dt>
                        <dd className="m-0 break-all">{interceptors}</dd>
                      </>
                    )}
                  </dl>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Section title="Status">
        {reasonMsg ? (
          <p className="text-xs text-zinc-300 m-0">{reasonMsg}</p>
        ) : (
          <p className="text-xs text-zinc-500 m-0">No Ready condition</p>
        )}
      </Section>
    </div>
  )
}
