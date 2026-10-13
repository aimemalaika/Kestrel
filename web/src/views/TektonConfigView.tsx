import { useResourceStream } from '../table/useResourceStream'
import { Age } from '../table/Age'
import { getPath } from '../table/columns'
import type { K8sObject } from '../contract/types'
import { StatusBadge, Table, TR, TD, Mono, ViewHeader } from '../ui'

// Tekton component CRs managed by the operator. Kept in one place so the merged list is stable.
const GROUP = 'operator.tekton.dev'
const VERSION = 'v1alpha1'
const gvr = (resource: string) => ({ group: GROUP, version: VERSION, resource })

interface Condition {
  type: string
  status: string
  message?: string
  lastTransitionTime?: string
}

function conds(o: K8sObject): Condition[] {
  const c = getPath(o, 'status.conditions')
  return Array.isArray(c) ? (c as Condition[]) : []
}

function condOf(o: K8sObject, type: string): Condition | undefined {
  return conds(o).find((c) => c.type === type)
}

const isTrue = (c?: Condition) => c?.status === 'True'

type Health = 'Ready' | 'NotReady' | 'Installing'

function healthOf(o: K8sObject): Health {
  const ready = condOf(o, 'Ready')
  if (isTrue(ready)) return 'Ready'
  if (!ready || condOf(o, 'InstallSucceeded')?.status === 'False') return 'Installing'
  return 'NotReady'
}

const HEALTH_LABEL: Record<Health, string> = {
  Ready: 'Ready',
  NotReady: 'Not Ready',
  Installing: 'Installing',
}

const TILES: { label: Health; color: string; bg: string }[] = [
  { label: 'Ready', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  { label: 'NotReady', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  { label: 'Installing', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
]

export function TektonConfigView() {
  // One stream per component resource — explicit calls keep hook order stable
  // (the rules of hooks forbid calling hooks in a loop).
  const configs = useResourceStream(gvr('tektonconfigs'), undefined)
  const pipelines = useResourceStream(gvr('tektonpipelines'), undefined)
  const triggers = useResourceStream(gvr('tektontriggers'), undefined)
  const chains = useResourceStream(gvr('tektonchains'), undefined)
  const results = useResourceStream(gvr('tektonresults'), undefined)
  const dashboards = useResourceStream(gvr('tektondashboards'), undefined)
  const components = [configs, pipelines, triggers, chains, results, dashboards].flatMap(
    (s) => s.rows,
  )
  const counts: Record<Health, number> = { Ready: 0, NotReady: 0, Installing: 0 }
  for (const c of components) counts[healthOf(c)]++
  return (
    <div>
      <ViewHeader title="Tekton Config" />
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {TILES.map((t) => (
            <div key={t.label} className={`border rounded-xl p-4 flex items-center gap-3 ${t.bg}`}>
              <p className={`text-2xl font-bold ${t.color}`} data-testid={`tile-${t.label}`}>
                {counts[t.label]}
              </p>
              <p className="text-xs text-zinc-400">{HEALTH_LABEL[t.label]} components</p>
            </div>
          ))}
        </div>
        <Table
          aria-label="Tekton components"
          headers={['Name', 'Version', 'Ready', 'Message', 'Age']}
        >
          {components.map((o) => {
            const ready = condOf(o, 'Ready')
            const version = getPath(o, 'status.version')
            return (
              <TR key={`${o.kind}/${o.metadata.name}`}>
                <TD>
                  <Mono>{o.kind}</Mono>
                </TD>
                <TD>
                  <Mono>{typeof version === 'string' && version ? version : '-'}</Mono>
                </TD>
                <TD>
                  <StatusBadge status={ready ? ready.status : 'Unknown'} />
                </TD>
                <TD>
                  {ready?.message ? (
                    <span className="text-xs text-amber-400">{ready.message}</span>
                  ) : (
                    <span className="text-xs text-zinc-700">-</span>
                  )}
                </TD>
                <TD>
                  <span className="text-xs text-zinc-500">
                    <Age
                      creationTimestamp={ready?.lastTransitionTime ?? o.metadata.creationTimestamp}
                    />
                  </span>
                </TD>
              </TR>
            )
          })}
        </Table>
      </div>
    </div>
  )
}
