import type { K8sObject } from '../../contract/types'
import { getPath } from '../../table/columns'

export type RunPhase = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Cancelled'
export type StepPhase = 'Running' | 'Succeeded' | 'Failed' | 'Pending'

export interface TknCondition {
  type: string
  status: string
  reason?: string
  message?: string
}
export interface TknStep {
  name: string
  container: string
  terminated?: { reason?: string; exitCode?: number }
  running?: Record<string, unknown>
}
export interface TknNamedValue {
  name: string
  value: string
}
export interface ChildReference {
  name: string
  kind?: string
  pipelineTaskName?: string
}
export interface Stage {
  name: string
  status: string
  duration?: string
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

export function runStatus(obj: K8sObject): RunPhase {
  const cond = arr<TknCondition>(getPath(obj, 'status.conditions')).find(
    (c) => c.type === 'Succeeded',
  )
  if (!cond) return 'Pending'
  if (cond.status === 'True') return 'Succeeded'
  if (cond.status === 'False') return /cancel/i.test(cond.reason ?? '') ? 'Cancelled' : 'Failed'
  return 'Running'
}

export function stepPhase(step: Partial<TknStep>): StepPhase {
  if (step.terminated) return (step.terminated.exitCode ?? 0) === 0 ? 'Succeeded' : 'Failed'
  if (step.running) return 'Running'
  return 'Pending'
}

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

export function durationStr(
  startTime?: string,
  completionTime?: string,
  now: number = Date.now(),
): string | undefined {
  if (!startTime) return undefined
  const start = Date.parse(startTime)
  if (Number.isNaN(start)) return undefined
  const end = completionTime ? Date.parse(completionTime) : now
  if (Number.isNaN(end)) return undefined
  return fmtDuration(end - start)
}

export function taskRunFor(
  run: K8sObject,
  pipelineTaskName: string,
  taskRuns: K8sObject[],
): K8sObject | undefined {
  const ref = arr<ChildReference>(getPath(run, 'status.childReferences')).find(
    (c) => c.pipelineTaskName === pipelineTaskName,
  )
  if (!ref) return undefined
  return taskRuns.find(
    (t) =>
      t.metadata.name === ref.name &&
      (t.metadata.namespace ?? '') === (run.metadata.namespace ?? ''),
  )
}

function taskPhase(tr: K8sObject | undefined, runState: RunPhase): string {
  if (!tr) return runState === 'Running' ? 'Running' : 'Pending'
  const phase = runStatus(tr)
  if (phase === 'Pending') {
    return arr<TknStep>(getPath(tr, 'status.steps')).some((s) => s.running || s.terminated)
      ? 'Running'
      : 'Pending'
  }
  return phase
}

export function stagesFromRun(
  run: K8sObject,
  taskRuns: K8sObject[],
  pipelines: K8sObject[],
): Stage[] {
  const state = runStatus(run)
  const stages: Stage[] = arr<ChildReference>(getPath(run, 'status.childReferences')).map(
    (c, i) => {
      const name = c.pipelineTaskName ?? c.name ?? `task-${i + 1}`
      const tr = taskRunFor(run, name, taskRuns)
      return {
        name,
        status: taskPhase(tr, state),
        duration: tr
          ? durationStr(
              getPath(tr, 'status.startTime') as string | undefined,
              getPath(tr, 'status.completionTime') as string | undefined,
            )
          : undefined,
      }
    },
  )
  // Append not-yet-started tasks from the referenced Pipeline, if known.
  const ref = getPath(run, 'spec.pipelineRef.name')
  const pipeline = pipelines.find((p) => p.metadata.name === ref)
  const seen = new Set(stages.map((s) => s.name))
  for (const t of arr<{ name: string }>(getPath(pipeline ?? ({} as K8sObject), 'spec.tasks'))) {
    if (!seen.has(t.name)) {
      stages.push({
        name: t.name,
        status: state === 'Failed' || state === 'Cancelled' ? 'Skipped' : 'Pending',
      })
    }
  }
  return stages
}

export function steps(taskRun: K8sObject): { name: string; container: string; phase: string }[] {
  return arr<TknStep>(getPath(taskRun, 'status.steps')).map((s) => ({
    name: s.name,
    container: s.container,
    phase: stepPhase(s),
  }))
}

function namedValues(obj: K8sObject, path: string): TknNamedValue[] {
  return arr<{ name: string; value?: unknown }>(getPath(obj, path)).map((p) => ({
    name: p.name,
    value: typeof p.value === 'string' ? p.value : JSON.stringify(p.value ?? ''),
  }))
}

export function params(obj: K8sObject): TknNamedValue[] {
  return namedValues(obj, 'spec.params')
}

export function results(obj: K8sObject): TknNamedValue[] {
  return namedValues(obj, 'status.results')
}

export function workspaces(obj: K8sObject): { name: string }[] {
  return arr<{ name: string }>(getPath(obj, 'spec.workspaces')).map((w) => ({ name: w.name }))
}
