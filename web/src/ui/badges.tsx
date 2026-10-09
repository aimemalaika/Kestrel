// A single tone per status drives BOTH the badge style and the dot, so the two
// can never drift (an unmapped status no longer gets a red "failure" dot on a
// neutral badge). Tones cover the values web/'s live data actually emits:
// Pod phases, node conditions, Argo sync/health, Tekton/Helm statuses, event types.
type Tone = 'ok' | 'warn' | 'info' | 'risk' | 'neutral' | 'blue'

const TONE_BADGE: Record<Tone, string> = {
  ok: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warn: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  info: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  risk: 'bg-red-500/15 text-red-400 border-red-500/30',
  neutral: 'bg-zinc-700/40 text-zinc-400 border-zinc-600/40',
  blue: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
}

const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-emerald-400',
  warn: 'bg-amber-400',
  info: 'bg-sky-400',
  risk: 'bg-red-400',
  neutral: 'bg-zinc-500',
  blue: 'bg-blue-400',
}

const STATUS_TONE: Record<string, Tone> = {
  // Pod / workload phases
  Running: 'ok',
  Completed: 'blue',
  Complete: 'ok',
  CrashLoopBackOff: 'risk',
  Pending: 'warn',
  Installing: 'info',
  Terminating: 'warn',
  ContainerCreating: 'warn',
  OOMKilled: 'risk',
  ImagePullBackOff: 'risk',
  Failed: 'risk',
  Cancelled: 'neutral',
  Succeeded: 'ok',
  // Node conditions / scheduling
  Ready: 'ok',
  NotReady: 'risk',
  SchedulingDisabled: 'warn',
  // Volumes
  Bound: 'ok',
  Released: 'neutral',
  Available: 'info',
  Lost: 'risk',
  // Generic / Argo / Tekton / Helm
  Active: 'ok',
  Degraded: 'risk',
  Synced: 'ok',
  OutOfSync: 'warn',
  Healthy: 'ok',
  Progressing: 'info',
  Accepted: 'ok',
  Rejected: 'risk',
  deployed: 'ok',
  failed: 'risk',
  'pending-upgrade': 'warn',
  Firing: 'risk',
  Skipped: 'neutral',
  New: 'info',
  // Condition booleans
  True: 'ok',
  False: 'risk',
  // Event types
  Normal: 'info',
  Warning: 'warn',
  // Fallthroughs seen in the wild
  Error: 'risk',
  Unknown: 'neutral',
}

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral'
  const style = TONE_BADGE[tone]
  const dot = TONE_DOT[tone]
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${style}`}
    >
      <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {status}
    </span>
  )
}

const SEV_STYLES: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/40',
  warning: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  info: 'bg-sky-500/20 text-sky-400 border-sky-500/40',
}

export function SeverityBadge({ sev }: { sev: string }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-widest ${SEV_STYLES[sev] ?? 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40'}`}
    >
      {sev}
    </span>
  )
}

const ROLE_STYLES: Record<string, string> = {
  'control-plane': 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  master: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  worker: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold border uppercase tracking-wider ${ROLE_STYLES[role] ?? 'bg-zinc-700/40 text-zinc-400 border-zinc-600'}`}
    >
      {role}
    </span>
  )
}
